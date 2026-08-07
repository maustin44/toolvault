# Latest Amazon Linux 2023 AMI, resolved at plan time rather than pinned
# to an ID that goes stale.
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_vpc" "default" {
  default = true
}

# ── Networking ──────────────────────────────────────────────────
resource "aws_security_group" "toolvault" {
  name        = "toolvault-${var.environment}"
  description = "ToolVault application, DefectDojo, and DAST target"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "ToolVault UI"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.allowed_web_cidr]
  }

  ingress {
    description = "DefectDojo"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = [var.allowed_web_cidr]
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "toolvault-${var.environment}"
  }
}

# ── Instance role ───────────────────────────────────────────────
# SSM access means no inbound SSH is required to get a shell.
resource "aws_iam_role" "instance" {
  name = "toolvault-${var.environment}-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "instance" {
  name = "toolvault-${var.environment}-instance"
  role = aws_iam_role.instance.name
}

# ── Compute ─────────────────────────────────────────────────────
resource "aws_instance" "toolvault" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.toolvault.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name
  key_name               = var.key_name != "" ? var.key_name : null

  user_data = templatefile("${path.module}/user_data.sh", {
    repository_url = var.repository_url
  })

  # Re-run bootstrap if the script changes
  user_data_replace_on_change = true

  root_block_device {
    volume_size = var.root_volume_size
    volume_type = "gp3"
    encrypted   = true
  }

  metadata_options {
    http_tokens   = "required" # IMDSv2 only
    http_endpoint = "enabled"
  }

  tags = {
    Name = "toolvault-${var.environment}"
  }
}

resource "aws_eip" "toolvault" {
  instance = aws_instance.toolvault.id
  domain   = "vpc"

  tags = {
    Name = "toolvault-${var.environment}"
  }
}
