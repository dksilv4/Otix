import { describe, it, expect, beforeEach } from 'vitest'
import {
  formatBytes,
  formatSpeed,
  getUpdateStatusLabel,
  parseReleaseNotes,
  formatUpdateError,
  readAutoCheckPreference,
  saveAutoCheckPreference,
  readAutoDownloadPreference,
  saveAutoDownloadPreference,
} from '../utils/updater-utils'

describe('updater-utils', () => {
  describe('formatBytes', () => {
    it('handles 0 and negative bytes', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(-100)).toBe('0 B')
    })

    it('formats bytes correctly', () => {
      expect(formatBytes(500)).toBe('500 B')
      expect(formatBytes(1024)).toBe('1.0 KB')
      expect(formatBytes(1024 * 1024 * 14.5)).toBe('14.5 MB')
      expect(formatBytes(1024 * 1024 * 1024 * 2.3)).toBe('2.3 GB')
    })
  })

  describe('formatSpeed', () => {
    it('handles 0 or negative transfer speeds', () => {
      expect(formatSpeed(0)).toBe('0 KB/s')
      expect(formatSpeed(-10)).toBe('0 KB/s')
    })

    it('formats speeds correctly', () => {
      expect(formatSpeed(1024 * 512)).toBe('512.0 KB/s')
      expect(formatSpeed(1024 * 1024 * 3.5)).toBe('3.5 MB/s')
    })
  })

  describe('getUpdateStatusLabel', () => {
    it('returns appropriate human-readable status labels', () => {
      expect(getUpdateStatusLabel('checking')).toBe('Checking for updates...')
      expect(getUpdateStatusLabel('available', '1.2.0')).toBe('Update v1.2.0 available')
      expect(getUpdateStatusLabel('available')).toBe('New update available')
      expect(getUpdateStatusLabel('downloading')).toBe('Downloading update...')
      expect(getUpdateStatusLabel('downloaded', '1.2.0')).toBe('Version v1.2.0 ready to install')
      expect(getUpdateStatusLabel('downloaded')).toBe('Update ready to install')
      expect(getUpdateStatusLabel('not-available')).toBe('Otix is up to date')
      expect(getUpdateStatusLabel('error')).toBe('Update check failed')
      expect(getUpdateStatusLabel('idle')).toBe('Up to date')
    })
  })

  describe('parseReleaseNotes', () => {
    it('returns empty array when given null, undefined, or empty string', () => {
      expect(parseReleaseNotes(null)).toEqual([])
      expect(parseReleaseNotes(undefined)).toEqual([])
      expect(parseReleaseNotes('')).toEqual([])
      expect(parseReleaseNotes('   ')).toEqual([])
    })

    it('cleans markdown bullet symbols and trims lines', () => {
      const raw = `
        * Feature 1: In-app updater
        - Feature 2: Progress dialog
        • Feature 3: Setting toggles
        1. Feature 4: Numbered item
        Plain text line without prefix
      `
      const parsed = parseReleaseNotes(raw)
      expect(parsed).toEqual([
        'Feature 1: In-app updater',
        'Feature 2: Progress dialog',
        'Feature 3: Setting toggles',
        'Feature 4: Numbered item',
        'Plain text line without prefix',
      ])
    })
  })

  describe('preferences storage', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('reads and saves autoCheck preference correctly', () => {
      expect(readAutoCheckPreference()).toBe(true)
      saveAutoCheckPreference(false)
      expect(readAutoCheckPreference()).toBe(false)
      saveAutoCheckPreference(true)
      expect(readAutoCheckPreference()).toBe(true)
    })

    it('reads and saves autoDownload preference correctly', () => {
      expect(readAutoDownloadPreference()).toBe(true)
      saveAutoDownloadPreference(false)
      expect(readAutoDownloadPreference()).toBe(false)
      saveAutoDownloadPreference(true)
      expect(readAutoDownloadPreference()).toBe(true)
    })
  })

  describe('formatUpdateError', () => {
    it('returns null for empty or null error', () => {
      expect(formatUpdateError(null)).toBeNull()
      expect(formatUpdateError(undefined)).toBeNull()
      expect(formatUpdateError('')).toBeNull()
    })

    it('sanitizes 404 releases.atom private repo error', () => {
      const raw = `404 "method: GET url: https://github.com/dksilv4/Otix/releases.atom\n\nPlease double check that your authentication token is correct. Due to security reasons, actual status maybe not reported, but 404.\n"`
      expect(formatUpdateError(raw)).toBe(
        'Update check unavailable: GitHub repository is private or requires authentication.'
      )
    })

    it('sanitizes raw HTTP header dumps and cleans message', () => {
      const raw = `500 Internal Server Error\nHeaders: { ... }`
      expect(formatUpdateError(raw)).toBe('Internal Server Error')
    })

    it('passes through ordinary friendly error messages', () => {
      expect(formatUpdateError('Network connection lost')).toBe('Network connection lost')
    })
  })
})
