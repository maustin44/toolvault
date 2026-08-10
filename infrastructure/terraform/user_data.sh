#!/bin/bash
set -uxo pipefail

# Bootstrap: Docker, Compose, buildx, and the ToolVault stack.
#
# Progress is written to /var/log/toolvault-bootstrap.log as well as the
# usual /var/log/cloud-init-output.log, so a failure here is visible without
# digging through all of cloud-init.
#
# NOTE: this file is rendered by Terraform's templatefile(). Terraform
# substitutes dollar-brace expressions, so repository_url below is filled in
# at plan time. Shell variables here must be written bare (FOO, not braced),
# or Terraform will try to parse them and fail.

exec > >(tee -a /var/log/toolvault-bootstrap.log) 2>&1
echo "=== ToolVault bootstrap starting $(date) ==="

dnf update -y
dnf install -y docker git

systemctl enable --now docker
usermod -aG docker ec2-user

PLUGIN_DIR=/usr/local/lib/docker/cli-plugins
mkdir -p "$PLUGIN_DIR"

# Compose v2 as a docker CLI plugin. Its release asset name has no version
# in it, so the /latest/download/ shortcut works.
echo "--- installing docker compose"
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
    -o "$PLUGIN_DIR/docker-compose"
chmod +x "$PLUGIN_DIR/docker-compose"

# buildx. Amazon Linux ships an older buildx (0.12.x) that current Compose
# refuses to build with ("compose build requires buildx 0.17.0 or later").
# Installing a current release into /usr/local takes precedence over the
# packaged one in /usr/libexec.
#
# buildx asset names DO include the version (buildx-v0.19.3.linux-amd64),
# so the /latest/download/ shortcut 404s and the tag has to be resolved first.
echo "--- installing docker buildx"
BUILDX_VER=$(curl -s https://api.github.com/repos/docker/buildx/releases/latest \
    | grep -oP '"tag_name": "\K[^"]+')
if [ -z "$BUILDX_VER" ]; then
    BUILDX_VER=v0.19.3
    echo "could not resolve latest buildx tag, falling back to $BUILDX_VER"
fi
echo "buildx version: $BUILDX_VER"
curl -SL "https://github.com/docker/buildx/releases/download/$BUILDX_VER/buildx-$BUILDX_VER.linux-amd64" \
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

# Secrets are not baked into the AMI or user_data. JWT_SECRET has no safe
# default - the backend exits immediately without it - so generate real
# values here rather than leaving the example placeholders.
if [ ! -f .env ]; then
    cp .env.local.example .env || true
    JWT=$(openssl rand -base64 32)
    DDSK=$(openssl rand -base64 32)
    DDAES=$(openssl rand -base64 32)
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" .env
    sed -i "s|^DD_SECRET_KEY=.*|DD_SECRET_KEY=$DDSK|" .env
    sed -i "s|^DD_CREDENTIAL_AES_256_KEY=.*|DD_CREDENTIAL_AES_256_KEY=$DDAES|" .env
    chown ec2-user:ec2-user .env
    chmod 600 .env
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

# Building the frontend and backend on a 2-vCPU box takes a while. Failures
# here should not abort the rest of the bootstrap - the logs above show why.
echo "--- building and starting stack (this takes several minutes)"
sudo -u ec2-user docker compose up -d --build
STATUS=$?

if [ $STATUS -eq 0 ]; then
    echo "=== bootstrap complete $(date) ==="
else
    echo "=== compose failed with status $STATUS - see above $(date) ==="
fi

sudo -u ec2-user docker compose ps || true
