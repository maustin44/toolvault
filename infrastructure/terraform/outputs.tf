output "public_ip" {
  description = "Elastic IP assigned to the instance."
  value       = aws_eip.toolvault.public_ip
}

output "toolvault_url" {
  description = "ToolVault UI."
  value       = "http://${aws_eip.toolvault.public_ip}"
}

output "defectdojo_url" {
  description = "DefectDojo UI."
  value       = "http://${aws_eip.toolvault.public_ip}:8080"
}

output "instance_id" {
  description = "EC2 instance ID."
  value       = aws_instance.toolvault.id
}

output "session_manager_command" {
  description = "Open a shell without SSH."
  value       = "aws ssm start-session --target ${aws_instance.toolvault.id} --region ${var.aws_region}"
}
