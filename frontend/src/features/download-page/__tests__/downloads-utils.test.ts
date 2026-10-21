import { describe, it, expect } from 'vitest'
import {
  detectUserPlatform,
  formatFileSize,
  formatReleaseDate,
  parseReleaseNotesHighlights,
  resolvePlatformOptions,
  getPrimaryOptionForPlatform,
  getVerificationCommand,
  getInstallationInstructions,
  buildDownloadUrl,
} from '../utils/downloads-utils'
import { DEFAULT_RELEASE_INFO } from '../constants/downloads-data'

describe('downloads-utils', () => {
  describe('detectUserPlatform', () => {
    it('detects Windows from userAgent string', () => {
      expect(
        detectUserPlatform(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
        ),
      ).toBe('windows')
    })

    it('detects macOS from userAgent string', () => {
      expect(
        detectUserPlatform(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        ),
      ).toBe('macos')
      expect(detectUserPlatform('Darwin Kernel Version 23.0.0')).toBe('macos')
    })

    it('detects Linux from userAgent string', () => {
      expect(
        detectUserPlatform('Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0'),
      ).toBe('linux')
    })

    it('defaults to windows if unrecognized', () => {
      expect(detectUserPlatform('UnknownOS 1.0')).toBe('windows')
    })
  })

  describe('formatFileSize', () => {
    it('formats bytes into KB, MB and GB correctly', () => {
      expect(formatFileSize(0)).toBe('0 MB')
      expect(formatFileSize(512 * 1024)).toBe('512 KB')
      expect(formatFileSize(126011555)).toBe('120.2 MB')
      expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe('2.00 GB')
    })
  })

  describe('formatReleaseDate', () => {
    it('formats valid ISO date strings', () => {
      const res = formatReleaseDate('2026-10-21T02:41:14Z')
      expect(res).toContain('2026')
      expect(res).toContain('Oct')
    })

    it('returns empty string for undefined or invalid dates', () => {
      expect(formatReleaseDate(undefined)).toBe('')
      expect(formatReleaseDate('invalid-date')).toBe('')
    })
  })

  describe('parseReleaseNotesHighlights', () => {
    it('extracts bullet points and skips headers', () => {
      const body = `
# Release Notes v0.1.24
- Added public updater feed
- Improved library scan performance
* Support for direct bitstream audio
### Bugfixes
- Fixed background worker sync
Full Changelog: https://github.com/dksilv4/Otix
`
      const highlights = parseReleaseNotesHighlights(body)
      expect(highlights).toEqual([
        'Added public updater feed',
        'Improved library scan performance',
        'Support for direct bitstream audio',
        'Fixed background worker sync',
      ])
    })

    it('handles empty or null body gracefully', () => {
      expect(parseReleaseNotesHighlights('')).toEqual([])
      expect(parseReleaseNotesHighlights(undefined)).toEqual([])
    })
  })

  describe('resolvePlatformOptions', () => {
    it('maps default assets into Windows, macOS, and Linux options', () => {
      const options = resolvePlatformOptions(DEFAULT_RELEASE_INFO)
      expect(options.length).toBeGreaterThan(5)

      const winSetup = options.find((o) => o.id === 'win-installer')
      expect(winSetup).toBeDefined()
      expect(winSetup?.filename).toContain('Otix-Setup')
      expect(winSetup?.isPrimary).toBe(true)

      const winPortable = options.find((o) => o.id === 'win-portable')
      expect(winPortable).toBeDefined()
      expect(winPortable?.filename).toContain('Otix-Portable')

      const macArm = options.find((o) => o.id === 'mac-arm64-dmg')
      expect(macArm).toBeDefined()
      expect(macArm?.filename).toContain('arm64.dmg')

      const linuxAppImage = options.find((o) => o.id === 'linux-appimage')
      expect(linuxAppImage).toBeDefined()
      expect(linuxAppImage?.filename).toContain('AppImage')
    })
  })

  describe('getPrimaryOptionForPlatform', () => {
    it('returns primary option for windows', () => {
      const options = resolvePlatformOptions(DEFAULT_RELEASE_INFO)
      const primary = getPrimaryOptionForPlatform(options, 'windows')
      expect(primary?.id).toBe('win-installer')
    })

    it('returns primary option for macos', () => {
      const options = resolvePlatformOptions(DEFAULT_RELEASE_INFO)
      const primary = getPrimaryOptionForPlatform(options, 'macos')
      expect(primary?.id).toBe('mac-arm64-dmg')
    })

    it('returns primary option for linux', () => {
      const options = resolvePlatformOptions(DEFAULT_RELEASE_INFO)
      const primary = getPrimaryOptionForPlatform(options, 'linux')
      expect(primary?.id).toBe('linux-appimage')
    })
  })

  describe('getVerificationCommand', () => {
    it('generates correct commands for each platform', () => {
      expect(getVerificationCommand('windows', 'Otix-Setup.exe')).toBe(
        'Get-FileHash -Algorithm SHA256 .\\Otix-Setup.exe',
      )
      expect(getVerificationCommand('macos', 'Otix.dmg')).toBe(
        'shasum -a 256 ./Otix.dmg',
      )
      expect(getVerificationCommand('linux', 'Otix.AppImage')).toBe(
        'sha256sum ./Otix.AppImage',
      )
    })
  })

  describe('getInstallationInstructions', () => {
    it('provides multi-step instructions for all platforms', () => {
      expect(getInstallationInstructions('windows').length).toBeGreaterThanOrEqual(3)
      expect(getInstallationInstructions('macos').length).toBeGreaterThanOrEqual(3)
      expect(getInstallationInstructions('linux').length).toBeGreaterThanOrEqual(3)
      expect(getInstallationInstructions('node').length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('buildDownloadUrl', () => {
    it('builds standard GitHub download URL when asset url is not present', () => {
      const url = buildDownloadUrl('0.1.24', 'test.exe')
      expect(url).toBe('https://github.com/dksilv4/Otix/releases/download/v0.1.24/test.exe')
    })

    it('prefers asset browserDownloadUrl if available', () => {
      const url = buildDownloadUrl('0.1.24', 'test.exe', {
        name: 'test.exe',
        size: 100,
        browserDownloadUrl: 'https://custom.download/test.exe',
      })
      expect(url).toBe('https://custom.download/test.exe')
    })
  })
})
