#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/frontend"
DESKTOP_DIR="${REPO_ROOT}/desktop"

echo "=========================================================="
echo "          Otix Desktop Packaging Pipeline                 "
echo "=========================================================="

# 1. Detect macOS SDK if on Darwin to avoid TAPI/libSystem linker mismatches
if [[ "$(uname -s)" == "Darwin" ]]; then
  if [[ -z "${SDKROOT:-}" ]]; then
    # Look for known stable SDKs in CommandLineTools or Xcode
    if [[ -d "/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk" ]]; then
      export SDKROOT="/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk"
    elif [[ -d "/Library/Developer/CommandLineTools/SDKs/MacOSX15.sdk" ]]; then
      export SDKROOT="/Library/Developer/CommandLineTools/SDKs/MacOSX15.sdk"
    elif command -v xcrun >/dev/null 2>&1; then
      export SDKROOT="$(xcrun --show-sdk-path 2>/dev/null || true)"
    fi
  fi
  if [[ -n "${SDKROOT:-}" ]]; then
    echo "==> Using macOS SDK: ${SDKROOT}"
  fi
fi

# 2. Build Frontend Production Static Assets
echo "==> [1/4] Building Frontend bundle..."
npm --prefix "${FRONTEND_DIR}" run build

# 3. Build Desktop TypeScript Bundle
echo "==> [2/4] Compiling Desktop TypeScript..."
npm --prefix "${DESKTOP_DIR}" run build

# 4. Ensure Native Dependencies (better-sqlite3) are rebuilt for Electron
echo "==> [3/5] Ensuring native bindings are compiled for Electron..."
(cd "${DESKTOP_DIR}" && npx electron-builder install-app-deps)

# 5. Build embedded Otix Node sidecar binary if Go is available
echo "==> [4/5] Checking for Otix Node companion binary..."
if command -v go >/dev/null 2>&1; then
  echo "    Building embedded Otix Node companion..."
  mkdir -p "${DESKTOP_DIR}/bin"
  (cd "${REPO_ROOT}/node" && CGO_ENABLED=0 go build -ldflags="-s -w" -o "${DESKTOP_DIR}/bin/otix-node" ./main.go)
  chmod +x "${DESKTOP_DIR}/bin/otix-node"
elif [[ -f "${DESKTOP_DIR}/bin/otix-node" ]]; then
  echo "    Using pre-existing ${DESKTOP_DIR}/bin/otix-node binary."
else
  echo "    Warning: Go not found and no pre-built binary in desktop/bin. Skipping embedded node."
fi

# 6. Package with electron-builder
echo "==> [5/5] Running electron-builder..."
BUILD_ARGS=()
if [[ $# -gt 0 ]]; then
  BUILD_ARGS=("$@")
else
  # Default based on host OS
  case "$(uname -s)" in
    Darwin)
      BUILD_ARGS=("--mac")
      ;;
    Linux)
      BUILD_ARGS=("--linux")
      ;;
    MINGW*|MSYS*|CYGWIN*)
      BUILD_ARGS=("--win")
      ;;
    *)
      BUILD_ARGS=("--dir")
      ;;
  esac
fi

(cd "${DESKTOP_DIR}" && npx electron-builder "${BUILD_ARGS[@]}" -c electron-builder.json5)

echo ""
echo "=========================================================="
echo "  🎉 Otix Desktop Packaging Complete! Artifacts in:        "
echo "     ${DESKTOP_DIR}/release                               "
echo "=========================================================="
