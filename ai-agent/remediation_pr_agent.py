#!/usr/bin/env python3
"""
Remediation PR Agent.

Reads triaged findings, asks Claude to produce a corrected version of each
affected file, then opens a single pull request containing the fixes.

Only findings triaged as true_positive with a remediation suggestion and a
known file path are considered. Nothing is merged automatically — the PR is
opened for human review.

Environment variables required:
  ANTHROPIC_API_KEY
  GITHUB_TOKEN               (needs write access to the target repository)
  GITHUB_REPOSITORY          (owner/repo to open the PR against)

Optional:
  REPORTS_DIR                (default reports/)
  MAX_FIXES                  (default 5)
  PR_DRAFT                   (default true — open as draft)
"""

import os
import sys
import json
import base64
import requests
from datetime import datetime
from pathlib import Path

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
GITHUB_TOKEN      = os.environ.get('GITHUB_TOKEN', '')
GITHUB_REPO       = os.environ.get('GITHUB_REPOSITORY', '')
REPORTS_DIR       = os.environ.get('REPORTS_DIR', 'reports/')
MODEL             = 'claude-sonnet-4-6'
MAX_FIXES         = int(os.environ.get('MAX_FIXES', '5'))
PR_DRAFT          = os.environ.get('PR_DRAFT', 'true').lower() != 'false'
MAX_FILE_BYTES    = 60000


def gh_headers():
    return {'Authorization': f'token {GITHUB_TOKEN}', 'Accept': 'application/vnd.github.v3+json'}


def check_write_access():
    """PRs can only be opened on repositories the token can push to."""
    r = requests.get(f'https://api.github.com/repos/{GITHUB_REPO}', headers=gh_headers(), timeout=15)
    if r.status_code != 200:
        print(f'[pr] Cannot read {GITHUB_REPO}: {r.status_code}')
        return None
    data = r.json()
    if not data.get('permissions', {}).get('push'):
        print(f'[pr] No write access to {GITHUB_REPO} — skipping PR creation.')
        print('[pr] (Expected when scanning an upstream repo such as OWASP/crAPI.)')
        return None
    return data.get('default_branch', 'main')


