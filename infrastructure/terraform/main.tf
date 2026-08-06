provider "aws" {
  region = "us-east-2"
}

resource "aws_instance" "web" {
  ami           = "ami-0b0b78dcacbab728f"
  instance_type = "t3.small"
  key_name      = "Capstone-Key"

  tags = {
    Name = "Capstone-WebServer"
  }
}
