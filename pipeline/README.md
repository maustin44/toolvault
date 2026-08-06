# CI/CD Pipeline Documentation

## Overview

The CI/CD pipeline automates building, scanning, and deploying the application every time code is pushed to the `development` branch on GitHub. The pipeline is defined in `pipeline/Ci-CD_pipeline.yml` and runs on GitHub Actions.

The pipeline has four stages that run in order. If any stage fails, the ones after it do not run. This prevents broken or vulnerable code from reaching production.

---

## Pipeline stages

### Stage 1: Build

**What it does:** Checks out the source code from GitHub, installs all npm packages, and compiles the React frontend into production-ready HTML, CSS, and JavaScript files using Vite.

**Commands run:**
```bash
cd app/frontend
npm install
npm run build
```

If the build fails, it means there is a syntax error or missing dependency. The pipeline stops here and nothing gets deployed.

---

### Stage 2: Security scans

This stage runs five different security scanners. Each one looks for a different type of vulnerability. Running multiple scanners provides defense in depth — what one misses, another may catch.

#### npm audit — Dependency vulnerability scanner

Checks every third-party package in `package-lock.json` against the GitHub Advisory Database, a public registry of known security vulnerabilities in open-source software. If a package has a known exploit (for example, a version of Express with a denial-of-service bug), npm audit flags it with a severity level: low, moderate, high, or critical.

```bash
cd app/frontend
npm audit || true
```


#### Semgrep — Static Application Security Testing (SAST)

Reads through the application source code and matches it against over 2,000 predefined security rules. Unlike npm audit which checks dependencies, Semgrep checks the code the team wrote. It looks for patterns like SQL injection, cross-site scripting (XSS), hardcoded passwords, and insecure cryptographic functions.

```bash
pip install semgrep
semgrep scan --config auto
```


#### GitLeaks — Secrets detection

Scans the entire Git history for accidentally committed secrets like API keys, passwords, private keys, and access tokens. Even if a secret was committed and then deleted in a later commit, GitLeaks finds it because Git retains all history.

```bash
docker run --rm -v $(pwd):/repo zricethezav/gitleaks detect --source=/repo || true
```

#### Trivy — Comprehensive vulnerability scanner

Scans the entire filesystem for vulnerabilities across multiple dimensions: OS packages, application dependencies, Infrastructure as Code misconfigurations, and container image vulnerabilities. While npm audit only checks JavaScript packages, Trivy also catches issues in Python dependencies, system packages, Dockerfiles, and Terraform configurations.

```bash
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sudo sh
trivy fs . || true
```

#### Checkov — Infrastructure as Code scanner

Specifically scans Infrastructure as Code files (Terraform, CloudFormation, Dockerfiles, Kubernetes manifests) for security misconfigurations. For example, it checks whether an S3 bucket is accidentally public, whether a security group allows unrestricted SSH from the internet, or whether encryption is enabled on databases.

```bash
pip install checkov
checkov -d . || true
```

---

### Stage 3: Deploy to AWS EC2

Once code passes build and security stages, the pipeline deploys it to the production server. It connects to the AWS EC2 instance via SSH, pulls the latest code, installs dependencies, builds the frontend, and restarts the Nginx web server.

**Steps executed on the server:**
1. SSH into the EC2 instance using credentials stored in GitHub Secrets
2. Clone the repo if this is the first deployment, otherwise pull latest changes
3. Navigate to the frontend directory and install npm dependencies
4. Run the Vite production build
5. Restart Nginx to serve the new files


---

### Stage 4: OWASP ZAP — Dynamic scan

After deployment, OWASP ZAP performs a Dynamic Application Security Test (DAST). Unlike the static scanners in Stage 2 that analyze source code, ZAP interacts with the running application the same way an attacker would — sending HTTP requests, submitting forms, probing for injection points, and checking for insecure headers. It generates an HTML report uploaded as a pipeline artifact.

```bash
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://testphp.vulnweb.com \
  -r zap-report.html || true
```

---

## Tools summary

| Tool | Category | What it scans | Pipeline stage |
|------|----------|---------------|----------------|
| npm audit | SCA | Third-party npm packages for known CVEs | Stage 2 |
| Semgrep | SAST | Source code for insecure patterns (XSS, SQLi, hardcoded secrets) | Stage 2 |
| GitLeaks | Secrets | Git history for accidentally committed API keys, passwords, tokens | Stage 2 |
| Trivy | SCA / IaC | OS packages, app dependencies, Dockerfiles, Terraform files | Stage 2 |
| Checkov | IaC | Terraform, Docker, Kubernetes for security misconfigurations | Stage 2 |
| OWASP ZAP | DAST | Running application for runtime vulnerabilities | Stage 4 |
| AWS EC2 | Infrastructure | Virtual server hosting the deployed application | Stage 3 |
| Terraform | IaC | Defines AWS infrastructure (EC2, VPC, subnets) as code | See below |

**SCA** = Software Composition Analysis (checks dependencies). **SAST** = Static Application Security Testing (checks source code). **DAST** = Dynamic Application Security Testing (checks running app). **IaC** = Infrastructure as Code (checks cloud resource definitions).

---

## AWS EC2 infrastructure

The application is hosted on an AWS EC2 instance running in the `us-east-2` region. The infrastructure is defined as Terraform configuration files in `infrastructure/terraform/`.

### Currently defined resources

| Resource | Name | Purpose |
|----------|------|---------|
| `aws_instance` | Capstone-WebServer | t3.micro EC2 instance hosting the application |
| `aws_vpc` | capstone-vpc | Virtual Private Cloud (10.0.0.0/16) isolating our infrastructure |
| `aws_subnet` | public-subnet | Public subnet (10.0.1.0/24) where the EC2 instance lives |

---

## Pipeline file location

```
pipeline/Ci-CD_pipeline.yml
```


