#!/usr/bin/env bash
#
# Run the ToolVault scanner suite locally against a target repository,
# then upload to DefectDojo, triage with Claude, and generate a report.
#
# Usage:
#   ./scripts/local-scan.sh <target-repo-url-or-path> [dast-url]
#
# Examples:
#   ./scripts/local-scan.sh https://github.com/OWASP/crAPI
#   ./scripts/local-scan.sh ../some-local-project
#   ./scripts/local-scan.sh https://github.com/juice-shop/juice-shop http://localhost:3000
#
# Requires: docker, python3. Reads credentials from .env.

set -uo pipefail

TARGET="${1:-}"
DAST_URL="${2:-}"

if [[ -z "$TARGET" ]]; then
    echo "usage: $0 <target-repo-url-or-path> [dast-url]" >&2
    exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$ROOT/.scan-workspace"
RESULTS="$ROOT/scan-results"
REPORTS="$ROOT/reports"

# shellcheck disable=SC1091
[[ -f "$ROOT/.env" ]] && set -a && source "$ROOT/.env" && set +a

rm -rf "$WORK" && mkdir -p "$WORK" "$RESULTS" "$REPORTS"

# ── Fetch the target ──────────────────────────────────────────────
if [[ "$TARGET" =~ ^https?:// ]]; then
    echo "==> Cloning $TARGET"
    git clone --depth 1 "$TARGET" "$WORK/src" 2>&1 | tail -1
    TARGET_NAME="$(basename "${TARGET%.git}")"
else
    echo "==> Copying $TARGET"
    cp -R "$TARGET" "$WORK/src"
    TARGET_NAME="$(basename "$(cd "$TARGET" && pwd)")"
fi

SRC="$WORK/src"
echo "==> Target: $TARGET_NAME"

# Scanners run in containers so nothing needs installing on the host.
# Each is allowed to fail without stopping the run — a missing result
# is better than an aborted scan.
run() { echo "--> $1"; shift; "$@" >/dev/null 2>&1 || echo "    (completed with findings or errors)"; }

echo
echo "==> Running scanners"

run "semgrep (SAST)" docker run --rm -v "$SRC:/src" -v "$RESULTS:/out" \
    returntocorp/semgrep semgrep scan --config auto --json -o /out/semgrep.json /src

run "trivy (dependencies)" docker run --rm -v "$SRC:/src" -v "$RESULTS:/out" \
    aquasec/trivy:latest fs /src --format json --output /out/trivy.json

run "gitleaks (secrets)" docker run --rm -v "$SRC:/src" -v "$RESULTS:/out" \
    zricethezav/gitleaks detect --source=/src --report-format json --report-path /out/gitleaks.json --no-git

run "checkov (IaC)" docker run --rm -v "$SRC:/src" -v "$RESULTS:/out" \
    bridgecrew/checkov -d /src --output json --output-file-path /out/checkov.json

if [[ -f "$SRC/package.json" ]]; then
    run "npm audit" docker run --rm -v "$SRC:/src" -w /src -v "$RESULTS:/out" \
        node:20-alpine sh -c "npm install --ignore-scripts --package-lock-only && npm audit --json > /out/npm-audit.json"
else
    echo '{}' > "$RESULTS/npm-audit.json"
fi

if [[ -n "$DAST_URL" ]]; then
    echo "--> owasp zap (DAST against $DAST_URL)"
    docker run --rm --network host -v "$RESULTS:/zap/wrk/:rw" \
        ghcr.io/zaproxy/zaproxy:stable zap-full-scan.py \
        -t "$DAST_URL" -J zap-report.json -m 5 -I >/dev/null 2>&1 || true
else
    echo "--> owasp zap skipped (no DAST url given)"
fi

# Normalise any missing outputs so the upload step doesn't choke
for f in semgrep trivy gitleaks checkov npm-audit; do
    [[ -s "$RESULTS/$f.json" ]] || echo '{}' > "$RESULTS/$f.json"
done

echo
echo "==> Uploading to DefectDojo"
TARGET_REPOSITORY="$TARGET_NAME" SCAN_RESULTS_DIR="$RESULTS/" \
    python3 "$ROOT/ai-agent/defectdojo_setup.py"

echo
echo "==> AI triage"
TARGET_REPOSITORY="$TARGET_NAME" \
    python3 "$ROOT/ai-agent/context_triage_agent.py"

echo
echo "==> Generating report"
TARGET_REPOSITORY="$TARGET_NAME" REPORTS_DIR="$REPORTS/" \
    python3 "$ROOT/ai-agent/report_generator.py"

echo
echo "==> Done."
echo "    Findings:  http://localhost:8080"
echo "    Report:    $REPORTS/security-report.md"
echo
echo "    To open remediation PRs for confirmed findings:"
echo "      GITHUB_REPOSITORY=owner/repo python3 ai-agent/remediation_pr_agent.py"
