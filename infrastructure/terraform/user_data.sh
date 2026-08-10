#!/bin/bash
set -uxo pipefail

# Bootstrap: Docker, Compose, buildx, and the ToolVault stack.
#
# Progress is written to /var/log/toolvault-bootstrap.log as well as the
# usual /var/log/cloud-init-output.log, so a failure here is visible without
# digging through all of cloud-init.

exec > >(tee -a /var/log/toolvault-bootstrap.log) 2>&1
echo "=== ToolVault bootstrap starting $(date) ==="

dnf update -y
dnf install -y docker git

systemctl enable --now docker
usermod -aG docker ec2-user

PLUGIN_DIR=/usr/local/lib/docker/cli-plugins
mkdir -p "$PLUGIN_DIR"

# Compose v2 as a docker CLI plugin
echo "--- installing docker compose"
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
    -o "$PLUGIN_DIR/docker-compose"
chmod +x "$PLUGIN_DIR/docker-compose"

# buildx. Amazon Linux ships an older buildx (0.12.x) that current Compose
# refuses to build with ("compose build requires buildx 0.17.0 or later").
# Installing a current release into /usr/local takes precedence over the
# packaged one in /usr/libexec.
echo "--- installing docker buildx"
curl -SL "https://github.com/docker/buildx/releases/latest/download/buildx-linux-amd64" \
    -o "$PLUGIN_DIR/docker-buildx"
chmod +x "$PLUGIN_DIR/docker-buildx"

docker compose version || true
docker buildx version || true

# DefectDojo wants a raised map count
echo 'vm.max_map_count=262144' >> /etc/sysctl.conf
sysctl -p || true

echo "--- cloning repository"
cd /home/ec2-user
if [ ! -d toolvault ]; then
    git clone ${repository_url} toolvault
fi
chown -R ec2-user:ec2-user toolvault

cd toolvault

# Secrets are not baked into the AMI or user_data. Drop a real .env here
# (via SSM Session Manager) and restart, or the stack comes up with
# local-only defaults.
if [ ! -f .env ]; then
    cp .env.local.example .env || true
    chown ec2-user:ec2-user .env
fi

# Register the service first so the stack survives a reboot even if this
# initial build fails.
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
TimeoutStartSec=1800

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable toolvault.service

# Building the two Node images on a 2-vCPU box takes a while. Failures here
# should not abort the rest of the bootstrap — the logs above will show why.
echo "--- building and starting stack (this takes several minutes)"
sudo -u ec2-user docker compose up -d --build
STATUS=$?

if [ $STATUS -eq 0 ]; then
    echo "=== bootstrap complete $(date) ==="
else
    echo "=== compose failed with status $STATUS — see above $(date) ==="
fi

sudo -u ec2-user docker compose ps || true
