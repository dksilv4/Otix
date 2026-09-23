#!/usr/bin/env bash
# Bring up the public test API on a fresh Ubuntu VM (Oracle Always Free Ampere).
# Run from anywhere: sudo bash deploy/bootstrap-api-vm.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/bootstrap-api-vm.sh"
  exit 1
fi

mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
if [[ "$mem_kb" -lt 3000000 ]]; then
  echo "This machine has less than 3 GB of RAM."
  echo "Use an Always Free Ampere VM (2 OCPU, 12 GB), not the 1 GB AMD micro shape."
  exit 1
fi

apt-get update
apt-get install -y curl openssl python3
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker.io docker-compose-v2
fi
systemctl enable --now docker

public_ip=""
if [[ ! -f deploy/.env ]]; then
  password="$(openssl rand -hex 24)"
  secret="$(openssl rand -hex 32)"
  jwt="$(openssl rand -hex 32)"
  public_ip="$(curl -fsS -H "Authorization: Bearer Oracle" http://169.254.169.254/opc/v2/vnics/ \
    | python3 -c 'import json,sys; nics=json.load(sys.stdin); print(next((n.get("publicIp") or "" for n in nics if n.get("publicIp")), ""))' \
    || true)"
  if [[ -z "$public_ip" ]]; then
    public_ip="$(curl -fsS https://ifconfig.me || true)"
  fi
  if [[ -z "$public_ip" ]]; then
    echo "Could not detect a public IP. Edit ALLOWED_HOSTS in deploy/.env, then re-run."
    public_ip="localhost"
  fi
  umask 077
  cat > deploy/.env << EOF
SECRET_KEY=${secret}
JWT_SECRET_KEY=${jwt}
ALLOWED_HOSTS=${public_ip},localhost,127.0.0.1
POSTGRES_PASSWORD=${password}
POSTGRES_DB=otix
POSTGRES_USER=otix
DATABASE_URL=postgresql://otix:${password}@db:5432/otix
REDIS_URL=redis://redis:6379/1
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
FRONTEND_URL=http://${public_ip}:8000
EOF
  echo "Wrote deploy/.env (gitignored)."
fi

if command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport 8000 -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 -p tcp --dport 8000 -j ACCEPT
fi

docker compose -f docker-compose.api.yml --env-file deploy/.env up -d --build

if [[ -z "$public_ip" ]]; then
  public_ip="$(python3 -c 'from pathlib import Path
for line in Path("deploy/.env").read_text().splitlines():
    if line.startswith("ALLOWED_HOSTS="):
        print(line.split("=",1)[1].split(",")[0]); break')"
fi

echo "Waiting for the API..."
for _ in $(seq 1 36); do
  code="$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/v1/health || true)"
  if [[ "$code" == "200" ]]; then
    echo "API is up: http://${public_ip}:8000/api/v1/health"
    echo "Oracle still blocks that port until you add an ingress rule for TCP 8000 on the VM subnet security list."
    exit 0
  fi
  sleep 5
done

echo "API did not become healthy. Logs:"
docker compose -f docker-compose.api.yml logs --tail 80 api
exit 1
