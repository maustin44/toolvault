variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-2"
}

variable "environment" {
  description = "Environment name, used in resource names and tags."
  type        = string
  default     = "dev"
}

variable "instance_type" {
  description = "EC2 instance type. ToolVault plus DefectDojo needs at least 4 GB of RAM."
  type        = string
  default     = "t3.medium"
}

variable "key_name" {
  description = "Name of an existing EC2 key pair for SSH access. Leave empty to rely on SSM Session Manager only."
  type        = string
  default     = ""
}

variable "allowed_ssh_cidr" {
  description = "CIDR permitted to reach SSH. Defaults to nothing — set to your own IP/32 if you need direct SSH."
  type        = string
  default     = "127.0.0.1/32"

  validation {
    condition     = var.allowed_ssh_cidr != "0.0.0.0/0"
    error_message = "Refusing to open SSH to the world. Use your own IP with /32, or leave the default and use SSM."
  }
}

variable "allowed_web_cidr" {
  description = "CIDR permitted to reach the ToolVault UI and DefectDojo."
  type        = string
  default     = "0.0.0.0/0"
}

variable "repository_url" {
  description = "Git repository cloned onto the instance at boot."
  type        = string
  default     = "https://github.com/maustin44/toolvault.git"
}

variable "root_volume_size" {
  description = "Root EBS volume size in GB. DefectDojo images alone need roughly 10 GB."
  type        = number
  default     = 30
}
