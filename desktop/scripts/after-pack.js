const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * electron-builder afterPack hook.
 *
 * Ensures macOS bundles produced without a paid Apple Developer certificate
 * are cleanly ad-hoc signed so macOS Gatekeeper / AMFI marks them as
 * "unidentified developer" (allowing the user to click "Open Anyway" in
 * System Settings > Privacy & Security) instead of showing "app is damaged/broken".
 */
exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  if (!fs.existsSync(appPath)) {
    console.warn(`[afterPack] App bundle not found at: ${appPath}`);
    return;
  }

  // If a paid Apple Developer certificate is configured in environment, let official signing handle it
  if (process.env.CSC_LINK || process.env.CSC_NAME || process.env.APPLE_ID) {
    console.log('[afterPack] Official Apple Developer credentials detected in environment; skipping ad-hoc signing.');
    return;
  }

  console.log(`[afterPack] Performing ad-hoc deep code signing on: ${appPath}`);

  // 1. Clear quarantine/provenance extended attributes that may have leaked from dependencies
  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' });
  } catch (err) {
    console.warn(`[afterPack] xattr notice: ${err.message}`);
  }

  // 2. Perform deep ad-hoc signing with --force
  try {
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
    console.log('[afterPack] Ad-hoc deep codesign completed successfully.');
  } catch (err) {
    console.error(`[afterPack] Failed to codesign app bundle: ${err.message}`);
    throw err;
  }

  // 3. Verify bundle signature validity
  try {
    execSync(`codesign --verify --deep --strict --verbose=2 "${appPath}"`, { stdio: 'inherit' });
    console.log('[afterPack] Codesign verification PASSED: bundle is valid on disk.');
  } catch (err) {
    console.error(`[afterPack] Codesign verification FAILED: ${err.message}`);
    throw err;
  }
};
