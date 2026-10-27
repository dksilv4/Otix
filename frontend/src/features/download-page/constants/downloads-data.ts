import type { LatestReleaseInfo, SystemRequirement } from '../types'

export const GITHUB_REPO_OWNER = 'dksilv4'
export const GITHUB_REPO_NAME = 'Otix'
export const GITHUB_API_LATEST = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`
export const GITHUB_RELEASE_DOWNLOAD_BASE = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/download`

export const DEFAULT_RELEASE_VERSION = '0.1.26'
export const DEFAULT_TAG_NAME = 'v0.1.26'
export const DEFAULT_PUBLISHED_AT = '2026-10-27T09:55:00Z'

export const DEFAULT_RELEASE_INFO: LatestReleaseInfo = {
  version: DEFAULT_RELEASE_VERSION,
  tagName: DEFAULT_TAG_NAME,
  name: 'Otix v0.1.26',
  publishedAt: DEFAULT_PUBLISHED_AT,
  releaseNotes:
    'Otix 0.1.26 delivers Go node companion auto-pairing, local game launcher and emulator profiles, library scanner and download auto-relocation, macOS ad-hoc deep code signing, full launcher theme selection, and critical Redis async socket lifecycle fixes eliminating error 500 crashes.',
  assets: [
    {
      name: `Otix-Setup-${DEFAULT_RELEASE_VERSION}.exe`,
      size: 126011555,
      browserDownloadUrl: `${GITHUB_RELEASE_DOWNLOAD_BASE}/${DEFAULT_TAG_NAME}/Otix-Setup-${DEFAULT_RELEASE_VERSION}.exe`,
    },
    {
      name: `Otix-Portable-${DEFAULT_RELEASE_VERSION}.exe`,
      size: 125804223,
      browserDownloadUrl: `${GITHUB_RELEASE_DOWNLOAD_BASE}/${DEFAULT_TAG_NAME}/Otix-Portable-${DEFAULT_RELEASE_VERSION}.exe`,
    },
    {
      name: `Otix-${DEFAULT_RELEASE_VERSION}-arm64.dmg`,
      size: 140096460,
      browserDownloadUrl: `${GITHUB_RELEASE_DOWNLOAD_BASE}/${DEFAULT_TAG_NAME}/Otix-${DEFAULT_RELEASE_VERSION}-arm64.dmg`,
    },
    {
      name: `Otix-${DEFAULT_RELEASE_VERSION}-x64.dmg`,
      size: 144280221,
      browserDownloadUrl: `${GITHUB_RELEASE_DOWNLOAD_BASE}/${DEFAULT_TAG_NAME}/Otix-${DEFAULT_RELEASE_VERSION}-x64.dmg`,
    },
    {
      name: `Otix-${DEFAULT_RELEASE_VERSION}-arm64.zip`,
      size: 135653693,
      browserDownloadUrl: `${GITHUB_RELEASE_DOWNLOAD_BASE}/${DEFAULT_TAG_NAME}/Otix-${DEFAULT_RELEASE_VERSION}-arm64.zip`,
    },
    {
      name: `Otix-${DEFAULT_RELEASE_VERSION}-x64.zip`,
      size: 139817548,
      browserDownloadUrl: `${GITHUB_RELEASE_DOWNLOAD_BASE}/${DEFAULT_TAG_NAME}/Otix-${DEFAULT_RELEASE_VERSION}-x64.zip`,
    },
    {
      name: `Otix-${DEFAULT_RELEASE_VERSION}-x86_64.AppImage`,
      size: 142662493,
      browserDownloadUrl: `${GITHUB_RELEASE_DOWNLOAD_BASE}/${DEFAULT_TAG_NAME}/Otix-${DEFAULT_RELEASE_VERSION}-x86_64.AppImage`,
    },
    {
      name: `Otix-${DEFAULT_RELEASE_VERSION}-amd64.deb`,
      size: 99328978,
      browserDownloadUrl: `${GITHUB_RELEASE_DOWNLOAD_BASE}/${DEFAULT_TAG_NAME}/Otix-${DEFAULT_RELEASE_VERSION}-amd64.deb`,
    },
    {
      name: 'Otix-Node-Windows-x64.zip',
      size: 3712206,
      browserDownloadUrl: `${GITHUB_RELEASE_DOWNLOAD_BASE}/${DEFAULT_TAG_NAME}/Otix-Node-Windows-x64.zip`,
    },
    {
      name: 'Otix-Node.dmg',
      size: 7965688,
      browserDownloadUrl: `${GITHUB_RELEASE_DOWNLOAD_BASE}/${DEFAULT_TAG_NAME}/Otix-Node.dmg`,
    },
    {
      name: 'Otix-Node-Linux-x64.tar.gz',
      size: 3572296,
      browserDownloadUrl: `${GITHUB_RELEASE_DOWNLOAD_BASE}/${DEFAULT_TAG_NAME}/Otix-Node-Linux-x64.tar.gz`,
    },
    {
      name: 'Otix-Node-Linux-arm64.tar.gz',
      size: 3246549,
      browserDownloadUrl: `${GITHUB_RELEASE_DOWNLOAD_BASE}/${DEFAULT_TAG_NAME}/Otix-Node-Linux-arm64.tar.gz`,
    },
    {
      name: 'my-otix-server.xml',
      size: 3201,
      browserDownloadUrl: `${GITHUB_RELEASE_DOWNLOAD_BASE}/${DEFAULT_TAG_NAME}/my-otix-server.xml`,
    },
  ],
}

