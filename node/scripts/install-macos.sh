#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

INSTALL_DIR="${HOME}/.local/bin"
if [ -w "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
fi
mkdir -p "${INSTALL_DIR}"

APP_SUPPORT="${HOME}/Library/Application Support/Otix"
LOG_DIR="${HOME}/Library/Logs/Otix"
PLIST_DIR="${HOME}/Library/LaunchAgents"

mkdir -p "${APP_SUPPORT}"
mkdir -p "${APP_SUPPORT}/saves"
mkdir -p "${APP_SUPPORT}/downloads"
mkdir -p "${LOG_DIR}"
mkdir -p "${PLIST_DIR}"

echo "==> Building Otix Node native binary..."
TARGET_BIN="${INSTALL_DIR}/otix-node"
CGO_ENABLED=0 go build -ldflags="-s -w" -o "${TARGET_BIN}" "${NODE_DIR}"
chmod +x "${TARGET_BIN}"
echo "    Installed binary: ${TARGET_BIN}"

CONFIG_FILE="${APP_SUPPORT}/config.yaml"
if [ ! -f "${CONFIG_FILE}" ]; then
    cat <<EOF > "${CONFIG_FILE}"
server:
  name: "$(hostname -s) Mac Node"
  port: 8090
  host: "0.0.0.0"
  enable_heartbeat: true
  enable_upnp: false
  downloads_path: "${APP_SUPPORT}/downloads"
saves:
  storage_path: "${APP_SUPPORT}/saves"
  max_snapshots_per_game: 10
  auto_backup_on_exit: true
game_libraries: []
EOF
    echo "    Created initial config: ${CONFIG_FILE}"
fi

PLIST_PATH="${PLIST_DIR}/com.otix.node.plist"
echo "==> Generating launchd service at ${PLIST_PATH}..."
cat <<EOF > "${PLIST_PATH}"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.otix.node</string>
    <key>ProgramArguments</key>
    <array>
        <string>${TARGET_BIN}</string>
        <string>-config</string>
        <string>${CONFIG_FILE}</string>
        <string>-port</string>
        <string>8090</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/node.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/node.err.log</string>
    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>
EOF

echo "==> Registering and starting launchd agent..."
launchctl unload "${PLIST_PATH}" 2>/dev/null || true
launchctl load "${PLIST_PATH}"

echo ""
echo "=========================================================="
echo "  🎉 Otix Node is now running on macOS as a background service!"
echo "  WebUI & Claim PIN:  http://localhost:8090"
echo "  Config:             ${CONFIG_FILE}"
echo "  Logs:               ${LOG_DIR}/node.log"
echo "=========================================================="