def load_candidates():
    summary = Path(REPORTS_DIR) / 'triage-summary.json'
    if not summary.exists():
        print(f'[pr] {summary} not found — nothing to do')
        return []
    data = json.loads(summary.read_text())
    out = []
    for f in data.get('findings', []):
        if f.get('verdict') != 'true_positive':
            continue
        if not f.get('file_path') or not f.get('remediation'):
            continue
        out.append(f)
    # Highest severity first
    order = {'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3, 'Info': 4}
    out.sort(key=lambda f: order.get(f.get('severity', 'Info'), 5))
    return out[:MAX_FIXES]


def get_file(path, ref):
    r = requests.get(
        f'https://api.github.com/repos/{GITHUB_REPO}/contents/{path}',
        headers=gh_headers(), params={'ref': ref}, timeout=20,
    )
    if r.status_code != 200:
        return None, None
    data = r.json()
    if data.get('size', 0) > MAX_FILE_BYTES:
        print(f'  [skip] {path} too large to rewrite safely ({data["size"]} bytes)')
        return None, None
    try:
        content = base64.b64decode(data['content']).decode('utf-8')
    except (UnicodeDecodeError, KeyError):
        return None, None
    return content, data['sha']


def ask_claude_for_fix(finding, source):
    prompt = f"""You are a senior application security engineer applying a fix to source code.

Finding:
- Title: {finding.get('title')}
- Severity: {finding.get('severity')}
- File: {finding.get('file_path')}
- Line: {finding.get('line')}
- Suggested remediation: {finding.get('remediation')}

Current file contents:
```
{source}
```

Rewrite the file to fix ONLY this vulnerability. Preserve all existing
behaviour, formatting, and comments that are unrelated to the fix. Make the
smallest change that resolves the issue. If the fix is not safe to apply
automatically, or you cannot fix it without broader refactoring, set
"applied" to false and leave "fixed_content" empty.

Respond ONLY in this exact JSON format (no markdown, no explanation):
{{"applied":true,"fixed_content":"<the complete corrected file>","summary":"one line describing the change"}}"""

    r = requests.post(
        'https://api.anthropic.com/v1/messages',
        headers={'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
        json={'model': MODEL, 'max_tokens': 8192, 'messages': [{'role': 'user', 'content': prompt}]},
        timeout=180,
    )
    if r.status_code != 200:
        raise Exception(f'{r.status_code}: {r.text[:300]}')
    content = r.json()['content'][0]['text'].strip()
    if content.startswith('```'):
        content = content.split('```')[1]
        if content.startswith('json'):
            content = content[4:]
    return json.loads(content.strip())


def create_branch(base_branch):
    r = requests.get(f'https://api.github.com/repos/{GITHUB_REPO}/git/ref/heads/{base_branch}',
                     headers=gh_headers(), timeout=20)
    r.raise_for_status()
    base_sha = r.json()['object']['sha']
    branch = f'toolvault/remediation-{datetime.utcnow().strftime("%Y%m%d-%H%M%S")}'
    r = requests.post(
        f'https://api.github.com/repos/{GITHUB_REPO}/git/refs',
        headers=gh_headers(), json={'ref': f'refs/heads/{branch}', 'sha': base_sha}, timeout=20,
    )
    r.raise_for_status()
    return branch


def commit_file(branch, path, content, sha, message):
    r = requests.put(
        f'https://api.github.com/repos/{GITHUB_REPO}/contents/{path}',
        headers=gh_headers(),
        json={
            'message': message,
            'content': base64.b64encode(content.encode('utf-8')).decode('ascii'),
            'sha': sha,
            'branch': branch,
        },
        timeout=30,
    )
    return r.status_code in (200, 201)


def open_pr(branch, base_branch, applied):
    lines = ['## Automated remediation', '',
             'Fixes proposed by the ToolVault triage pipeline for findings confirmed as true positives.',
             '', '| Severity | Finding | File | Change |', '|---|---|---|---|']
    for f, summary in applied:
        lines.append(f'| {f.get("severity","?")} | {f.get("title","?")[:60]} | `{f.get("file_path")}` | {summary} |')
    lines += ['', '---', '',
              '**Review before merging.** These changes were generated automatically and have not been tested. ',
              'Verify that behaviour is preserved and that the underlying issue is actually resolved.']

    r = requests.post(
        f'https://api.github.com/repos/{GITHUB_REPO}/pulls',
        headers=gh_headers(),
        json={
            'title': f'Automated remediation: {len(applied)} confirmed finding(s)',
            'head': branch,
            'base': base_branch,
            'body': '\n'.join(lines),
            'draft': PR_DRAFT,
        },
        timeout=30,
    )
    if r.status_code not in (200, 201):
        print(f'[pr] PR creation failed: {r.status_code} {r.text[:300]}')
        return None
    return r.json().get('html_url')


def main():
    if not ANTHROPIC_API_KEY:
        print('[pr] ANTHROPIC_API_KEY not set — skipping'); sys.exit(0)
    if not GITHUB_TOKEN or not GITHUB_REPO:
        print('[pr] GitHub credentials not set — skipping'); sys.exit(0)

    base_branch = check_write_access()
    if not base_branch:
        sys.exit(0)

    candidates = load_candidates()
    if not candidates:
        print('[pr] No true-positive findings with remediation available — nothing to fix')
        sys.exit(0)

    print(f'[pr] Repo: {GITHUB_REPO} (base: {base_branch})')
    print(f'[pr] {len(candidates)} finding(s) eligible for automated fix')

    branch = None
    applied = []

    for f in candidates:
        path = f['file_path']
        print(f'  [{f.get("severity","?")}] {f.get("title","?")[:60]} → {path}')
        try:
            source, sha = get_file(path, base_branch)
            if source is None:
                print('       → could not read file, skipping')
                continue

            result = ask_claude_for_fix(f, source)
            if not result.get('applied') or not result.get('fixed_content'):
                print('       → not safe to auto-fix, skipping')
                continue
            if result['fixed_content'].strip() == source.strip():
                print('       → no change produced, skipping')
                continue

            if branch is None:
                branch = create_branch(base_branch)
                print(f'[pr] Created branch {branch}')

            # Re-read on the branch so successive edits to one file stack correctly
            branch_source, branch_sha = get_file(path, branch)
            ok = commit_file(
                branch, path, result['fixed_content'], branch_sha or sha,
                f'Fix: {f.get("title","security finding")[:60]}',
            )
            if ok:
                print(f'       → committed: {result.get("summary","")}')
                applied.append((f, result.get('summary', 'fix applied')))
            else:
                print('       → commit failed')
        except Exception as e:
            print(f'       → error: {e}')

    if not applied:
        print('[pr] No fixes applied — no pull request opened')
        sys.exit(0)

    url = open_pr(branch, base_branch, applied)
    if url:
        print(f'[pr] Opened {"draft " if PR_DRAFT else ""}pull request: {url}')
        Path(REPORTS_DIR).mkdir(parents=True, exist_ok=True)
        with open(Path(REPORTS_DIR) / 'remediation-pr.json', 'w') as fh:
            json.dump({'pull_request': url, 'branch': branch,
                       'fixes': [{'title': f.get('title'), 'file_path': f.get('file_path'),
                                  'severity': f.get('severity'), 'summary': s} for f, s in applied]}, fh, indent=2)
    print('[pr] Done.')


if __name__ == '__main__':
    main()
