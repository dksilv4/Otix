import type {
  LatestReleaseInfo,
  PlatformDownloadOption,
  PlatformId,
  ReleaseAsset,
} from '../types'
import {
  DEFAULT_RELEASE_VERSION,
  GITHUB_RELEASE_DOWNLOAD_BASE,
} from '../constants/downloads-data'

/**
 * Detect client platform from navigator.userAgent / platform strings
 */
export const detectUserPlatform = (userAgent?: string): 'windows' | 'macos' | 'linux' => {
  const ua =
    userAgent ||
    (typeof window !== 'undefined' && typeof window.navigator !== 'undefined'
      ? window.navigator.userAgent || window.navigator.platform || ''
      : '')

  const lower = ua.toLowerCase()
  if (lower.includes('mac') || lower.includes('darwin') || lower.includes('os x')) return 'macos'
  if (lower.includes('win')) return 'windows'
  if (lower.includes('linux') || lower.includes('x11')) return 'linux'

  return 'windows'
}

/**
 * Format raw bytes into human readable format (MB, GB, KB)
 */
export const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '0 MB'
  const megabytes = bytes / (1024 * 1024)
  if (megabytes < 1) {
    const kilobytes = bytes / 1024
    return `${kilobytes.toFixed(0)} KB`
  }
  if (megabytes >= 1024) {
    const gigabytes = megabytes / 1024
    return `${gigabytes.toFixed(2)} GB`
  }
  return `${megabytes.toFixed(1)} MB`
}

/**
 * Format ISO timestamp into a user-friendly date string
 */
