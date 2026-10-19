#!/usr/bin/env bash
set -euo pipefail

# Runs Otix CI test suites hermetically inside Docker, matching GitHub Actions CI.
TARGET="${1:-all}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

if ! docker info >/dev/null 2>&1; then
    echo "Error: Docker daemon is not running or not accessible." >&2
    exit 1
fi

if [ "${TARGET}" = "all" ] || [ "${TARGET}" = "frontend" ]; then
    echo "==> Building Frontend CI Docker Image..."
    docker build -t otix-frontend-ci -f frontend/Dockerfile.ci frontend

    echo "==> Running Frontend CI Checks in Docker..."
    docker run --rm otix-frontend-ci
fi

if [ "${TARGET}" = "all" ] || [ "${TARGET}" = "backend" ]; then
    echo "==> Building Backend CI Docker Image..."
    docker build -t otix-backend-ci -f backend/Dockerfile.ci .

    echo "==> Running Backend CI Checks in Docker..."
    docker run --rm otix-backend-ci
fi

echo "==> All Docker CI checks passed successfully!"
