# Infrastructure

Terraform for running ToolVault on AWS. Provisions a single EC2 instance that
runs the whole stack — ToolVault, DefectDojo, and an optional DAST target —
via Docker Compose.

## What gets created

| Resource | Purpose |
|---|---|
| EC2 instance | Runs the Docker Compose stack |
| Elastic IP | Stable address across stop/start |
| Security group | Ports 80 and 8080 open per variable; SSH closed by default |
| IAM role + instance profile | SSM Session Manager access, so no SSH key is required |
| gp3 root volume | Encrypted, 30 GB by default |

The AMI is resolved from a data source rather than pinned, so it does not go
stale. IMDSv2 is required on the instance.

## Usage

```bash
cd infrastructure/terraform
cp terraform.tfvars.example terraform.tfvars   # edit as needed

terraform init
terraform plan
terraform apply
```

Outputs give the UI URLs and a ready-made Session Manager command.

Tear down when finished — this stack is designed to be ephemeral, which keeps
cost near zero between sessions:

```bash
terraform destroy
```

## Cost

A `t3.medium` is roughly $30/month if left running continuously, plus a few
dollars for the EBS volume. Applying and destroying around a demo costs cents.
`t3.small` is cheaper but DefectDojo's Celery workers are unhappy below 4 GB.

## Notes

- **Secrets are not provisioned.** The instance boots with
  `.env.local.example` defaults. Connect via Session Manager, write a real
  `.env`, and run `docker compose up -d` again.
- **SSH is closed by default.** `allowed_ssh_cidr` defaults to a loopback
  address and the configuration refuses `0.0.0.0/0`. Use Session Manager, or
  set the variable to your own IP with `/32`.
- **State is local by default.** See `backend.tf.example` for moving to S3
  with DynamoDB locking.
