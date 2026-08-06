# ToolVault

An AI-assisted DevSecOps platform that scans GitHub repositories for security vulnerabilities, aggregates findings into DefectDojo, and uses the Anthropic Claude API to triage results and generate readable security reports.

> **Note:** This is a personal fork of a group capstone project (Group 3, Eastern Michigan University), maintained here for my own continued development and reference.

---

## What it does

Most security scanners produce more noise than signal — hundreds of findings, many of them false positives, with no context about which ones actually matter. ToolVault runs a range of scanners against a target repository, consolidates everything into a single tracked queue, and then adds an automated review layer: each finding is sent to Claude along with the surrounding source code, classified as a true or false positive, and annotated with reasoning and a suggested fix. Confirmed findings are compiled into a narrative report written for a non-specialist reader.

The target is any repository the pipeline is pointed at — not just this one.

## Architecture

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React SPA on S3 + CloudFront | Repository selection, scan triggering, findings review |
| Backend | Express API on ECS Fargate | Scan orchestration and API |
| Infrastructure | Terraform | Reproducible AWS provisioning |
| CI/CD | GitHub Actions | Build, scan, triage, deploy |
| Findings store | DefectDojo | Deduplication, tracking, engagement management |
| AI layer | Claude API (`claude-sonnet-4-6`) | Finding triage and report generation |

## Scanners

| Tool | Type | Detects |
|---|---|---|
| Semgrep | SAST | Insecure code patterns, injection, unsafe eval |
| Trivy | SCA / filesystem | Known CVEs in dependencies and packages |
| npm audit | SCA | Vulnerable npm dependencies |
| Gitleaks | Secrets | Credentials and tokens committed to source |
| Checkov | IaC | Terraform and cloud misconfigurations |
| OWASP ZAP | DAST | Runtime vulnerabilities against a live target |

## Repository layout

```
ai-agent/         Claude triage agent, DefectDojo integration, report generator
app/              React single-page application
pipeline/         Scan orchestration
security/         Security configuration and policies
infrastructure/   Terraform definitions for AWS
docs/             Architecture and setup documentation
.github/          CI/CD workflow
```

## How a scan runs

1. A target repository is selected through the SPA (or set via `TARGET_REPOSITORY`).
2. The scanner suite runs against that repository; DAST optionally runs against a supplied live URL.
3. `defectdojo_setup.py` finds or creates a DefectDojo engagement named after the target repo and uploads all scan output, keeping findings from different repositories separate.
4. `context_triage_agent.py` pulls open findings, fetches surrounding source context, and asks Claude for a verdict on each. False positives are marked inactive in DefectDojo automatically; every finding gets an annotated note.
5. `report_generator.py` assembles all scan data and the triage summary into a prompt, and Claude writes a Markdown security report to `reports/security-report.md`, published as a build artifact.

## Setup

Copy `.env.example` and populate the required values:

```
ANTHROPIC_API_KEY
DEFECTDOJO_URL
DEFECTDOJO_API_KEY
GITHUB_TOKEN
```

Provision infrastructure:

```bash
cd infrastructure/terraform
terraform init
terraform apply
```

Install the AI agent dependencies:

```bash
pip install -r ai-agent/requirements.txt
```

See `docs/` for further setup detail.

## Validation

The pipeline has been run against deliberately vulnerable applications including **OWASP crAPI** and **OWASP Juice Shop**, surfacing genuine findings such as Kubernetes misconfigurations and hardcoded JWT tokens — confirming the scanners, triage layer, and reporting work end to end against real vulnerable code rather than only against synthetic test cases.

## A note on the name

This project began as an MCP (Model Context Protocol) integration, which is why earlier commits and the original repository name reference MCP. That direction was scoped out during development. The final build calls the Anthropic API directly at fixed points in the pipeline rather than exposing tools for the model to invoke — see `ai-agent/README.md` for detail on how the AI layer actually works.

## License

See [LICENSE](LICENSE).
