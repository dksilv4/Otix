#!/usr/bin/env bash
set -euo pipefail

# Builds all production Otix Docker images locally (frontend, backend, node).
TARGET="${1:-all}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

if ! docker info >/dev/null 2>&1; then
    echo "Error: Docker daemon is not running or not accessible." >&2
    exit 1
fi

if [ "${TARGET}" = "all" ] || [ "${TARGET}" = "backend" ]; then
    echo "==> Building backend production image (otix-backend:latest)..."
    docker build -t otix-backend:latest -f backend/Dockerfile backend
    docker tag otix-backend:latest otix-api:latest
    docker tag otix-backend:latest otix-worker:latest
    docker tag otix-backend:latest otix-beat:latest
fi

if [ "${TARGET}" = "all" ] || [ "${TARGET}" = "frontend" ]; then
    echo "==> Building frontend production image (otix-frontend:latest)..."
    docker build -t otix-frontend:latest -f frontend/Dockerfile frontend
fi

if [ "${TARGET}" = "all" ] || [ "${TARGET}" = "node" ]; then
    echo "==> Building node production image (otix-node:latest)..."
    docker build -t otix-node:latest -f node/Dockerfile node
fi

echo "==> All requested production Docker images built successfully!"