export const SYSTEM_REQUIREMENTS: SystemRequirement[] = [
  {
    platform: 'windows',
    osName: 'Windows',
    minVersion: 'Windows 10 64-bit (1903+)',
    recommendedVersion: 'Windows 11 64-bit',
    ram: '4 GB (8 GB recommended for heavy libraries)',
    storage: '500 MB free storage',
    notes: 'DirectX 11 or higher capable graphics adapter for HW decoding.',
  },
  {
    platform: 'macos',
    osName: 'macOS',
    minVersion: 'macOS 11.0 (Big Sur)',
    recommendedVersion: 'macOS 14 (Sonoma) or macOS 15 (Sequoia)',
    ram: '4 GB (8 GB recommended)',
    storage: '600 MB free storage',
    notes: 'Native build available for Apple Silicon (M1/M2/M3/M4) and Intel.',
  },
  {
    platform: 'linux',
    osName: 'Linux',
    minVersion: 'Modern distro with glibc 2.28+ (Ubuntu 20.04+, Debian 10+, Fedora 30+)',
    recommendedVersion: 'Ubuntu 22.04+ or Arch Linux',
    ram: '4 GB RAM',
    storage: '500 MB free storage',
    notes: 'Wayland & X11 supported with VA-API / VDPAU hardware acceleration.',
  },
]

export const DOCKER_NODE_COMMAND = `docker run -d \\
  --name otix-node \\
  -p 8090:8090 \\
  -v /mnt/user/appdata/otix-node/config.yaml:/app/config.yaml \\
  -v /mnt/user/media:/storage/media \\
  ghcr.io/dksilv4/otix-node:latest`

export const UNRAID_TEMPLATE_URL =
  'https://raw.githubusercontent.com/dksilv4/Otix/main/node/unraid/my-otix-server.xml'

export interface DownloadFaqItem {
  question: string
  answer: string
}

export const DOWNLOAD_FAQS: DownloadFaqItem[] = [
  {
    question: 'Is Otix completely free and open-source?',
    answer:
      'Yes, Otix is 100% free and open-source under the MIT license. You can download and run it on as many devices as you like with zero subscriptions or paywalls.',
  },
  {
    question: 'How do automatic updates work?',
    answer:
      'The standard Windows Installer, macOS DMG, and Linux packages check our public release feed automatically. When a new version is released, Otix notifies you with release highlights and installs with a single click.',
  },
  {
    question: 'What is the difference between Installer and Portable versions?',
    answer:
      'The Windows Installer sets up desktop shortcuts, registers file associations, and supports automatic in-app updates. The Portable version is a single standalone executable that runs without installation, perfect for flash drives or restricted user accounts.',
  },
  {
    question: 'What is Otix Node?',
    answer:
      'Otix Node is an optional headless background companion daemon. Run it on your home server, NAS (such as Unraid, TrueNAS, or Synology), or dedicated secondary PC to stream media libraries, sync emulator saves, and monitor game sessions without keeping your desktop PC awake.',
  },
  {
    question: 'Why download directly from the website instead of GitHub?',
    answer:
      'The website downloads page auto-detects your operating system and hardware architecture, provides verified 1-click downloads, explains installation steps for your platform, and gives you direct access to companion server packages all in one unified place.',
  },
]

