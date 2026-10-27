import type { DesktopPlatformInfo } from '@/lib/desktop/platform'

export const OTIX_GITHUB_REPO_URL = 'https://github.com/dksilv4/Otix'
export const OTIX_GITHUB_ISSUES_URL = 'https://github.com/dksilv4/Otix/issues'
export const OTIX_WELCOME_PATH = '/welcome'
export const OTIX_DOCS_PATH = '/docs'
export const OTIX_RELEASE_NOTES_PATH = '/settings/release-notes'

export function getPlatformDisplayLabel(platform: DesktopPlatformInfo): string {
  if (platform.isMac) return 'macOS'
  if (platform.isWindows) return 'Windows'
  if (platform.isLinux) return 'Linux'
  return 'Web / Browser'
}

export function getRuntimeLabel(isDesktopApp: boolean): string {
  return isDesktopApp ? 'Desktop Application (Electron)' : 'Web Application (PWA / Browser)'
}
