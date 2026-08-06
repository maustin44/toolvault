#!/usr/bin/env python3
"""
DefectDojo Setup — Dynamic Engagement Manager.

For each scan run, finds or creates a DefectDojo engagement named after
the target repository. Uploads all scan results to that engagement so
findings from different repos never mix.

Environment variables required:
  DEFECTDOJO_URL
  DEFECTDOJO_API_KEY
  TARGET_REPOSITORY   (e.g. OWASP/crAPI)
  SCAN_RESULTS_DIR    (default: scan-results/)

Outputs:
  reports/engagement_id.txt  — the engagement ID used for this scan
"""

import os
import sys
import json
import requests
from pathlib import Path

DEFECTDOJO_URL     = os.environ.get('DEFECTDOJO_URL', '').rstrip('/')
DEFECTDOJO_API_KEY = os.environ.get('DEFECTDOJO_API_KEY', '')
TARGET_REPOSITORY  = os.environ.get('TARGET_REPOSITORY', 'unknown/repo')
SCAN_RESULTS_DIR   = Path(os.environ.get('SCAN_RESULTS_DIR', 'scan-results'))
PRODUCT_NAME       = 'ToolVault Scans'


def dd_headers():
    return {
        'Authorization': f'Token {DEFECTDOJO_API_KEY}',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }


def get_or_create_product():
    """Find or create the ToolVault product in DefectDojo."""
    r = requests.get(
        f'{DEFECTDOJO_URL}/api/v2/products/',
        headers=dd_headers(),
        params={'name': PRODUCT_NAME, 'limit': 1},
        timeout=30
    )
    r.raise_for_status()
    results = r.json().get('results', [])
    if results:
        pid = results[0]['id']
        print(f'[setup] Using existing product: {PRODUCT_NAME} (id={pid})')
        return pid

    # Create the product
    r = requests.post(
        f'{DEFECTDOJO_URL}/api/v2/products/',
        headers=dd_headers(),
        json={
            'name': PRODUCT_NAME,
            'description': 'Automated scans managed by ToolVault DevSecOps Pipeline',
            'prod_type': 1
        },
        timeout=30
    )
    r.raise_for_status()
    pid = r.json()['id']
    print(f'[setup] Created product: {PRODUCT_NAME} (id={pid})')
    return pid


def get_or_create_engagement(product_id):
    """Find or create an engagement named after the target repository."""
    engagement_name = TARGET_REPOSITORY

    r = requests.get(
        f'{DEFECTDOJO_URL}/api/v2/engagements/',
        headers=dd_headers(),
        params={'name': engagement_name, 'product': product_id, 'limit': 1},
        timeout=30
    )
    r.raise_for_status()
    results = r.json().get('results', [])
    if results:
        eid = results[0]['id']
        print(f'[setup] Using existing engagement: {engagement_name} (id={eid})')
        return eid

    # Create a new engagement for this repo
    from datetime import date, timedelta
    today = date.today().isoformat()
    end   = (date.today() + timedelta(days=365)).isoformat()

    r = requests.post(
        f'{DEFECTDOJO_URL}/api/v2/engagements/',
        headers=dd_headers(),
        json={
            'name': engagement_name,
            'product': product_id,
            'target_start': today,
            'target_end': end,
            'status': 'In Progress',
            'engagement_type': 'CI/CD',
            'description': f'Automated security scans of {TARGET_REPOSITORY} via ToolVault'
        },
        timeout=30
    )
    r.raise_for_status()
    eid = r.json()['id']
    print(f'[setup] Created engagement: {engagement_name} (id={eid})')
    return eid


def upload_scan(engagement_id, file_path, scan_type):
    """Upload a single scan file to DefectDojo."""
    if not file_path.exists():
        print(f'[setup] Skipping {scan_type} — file not found: {file_path}')
        return
    print(f'[setup] Uploading {scan_type}...')
    with open(file_path, 'rb') as f:
        r = requests.post(
            f'{DEFECTDOJO_URL}/api/v2/import-scan/',
            headers={'Authorization': f'Token {DEFECTDOJO_API_KEY}'},
            data={'scan_type': scan_type, 'engagement': engagement_id},
            files={'file': (file_path.name, f, 'application/json')},
            timeout=60
        )
    if r.status_code in (200, 201):
        print(f'[setup] Uploaded {scan_type} successfully')
    else:
        print(f'[setup] Warning: {scan_type} upload returned {r.status_code}: {r.text[:200]}')


def main():
    if not DEFECTDOJO_URL or not DEFECTDOJO_API_KEY:
        print('[setup] DefectDojo credentials not set — skipping')
        sys.exit(0)

    print(f'[setup] Target repository: {TARGET_REPOSITORY}')

    # Find or create product and engagement
    product_id    = get_or_create_product()
    engagement_id = get_or_create_engagement(product_id)

    # Save engagement ID for the triage agent to read
    Path('reports').mkdir(exist_ok=True)
    Path('reports/engagement_id.txt').write_text(str(engagement_id))
    print(f'[setup] Engagement ID {engagement_id} written to reports/engagement_id.txt')

    # Upload all scan results to this engagement
    scans = [
        (SCAN_RESULTS_DIR / 'trivy.json',     'Trivy Scan'),
        (SCAN_RESULTS_DIR / 'semgrep.json',   'Semgrep JSON Report'),
        (SCAN_RESULTS_DIR / 'gitleaks.json',  'Gitleaks Scan'),
        (SCAN_RESULTS_DIR / 'checkov.json',   'Checkov Scan'),
        (SCAN_RESULTS_DIR / 'npm-audit.json', 'NPM Audit Scan'),
    ]
    for file_path, scan_type in scans:
        upload_scan(engagement_id, file_path, scan_type)

    print('[setup] Done.')


if __name__ == '__main__':
    main()
