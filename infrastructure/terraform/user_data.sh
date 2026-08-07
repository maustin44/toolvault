#!/bin/bash
set -euxo pipefail

# Bootstrap: Docker, Compose, and the ToolVault stack.
# Output is captured in /var/log/cloud-init-output.log

dnf update -y
dnf install -y docker git

systemctl enable --now docker
usermod -aG docker ec2-user

# Compose v2 as a docker CLI plugin
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

echo 'vm.max_map_count=262144' >> /etc/sysctl.conf
sysctl -p

cd /home/ec2-user
git clone ${repository_url} toolvault
chown -R ec2-user:ec2-user toolvault

cd toolvault

# Secrets are not baked into the AMI or user_data. Drop a real .env here
# (via SSM Session Manager) and restart, or the stack comes up with
# local-only defaults.
if [ ! -f .env ]; then
    cp .env.local.example .env || true
fi

# Bring the stack up as ec2-user so the compose project is owned correctly
sudo -u ec2-user docker compose up -d

cat > /etc/systemd/system/toolvault.service <<'UNIT'
[Unit]
Description=ToolVault stack
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ec2-user/toolvault
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=ec2-user

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable toolvault.service
