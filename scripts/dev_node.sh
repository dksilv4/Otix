#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
NODE_DIR="${REPO_ROOT}/node"

PORT="${PORT:-8090}"
CONFIG="${CONFIG:-${NODE_DIR}/config.yaml}"

if [ ! -f "${CONFIG}" ] && [ -f "${NODE_DIR}/config.example.yaml" ]; then
    cp "${NODE_DIR}/config.example.yaml" "${CONFIG}"
fi

echo "=========================================================="
echo "          OTIX NODE LOCAL DEV RUNNER                      "
echo "=========================================================="
echo "  Local Port:   ${PORT}"
echo "  WebUI URL:    http://localhost:${PORT}"
echo "  Config:       ${CONFIG}"
echo "=========================================================="

if command -v air >/dev/null 2>&1; then
    echo "==> Using Air for live-reload..."
    cd "${NODE_DIR}"
    exec air -- -config "${CONFIG}" -port "${PORT}"
fi

if command -v go >/dev/null 2>&1; then
    echo "==> Running with native Go..."
    cd "${NODE_DIR}"
    exec go run . -config "${CONFIG}" -port "${PORT}"
fi

echo "==> Running with Docker container..."
exec docker run --rm -it \
    -v "${REPO_ROOT}:/repo" \
    -w /repo/node \
    -p "${PORT}:${PORT}" \
    golang:1.24-alpine \
    go run . -config "${CONFIG}" -port "${PORT}"