export const formatReleaseDate = (isoDate?: string): string => {
  if (!isoDate) return ''
  try {
    const d = new Date(isoDate)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

/**
 * Clean markdown bullet lines into human readable changelog notes
 */
export const parseReleaseNotesHighlights = (body?: string): string[] => {
  if (!body) return []
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- ') || line.startsWith('* '))
    .map((line) => line.replace(/^[-*]\s+/, ''))
    .filter((line) => line.length > 0 && !line.startsWith('Full Changelog'))
    .slice(0, 8)
}

/**
 * Helper to find an asset by name patterns or regex
 */
export const findAsset = (
  assets: ReleaseAsset[],
  patterns: (string | RegExp)[],
): ReleaseAsset | undefined => {
  return assets.find((asset) =>
    patterns.some((pattern) =>
      typeof pattern === 'string'
        ? asset.name.toLowerCase().includes(pattern.toLowerCase())
        : pattern.test(asset.name),
    ),
  )
}

/**
 * Build download URL with fallback to standard releases convention
 */
export const buildDownloadUrl = (
  version: string,
  filename: string,
  asset?: ReleaseAsset,
): string => {
  if (asset?.browserDownloadUrl) return asset.browserDownloadUrl
  const tag = version.startsWith('v') ? version : `v${version}`
  return `${GITHUB_RELEASE_DOWNLOAD_BASE}/${tag}/${filename}`
}

/**
 * Resolves structured platform options from latest release info
 */
export const resolvePlatformOptions = (
  info: LatestReleaseInfo,
): PlatformDownloadOption[] => {
  const v = info.version || DEFAULT_RELEASE_VERSION
  const assets = info.assets || []

  // Windows Assets
  const winSetupAsset = findAsset(assets, [/otix-setup/i, new RegExp(`Otix-Setup-${v}\\.exe`, 'i')])
  const winPortableAsset = findAsset(assets, [/otix-portable/i, new RegExp(`Otix-Portable-${v}\\.exe`, 'i')])
  const winNodeAsset = findAsset(assets, [/otix-node-windows/i, 'Otix-Node-Windows-x64.zip'])

  // macOS Assets
  const macArmDmgAsset = findAsset(assets, [/arm64.*\.dmg$/i])
  const macX64DmgAsset = findAsset(assets, [/x64.*\.dmg$/i])
  const macArmZipAsset = findAsset(assets, [/arm64.*\.zip$/i])
  const macX64ZipAsset = findAsset(assets, [/x64.*\.zip$/i])
  const macNodeAsset = findAsset(assets, ['Otix-Node.dmg'])

  // Linux Assets
  const linuxAppImageAsset = findAsset(assets, [/\.appimage$/i])
  const linuxDebAsset = findAsset(assets, [/\.deb$/i])
  const linuxNodeX64Asset = findAsset(assets, ['Otix-Node-Linux-x64.tar.gz'])
  const linuxNodeArmAsset = findAsset(assets, ['Otix-Node-Linux-arm64.tar.gz'])

  return [
    // Windows
    {
      id: 'win-installer',
      title: 'Windows Installer',
      platform: 'windows',
      arch: 'x64',
      kind: 'installer',
      filename: winSetupAsset?.name || `Otix-Setup-${v}.exe`,
      formattedSize: formatFileSize(winSetupAsset?.size || 126011555),
      downloadUrl: buildDownloadUrl(v, winSetupAsset?.name || `Otix-Setup-${v}.exe`, winSetupAsset),
      isPrimary: true,
      badge: 'Recommended',
      description: 'Standard 64-bit installer with automatic updates, desktop & start menu shortcuts.',
      architectureLabel: '64-bit (x64)',
    },
    {
      id: 'win-portable',
      title: 'Windows Portable',
      platform: 'windows',
      arch: 'x64',
      kind: 'portable',
      filename: winPortableAsset?.name || `Otix-Portable-${v}.exe`,
      formattedSize: formatFileSize(winPortableAsset?.size || 125804223),
      downloadUrl: buildDownloadUrl(v, winPortableAsset?.name || `Otix-Portable-${v}.exe`, winPortableAsset),
      isPrimary: false,
      badge: 'Zero Install',
      description: 'Single standalone executable. Runs immediately without installation or admin privileges.',
      architectureLabel: '64-bit (x64)',
    },
    {
      id: 'win-node',
      title: 'Otix Node for Windows',
      platform: 'windows',
      arch: 'x64',
      kind: 'zip',
      filename: winNodeAsset?.name || 'Otix-Node-Windows-x64.zip',
      formattedSize: formatFileSize(winNodeAsset?.size || 3712206),
      downloadUrl: buildDownloadUrl(v, winNodeAsset?.name || 'Otix-Node-Windows-x64.zip', winNodeAsset),
      isPrimary: false,
      badge: 'Companion Daemon',
      description: 'Headless background server for remote game sessions and media streaming.',
      architectureLabel: '64-bit (x64)',
    },

    // macOS
    {
      id: 'mac-arm64-dmg',
      title: 'macOS Apple Silicon',
      platform: 'macos',
      arch: 'arm64',
      kind: 'dmg',
      filename: macArmDmgAsset?.name || `Otix-${v}-arm64.dmg`,
      formattedSize: formatFileSize(macArmDmgAsset?.size || 140096460),
      downloadUrl: buildDownloadUrl(v, macArmDmgAsset?.name || `Otix-${v}-arm64.dmg`, macArmDmgAsset),
      isPrimary: true,
      badge: 'M1 / M2 / M3 / M4',
      description: 'Native Apple Silicon disk image (.dmg). Drag & drop to your Applications folder.',
      architectureLabel: 'Apple Silicon (arm64)',
    },
    {
      id: 'mac-x64-dmg',
      title: 'macOS Intel',
      platform: 'macos',
      arch: 'x64',
      kind: 'dmg',
      filename: macX64DmgAsset?.name || `Otix-${v}-x64.dmg`,
      formattedSize: formatFileSize(macX64DmgAsset?.size || 144280221),
      downloadUrl: buildDownloadUrl(v, macX64DmgAsset?.name || `Otix-${v}-x64.dmg`, macX64DmgAsset),
      isPrimary: false,
      badge: 'Intel 64-bit',
      description: 'Native disk image (.dmg) tailored for Intel-based Mac computers.',
      architectureLabel: 'Intel (x64)',
    },
    {
      id: 'mac-arm64-zip',
      title: 'macOS Apple Silicon (Archive)',
      platform: 'macos',
      arch: 'arm64',
      kind: 'zip',
      filename: macArmZipAsset?.name || `Otix-${v}-arm64.zip`,
      formattedSize: formatFileSize(macArmZipAsset?.size || 135653693),
      downloadUrl: buildDownloadUrl(v, macArmZipAsset?.name || `Otix-${v}-arm64.zip`, macArmZipAsset),
      isPrimary: false,
      description: 'Zipped application bundle for Apple Silicon without mounting a DMG.',
      architectureLabel: 'Apple Silicon (arm64)',
    },
    {
      id: 'mac-x64-zip',
      title: 'macOS Intel (Archive)',
      platform: 'macos',
      arch: 'x64',
      kind: 'zip',
      filename: macX64ZipAsset?.name || `Otix-${v}-x64.zip`,
      formattedSize: formatFileSize(macX64ZipAsset?.size || 139817548),
      downloadUrl: buildDownloadUrl(v, macX64ZipAsset?.name || `Otix-${v}-x64.zip`, macX64ZipAsset),
      isPrimary: false,
      description: 'Zipped application bundle for Intel Macs without mounting a DMG.',
      architectureLabel: 'Intel (x64)',
    },
    {
      id: 'mac-node',
      title: 'Otix Node for macOS',
      platform: 'macos',
      arch: 'universal',
      kind: 'dmg',
      filename: macNodeAsset?.name || 'Otix-Node.dmg',
      formattedSize: formatFileSize(macNodeAsset?.size || 7965688),
      downloadUrl: buildDownloadUrl(v, macNodeAsset?.name || 'Otix-Node.dmg', macNodeAsset),
      isPrimary: false,
      badge: 'Companion Daemon',
      description: 'Headless background daemon DMG for macOS server nodes.',
      architectureLabel: 'Universal (x64 / arm64)',
    },

    // Linux
    {
      id: 'linux-appimage',
      title: 'Linux AppImage',
      platform: 'linux',
      arch: 'x64',
      kind: 'appimage',
      filename: linuxAppImageAsset?.name || `Otix-${v}-x86_64.AppImage`,
      formattedSize: formatFileSize(linuxAppImageAsset?.size || 142662493),
      downloadUrl: buildDownloadUrl(v, linuxAppImageAsset?.name || `Otix-${v}-x86_64.AppImage`, linuxAppImageAsset),
      isPrimary: true,
      badge: 'Universal',
      description: 'Self-contained binary compatible with all major distributions (Ubuntu, Fedora, Arch, Debian).',
      architectureLabel: 'x86_64',
      command: `chmod +x ${linuxAppImageAsset?.name || `Otix-${v}-x86_64.AppImage`}`,
    },
    {
      id: 'linux-deb',
      title: 'Debian / Ubuntu Package',
      platform: 'linux',
      arch: 'x64',
      kind: 'deb',
      filename: linuxDebAsset?.name || `Otix-${v}-amd64.deb`,
      formattedSize: formatFileSize(linuxDebAsset?.size || 99328978),
      downloadUrl: buildDownloadUrl(v, linuxDebAsset?.name || `Otix-${v}-amd64.deb`, linuxDebAsset),
      isPrimary: false,
      badge: '.deb',
      description: 'Native package for Debian, Ubuntu, Linux Mint, Pop!_OS and derivatives.',
      architectureLabel: 'amd64',
      command: `sudo dpkg -i ${linuxDebAsset?.name || `Otix-${v}-amd64.deb`}`,
    },
    {
      id: 'linux-node-x64',
      title: 'Otix Node for Linux (x64)',
      platform: 'linux',
      arch: 'x64',
      kind: 'binary',
      filename: linuxNodeX64Asset?.name || 'Otix-Node-Linux-x64.tar.gz',
      formattedSize: formatFileSize(linuxNodeX64Asset?.size || 3572296),
      downloadUrl: buildDownloadUrl(v, linuxNodeX64Asset?.name || 'Otix-Node-Linux-x64.tar.gz', linuxNodeX64Asset),
      isPrimary: false,
      badge: 'Headless Server',
      description: 'Lightweight static daemon for Linux home servers and NAS systems.',
      architectureLabel: 'x64',
    },
    {
      id: 'linux-node-arm64',
      title: 'Otix Node for Linux (ARM64)',
      platform: 'linux',
      arch: 'arm64',
      kind: 'binary',
      filename: linuxNodeArmAsset?.name || 'Otix-Node-Linux-arm64.tar.gz',
      formattedSize: formatFileSize(linuxNodeArmAsset?.size || 3246549),
      downloadUrl: buildDownloadUrl(v, linuxNodeArmAsset?.name || 'Otix-Node-Linux-arm64.tar.gz', linuxNodeArmAsset),
      isPrimary: false,
      badge: 'Raspberry Pi / ARM',
      description: 'Optimized static daemon for ARM64 single-board computers and servers.',
      architectureLabel: 'arm64',
    },
  ]
}

/**
 * Get primary download option for a specific platform
 */
export const getPrimaryOptionForPlatform = (
  options: PlatformDownloadOption[],
  platform: 'windows' | 'macos' | 'linux',
): PlatformDownloadOption | undefined => {
  return options.find((opt) => opt.platform === platform && opt.isPrimary) ||
    options.find((opt) => opt.platform === platform)
}

/**
 * Generate CLI command to verify SHA-256 checksum on user's OS
 */
export const getVerificationCommand = (
  platform: PlatformId,
  filename: string,
): string => {
  switch (platform) {
    case 'windows':
      return `Get-FileHash -Algorithm SHA256 .\\${filename}`
    case 'macos':
      return `shasum -a 256 ./${filename}`
    case 'linux':
    case 'node':
    default:
      return `sha256sum ./${filename}`
  }
}

/**
 * Step-by-step instructions after clicking download
 */
export const getInstallationInstructions = (
  platform: PlatformId,
): string[] => {
  switch (platform) {
    case 'windows':
      return [
        'Open the downloaded installer (.exe) from your browser or Downloads folder.',
        'If Windows SmartScreen prompts, click "More info" and select "Run anyway".',
        'Follow the on-screen prompts; Otix will launch and be pinned to your Start Menu.',
      ]
    case 'macos':
      return [
        'Open the downloaded disk image (.dmg).',
        'Drag the Otix icon into your Applications folder.',
        'Launch Otix from Launchpad or Applications. On first launch, confirm Open if prompted.',
      ]
    case 'linux':
      return [
        'Open a terminal and navigate to your download directory.',
        'For AppImage: run "chmod +x Otix-*.AppImage" and execute it directly.',
        'For DEB: run "sudo dpkg -i Otix-*.deb" to install system-wide.',
      ]
    case 'node':
      return [
        'Extract the archive or run the container on your server.',
        'Configure your port 8090 and storage mounts in config.yaml.',
        'Otix Node starts automatically and pairs with your Otix desktop or web client.',
      ]
  }
}
