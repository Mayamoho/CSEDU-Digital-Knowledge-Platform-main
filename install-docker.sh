#!/bin/bash
# ============================================================
# Install Docker Engine + Compose plugin on a fresh Ubuntu VM.
# Run once as a regular user with sudo rights.
# ============================================================
set -e

if [ "$EUID" -eq 0 ]; then
    SUDO=""
else
    SUDO="sudo"
fi

echo "=== Updating apt ==="
$SUDO apt-get update
$SUDO apt-get install -y ca-certificates curl gnupg lsb-release

echo "=== Adding Docker GPG key ==="
$SUDO install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
$SUDO chmod a+r /etc/apt/keyrings/docker.gpg

echo "=== Adding Docker apt repository ==="
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  | $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null

echo "=== Installing Docker ==="
$SUDO apt-get update
$SUDO apt-get install -y docker-ce docker-ce-cli containerd.io \
                          docker-buildx-plugin docker-compose-plugin

echo "=== Adding current user to docker group ==="
$SUDO usermod -aG docker "$USER"

echo "=== Versions ==="
docker --version
docker compose version

echo
echo "Docker installed. LOG OUT and LOG BACK IN so the"
echo "docker group membership takes effect, then run deploy.sh."