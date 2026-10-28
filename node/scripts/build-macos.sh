#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist/node"

mkdir -p "${DIST_DIR}"

echo "==> Building Otix Node for macOS (Apple Silicon arm64)..."
(cd "${NODE_DIR}" && CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o "${DIST_DIR}/otix-node-darwin-arm64" ".")

echo "==> Building Otix Node for macOS (Intel amd64)..."
(cd "${NODE_DIR}" && CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o "${DIST_DIR}/otix-node-darwin-amd64" ".")

BIN_SRC="${DIST_DIR}/otix-node-darwin-arm64"
if command -v lipo >/dev/null 2>&1; then
    echo "==> Packaging Universal 2 binary (arm64 + x86_64)..."
    lipo -create -output "${DIST_DIR}/otix-node-darwin-universal" \
        "${DIST_DIR}/otix-node-darwin-arm64" \
        "${DIST_DIR}/otix-node-darwin-amd64"
    file "${DIST_DIR}/otix-node-darwin-universal"
    BIN_SRC="${DIST_DIR}/otix-node-darwin-universal"
    echo "==> Universal binary created at: ${BIN_SRC}"
else
    echo "==> lipo not found (non-macOS build host). Using arm64 binary for app bundle."
fi

if command -v hdiutil >/dev/null 2>&1; then
    echo "==> Creating macOS App Bundle (Otix Node.app)..."
    APP_DIR="${DIST_DIR}/Otix Node.app"
    rm -rf "${APP_DIR}"
    mkdir -p "${APP_DIR}/Contents/MacOS"
    mkdir -p "${APP_DIR}/Contents/Resources"

    cp "${BIN_SRC}" "${APP_DIR}/Contents/MacOS/otix-node"
    chmod +x "${APP_DIR}/Contents/MacOS/otix-node"

    ICON_SRC="${NODE_DIR}/../desktop/assets/icon.icns"
    if [ -f "${ICON_SRC}" ]; then
        cp "${ICON_SRC}" "${APP_DIR}/Contents/Resources/AppIcon.icns"
    fi

    cat <<EOF > "${APP_DIR}/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>otix-node</string>
    <key>CFBundleIdentifier</key>
    <string>com.otix.node</string>
    <key>CFBundleName</key>
    <string>Otix Node</string>
    <key>CFBundleDisplayName</key>
    <string>Otix Node</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>0.0.1</string>
    <key>CFBundleVersion</key>
    <string>0.0.1</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSDownloadsFolderUsageDescription</key>
    <string>Otix Node requires access to your Downloads folder to store and manage game downloads.</string>
    <key>NSDocumentsFolderUsageDescription</key>
    <string>Otix Node requires access to your Documents folder to manage game saves and libraries.</string>
    <key>NSDesktopFolderUsageDescription</key>
    <string>Otix Node requires access to your Desktop folder to manage game files and shortcuts.</string>
    <key>NSRemovableVolumesUsageDescription</key>
    <string>Otix Node requires access to external drives to store and manage your game libraries.</string>
    <key>NSNetworkVolumesUsageDescription</key>
    <string>Otix Node requires access to network shares to manage remote game libraries.</string>
</dict>
</plist>
EOF

    if command -v codesign >/dev/null 2>&1; then
        echo "==> Signing Otix Node.app bundle..."
        codesign --force --deep --sign - "${APP_DIR}"
    fi

    echo "==> Packaging Otix-Node.dmg..."
    DMG_STAGE="${DIST_DIR}/dmg_stage"
    rm -rf "${DMG_STAGE}"
    mkdir -p "${DMG_STAGE}"
    cp -R "${APP_DIR}" "${DMG_STAGE}/"
    ln -s /Applications "${DMG_STAGE}/Applications"

    DMG_OUT="${DIST_DIR}/Otix-Node.dmg"
    rm -f "${DMG_OUT}"
    hdiutil create -volname "Otix Node" -srcfolder "${DMG_STAGE}" -ov -format UDZO "${DMG_OUT}" >/dev/null
    rm -rf "${DMG_STAGE}"
    echo "==> Created DMG for direct user download at: ${DMG_OUT}"
fi

echo "==> macOS build complete!"
