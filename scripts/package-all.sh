#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=========================================================="
echo "          Otix Complete Binary Packaging Suite             "
echo "=========================================================="

# 1. Package Otix Node (Go daemon: Mac DMG, Windows zip, Linux tarballs)
echo ""
echo ">>> STEP 1: Packaging Otix Node..."
"${REPO_ROOT}/node/scripts/build-all.sh"

# 2. Package Otix Desktop (Electron Client)
echo ""
echo ">>> STEP 2: Packaging Otix Desktop Client..."
"${SCRIPT_DIR}/package-desktop.sh" "$@"

echo ""
echo "=========================================================="
echo "  🎉 All Otix Binaries Successfully Packaged!"
echo "=========================================================="
echo "  • Otix Desktop Releases: ${REPO_ROOT}/desktop/release"
echo "  • Otix Node Binaries:    ${REPO_ROOT}/node/dist"
echo "=========================================================="
