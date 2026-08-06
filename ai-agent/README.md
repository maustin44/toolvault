# AI Agent

The AI layer of ToolVault. Three scripts that run in sequence after the scanners finish: they organise findings in DefectDojo, triage each one against its source context using the Anthropic Claude API, and generate a narrative security report.

## How the AI layer works

This is **not** an MCP server and the model does not invoke tools. Each script gathers the data it needs, makes a single direct call to the Anthropic Messages API with that data embedded in the prompt, and acts on the structured response. The model performs contextual analysis, classification, and writing — the orchestration is handled entirely by the pipeline.

Model used: `claude-sonnet-4-6`.

## Scripts

### `defectdojo_setup.py`

Prepares DefectDojo for a scan run and uploads results.

- Finds or creates a product named **ToolVault Scans**
- Finds or creates an engagement named after the target repository, so findings from different repos never mix
- Uploads Trivy, Semgrep, Gitleaks, Checkov, and npm audit output to that engagement
- Writes the engagement ID to `reports/engagement_id.txt` for the triage agent to pick up

Requires: `DEFECTDOJO_URL`, `DEFECTDOJO_API_KEY`, `TARGET_REPOSITORY`, `SCAN_RESULTS_DIR` (default `scan-results/`)

### `context_triage_agent.py`

The core triage step — this is what separates a reviewed finding list from raw scanner output.

For each open finding in the engagement, ordered by severity:

1. Fetches the surrounding source code from the GitHub API — 15 lines either side of the flagged line
2. Sends the finding metadata (title, severity, file, line, CWE, description) plus that code context to Claude
3. Receives a structured JSON verdict:

```json
{
  "verdict": "true_positive",
  "confidence": "high",
  "reasoning": "...",
  "remediation": "..."
}
```

4. Posts the verdict back to DefectDojo as an annotated note on the finding
5. Anything classified `false_positive` is automatically marked inactive, removing it from the active queue

Verdicts are one of `true_positive`, `false_positive`, or `needs_review`. A summary is written to `reports/triage-summary.json`.

Requires: `ANTHROPIC_API_KEY`, `DEFECTDOJO_URL`, `DEFECTDOJO_API_KEY`  
Optional: `DEFECTDOJO_ENGAGEMENT_ID` (read from file if unset), `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `MAX_FINDINGS` (default 20)

### `report_generator.py`

Turns scan output into a report a non-specialist can act on.

Reads every available result file — triage summary, ZAP, npm audit, Checkov, Semgrep, Trivy, Gitleaks — summarises each into a structured block, and asks Claude to write a formal assessment with six sections: executive summary, methodology, key findings by severity, risk assessment with a matrix, prioritised recommendations, and conclusion.

The prompt explicitly scopes the report to the **target repository**, not to ToolVault itself, so the output reads as an assessment of the scanned code.

Output: `reports/security-report.md`

Requires: `ANTHROPIC_API_KEY`, `TARGET_REPOSITORY`  
Optional: `REPORTS_DIR` (default `reports/`)

## Running

```bash
pip install -r requirements.txt

export ANTHROPIC_API_KEY=...
export DEFECTDOJO_URL=...
export DEFECTDOJO_API_KEY=...
export TARGET_REPOSITORY=OWASP/crAPI

python defectdojo_setup.py
python context_triage_agent.py
python report_generator.py
```

Each script exits cleanly with a skip message if its required credentials are absent, so the pipeline degrades gracefully rather than failing when the AI layer is not configured.

## Design notes

**Why code context matters.** A scanner flags a pattern; it cannot tell whether that pattern is reachable, whether input is already validated upstream, or whether the file is test fixture code. Supplying the surrounding lines is what makes the false-positive judgement possible at all.

**Why structured JSON output.** Verdicts are parsed and written back to DefectDojo programmatically, so the response format is constrained rather than free-form prose.

**Why false positives are deactivated, not deleted.** The annotated note stays attached to the finding, so a human reviewer can see what was dismissed and why.
