# ToolVault

An AI-assisted DevSecOps platform that scans GitHub repositories for security vulnerabilities, aggregates findings into DefectDojo, and uses the Anthropic Claude API to triage results and generate readable security reports.

> **Note:** This began as a group capstone project (Group 3, Eastern Michigan University) and is maintained here for continued independent development.

---

## What it does

Most security scanners produce more noise than signal — hundreds of findings, many of them false positives, with no context about which ones actually matter. ToolVault runs a range of scanners against a target repository, consolidates everything into a single tracked queue, and then adds an automated review layer: each finding is sent to Claude along with the surrounding source code, classified as a true or false positive, and annotated with reasoning and a suggested fix. Confirmed findings are compiled into a narrative report written for a non-specialist reader.

The target is any repository the pipeline is pointed at — not just this one.

## Architecture

| Layer | Technology | Purpose |
|---|---|---|
| Application | React SPA + Express API, single container | Repository selection, scan triggering, findings review |
| Host | AWS EC2 running Docker Compose | Application, DefectDojo, and an optional DAST target |
| Infrastructure | Terraform | Reproducible AWS provisioning |
| CI/CD | GitHub Actions | Scanner suite, triage, and report generation |
| Findings store | DefectDojo | Deduplication, tracking, engagement management |
| AI layer | Claude API (`claude-sonnet-4-6`) | Finding triage and report generation |

The Express backend serves the built SPA directly from `../frontend/dist`, so the
application ships as one image rather than a separate frontend and API.

Infrastructure is provisioned with Terraform: an EC2 instance with an IAM
instance profile for SSM Session Manager access (no inbound SSH), an encrypted
gp3 root volume, IMDSv2 required, and a security group whose web ingress is
configurable per environment.

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
app/              Dockerfile, React frontend and Express backend
pipeline/         Scan orchestration
security/         Security configuration and policies
infrastructure/   Terraform definitions for AWS
scripts/          Local scan runner
docs/             Architecture and setup documentation
.github/          CI/CD workflow
```

## How a scan runs

1. A target repository is selected through the SPA, which dispatches the workflow (or set `TARGET_REPOSITORY` and run it manually).
2. The scanner suite runs against that repository; DAST optionally runs against a supplied live URL.
3. `defectdojo_setup.py` finds or creates a DefectDojo engagement named after the target repo and uploads all scan output, keeping findings from different repositories separate.
4. `context_triage_agent.py` pulls open findings, fetches surrounding source context, and asks Claude for a verdict on each. False positives are marked inactive in DefectDojo automatically; every finding gets an annotated note.
5. `report_generator.py` assembles all scan data and the triage summary into a prompt, and Claude writes a Markdown security report to `reports/security-report.md`, published as a build artifact.

## Running it

### Locally

```bash
cp .env.local.example .env     # then fill in the values below
docker compose up -d --build
```

| Service | URL |
|---|---|
| ToolVault | http://localhost:8081 |
| DefectDojo | http://localhost:8080 |
| Juice Shop (DAST target) | http://localhost:3000 — start with `--profile dast` |

Required in `.env`:

```
ANTHROPIC_API_KEY      # console.anthropic.com
GITHUB_TOKEN           # PAT with repo and workflow scopes
DEFECTDOJO_API_KEY     # from the DefectDojo UI after first login
JWT_SECRET             # openssl rand -base64 32
```

`TOOLVAULT_PORT` sets the host port and defaults to 8081.

To scan without GitHub Actions, `scripts/local-scan.sh` runs the whole suite
against any repository and drives the AI agents directly:

```bash
./scripts/local-scan.sh https://github.com/OWASP/crAPI
./scripts/local-scan.sh https://github.com/juice-shop/juice-shop http://localhost:3000
```

### On AWS

```bash
cd infrastructure/terraform
cp terraform.tfvars.example terraform.tfvars   # set allowed_web_cidr
terraform init
terraform apply
```

Outputs give the application and DefectDojo URLs plus a ready-made Session
Manager command. The instance bootstraps itself — Docker, the repository, and
the full stack — so allow 10–15 minutes after apply before the UI responds.

Tear down with `terraform destroy` when finished; the stack is designed to be
ephemeral.

## Validation

Run against deliberately vulnerable applications — **OWASP crAPI**, **OWASP
Juice Shop**, and **nodejs-goof** — to confirm the scanners, triage layer, and
reporting work end to end against real vulnerable code rather than synthetic
test cases.

A representative assessment of `nodejs-goof` identified:

- 37 critical and 70 high-severity dependency CVEs across the npm tree
- A hardcoded Express session secret
- A container image with no `USER` directive, running as root
- Session cookies missing `Secure`, `HttpOnly`, `expires`, and `domain`
- Twelve GitHub Actions steps pinned to mutable tags rather than commit SHAs

AI triage confirmed 18 of 20 static findings as true positives and flagged 2
for manual review.

## A note on the name

This project began as an MCP (Model Context Protocol) integration, which is why
earlier commits and the original repository name reference MCP. That direction
was scoped out during development. The final build calls the Anthropic API
directly at fixed points in the pipeline rather than exposing tools for the
model to invoke — see `ai-agent/README.md` for detail on how the AI layer
actually works.

## License

See [LICENSE](LICENSE).
