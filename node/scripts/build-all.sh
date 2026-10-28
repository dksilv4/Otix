#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist/node"

mkdir -p "${DIST_DIR}"

echo "=========================================================="
echo "  Packaging Otix Node for All Platforms (Website Downloads)"
echo "=========================================================="

# 1. Windows (x64)
echo "==> Building Windows executable (otix-node-windows-amd64.exe)..."
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o "${DIST_DIR}/otix-node-windows-amd64.exe" "${NODE_DIR}"
if command -v zip >/dev/null 2>&1; then
    (cd "${DIST_DIR}" && zip -q "Otix-Node-Windows-x64.zip" "otix-node-windows-amd64.exe")
    echo "    Created: ${DIST_DIR}/Otix-Node-Windows-x64.zip"
fi

# 2. Linux (x64 & arm64)
echo "==> Building Linux binaries..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o "${DIST_DIR}/otix-node-linux-amd64" "${NODE_DIR}"
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o "${DIST_DIR}/otix-node-linux-arm64" "${NODE_DIR}"
if command -v tar >/dev/null 2>&1; then
    (cd "${DIST_DIR}" && tar -czf "Otix-Node-Linux-x64.tar.gz" "otix-node-linux-amd64")
    (cd "${DIST_DIR}" && tar -czf "Otix-Node-Linux-arm64.tar.gz" "otix-node-linux-arm64")
    echo "    Created: ${DIST_DIR}/Otix-Node-Linux-x64.tar.gz"
fi

# 3. macOS (Apple Silicon + Intel Universal & DMG)
echo "==> Running macOS build and packaging..."
"${SCRIPT_DIR}/build-macos.sh"

echo ""
echo "=========================================================="
echo "  🎉 All Distribution Packages Ready in dist/node/:"
ls -lh "${DIST_DIR}"
echo "=========================================================="
