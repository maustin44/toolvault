#!/usr/bin/env python3
"""
AI Security Report Generator.

Reads scan results and asks Claude to write a narrative security report
focused on the repository that was scanned, not the pipeline itself.

Environment variables required:
  ANTHROPIC_API_KEY
  REPORTS_DIR        (default: reports/)
  TARGET_REPOSITORY  (e.g. OWASP/crAPI — used as the report subject)

Output:
  reports/security-report.md
"""

import os
import sys
import json
import requests
from pathlib import Path
from datetime import date

ANTHROPIC_API_KEY  = os.environ.get('ANTHROPIC_API_KEY', '')
REPORTS_DIR        = Path(os.environ.get('REPORTS_DIR', 'reports'))
TARGET_REPOSITORY  = os.environ.get('TARGET_REPOSITORY', 'Unknown Repository')
MODEL              = 'claude-sonnet-4-6'


def read_json(path):
    try:
        with open(path) as f: return json.load(f)
    except Exception: return None


def ask_claude(prompt):
    print(f'[report] Calling model: {MODEL}')
    r = requests.post(
        'https://api.anthropic.com/v1/messages',
        headers={'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
        json={'model': MODEL, 'max_tokens': 4096, 'messages': [{'role': 'user', 'content': prompt}]},
        timeout=120,
    )
    if r.status_code != 200:
        raise Exception(f'{r.status_code}: {r.text[:400]}')
    return r.json()['content'][0]['text']


def build_prompt(triage_summary, zap_data, npm_data, checkov_data, semgrep_data, trivy_data, gitleaks_data):
    today = date.today().isoformat()
    sections = []

    if triage_summary:
        v = triage_summary.get('verdicts', {})
        fl = triage_summary.get('findings', [])
        lines = ['## AI Triage Results', f"- Total findings reviewed: {triage_summary.get('total', 0)}",
                 f"- True positives (confirmed): {v.get('true_positive', 0)}",
                 f"- False positives (dismissed): {v.get('false_positive', 0)}",
                 f"- Needs manual review: {v.get('needs_review', 0)}", '']
        for f in fl[:20]:
            lines.append(f"- [{f.get('severity','?')}] {f.get('title','Unknown')} ({f.get('file_path','N/A')})")
        sections.append('\n'.join(lines))

    if zap_data:
        site = zap_data.get('site', [])
        alerts = site[0].get('alerts', []) if isinstance(site, list) and site else []
        lines = [f'## DAST Findings (OWASP ZAP) - {len(alerts)} alerts']
        for a in alerts[:10]: lines.append(f"- [{a.get('riskdesc','?')}] {a.get('alert','Unknown')}")
        sections.append('\n'.join(lines))

    if npm_data:
        meta = npm_data.get('metadata', {}).get('vulnerabilities', {})
        sections.append(f"## npm Dependency Audit\n- Critical: {meta.get('critical',0)} | High: {meta.get('high',0)} | Moderate: {meta.get('moderate',0)} | Low: {meta.get('low',0)}")

    if checkov_data:
        if isinstance(checkov_data, list):
            passed = sum(1 for r in checkov_data if isinstance(r, dict) and r.get('result') == 'passed')
            failed = sum(1 for r in checkov_data if isinstance(r, dict) and r.get('result') == 'failed')
            sections.append(f"## Checkov IaC Scan\n- Passed: {passed} | Failed: {failed}")
        else:
            s = checkov_data.get('summary', {})
            sections.append(f"## Checkov IaC Scan\n- Passed: {s.get('passed',0)} | Failed: {s.get('failed',0)} | Skipped: {s.get('skipped',0)}")

    if semgrep_data:
        results = semgrep_data.get('results', [])
        lines = [f'## Semgrep SAST - {len(results)} findings']
        for r in results[:10]:
            sev = r.get('extra', {}).get('severity', '?')
            rule = r.get('check_id', '?')
            path = r.get('path', '?')
            line = r.get('start', {}).get('line', '?')
            lines.append(f"- [{sev}] {rule} in {path}:{line}")
        sections.append('\n'.join(lines))

    if trivy_data:
        results = trivy_data.get('Results', [])
        vuln_count = sum(len(r.get('Vulnerabilities') or []) for r in results)
        lines = [f'## Trivy Filesystem/Dependency Scan - {vuln_count} vulnerabilities']
        for result in results[:5]:
            target = result.get('Target', '?')
            vulns = result.get('Vulnerabilities') or []
            if vulns:
                lines.append(f"- {target}: {len(vulns)} vulnerabilities")
                for v in vulns[:3]:
                    lines.append(f"  - [{v.get('Severity','?')}] {v.get('VulnerabilityID','?')} in {v.get('PkgName','?')} ({v.get('InstalledVersion','?')})")
        sections.append('\n'.join(lines))

    if gitleaks_data and isinstance(gitleaks_data, list):
        lines = [f'## Gitleaks Secret Scan - {len(gitleaks_data)} secrets found']
        for leak in gitleaks_data[:5]:
            rule = leak.get('RuleID', leak.get('rule', '?'))
            file = leak.get('File', leak.get('file', '?'))
            lines.append(f"- {rule} in {file}")
        sections.append('\n'.join(lines))

    data_block = '\n\n'.join(sections) if sections else 'No scan data available for this repository.'

    return f"""You are a senior security consultant writing a formal security assessment report.

Date: {today}
Target Repository: {TARGET_REPOSITORY}
Scanned by: ToolVault DevSecOps Pipeline (Group 3 Capstone)

IMPORTANT: This report is about the security posture of the repository "{TARGET_REPOSITORY}".
Write all findings, recommendations, and conclusions in the context of that specific repository.
Do NOT write about the ToolVault pipeline itself — focus entirely on what was found IN the target repository.

Scan data from {TARGET_REPOSITORY}:
{data_block}

Write a professional Markdown security report with these exact sections:
1. Executive Summary — non-technical overview of the security posture of {TARGET_REPOSITORY}
2. Methodology — what tools were run against {TARGET_REPOSITORY} and what they cover
3. Key Findings — all confirmed findings from {TARGET_REPOSITORY} organised by severity (High/Medium/Low)
4. Risk Assessment — overall risk rating for {TARGET_REPOSITORY} with a risk matrix table
5. Recommendations — prioritised remediation steps specific to the issues found in {TARGET_REPOSITORY}
6. Conclusion — summary of the security posture of {TARGET_REPOSITORY}

Include a findings summary table. Reference "{TARGET_REPOSITORY}" by name throughout the report.
Be concise, specific, and actionable. Focus only on what was actually found."""


def main():
    if not ANTHROPIC_API_KEY:
        print('[report] ANTHROPIC_API_KEY not set — skipping'); sys.exit(0)
    REPORTS_DIR.mkdir(exist_ok=True)

    print(f'[report] Generating security report for: {TARGET_REPOSITORY}')

    triage   = read_json(REPORTS_DIR / 'triage-summary.json')
    zap      = read_json(REPORTS_DIR / 'zap-report.json')
    npm      = read_json(REPORTS_DIR / 'npm-audit.json')
    checkov  = read_json(REPORTS_DIR / 'checkov.json')
    semgrep  = read_json(REPORTS_DIR / 'semgrep.json')
    trivy    = read_json(REPORTS_DIR / 'trivy.json')
    gitleaks = read_json(REPORTS_DIR / 'gitleaks.json')

    if not any([triage, zap, npm, checkov, semgrep, trivy, gitleaks]):
        print('[report] No scan data found — skipping'); sys.exit(0)

    print('[report] Generating report with Claude...')
    try:
        report = ask_claude(build_prompt(triage, zap, npm, checkov, semgrep, trivy, gitleaks))
    except Exception as e:
        print(f'[report] Failed: {e}'); sys.exit(1)

    out = REPORTS_DIR / 'security-report.md'
    out.write_text(report)
    print(f'[report] Written to {out} ({len(report)} chars)')
    print('[report] Done.')


if __name__ == '__main__':
    main()
