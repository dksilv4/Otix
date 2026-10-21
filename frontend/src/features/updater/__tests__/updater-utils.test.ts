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
  readAllowPrereleasePreference,
  saveAllowPrereleasePreference,
  getUpdateModalTitle,
  getUpdateModalDescription,
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

  describe('getUpdateModalTitle and getUpdateModalDescription', () => {
    it('returns correct titles for different update phases', () => {
      expect(getUpdateModalTitle('downloaded', true, false)).toBe('Update Ready to Install')
      expect(getUpdateModalTitle('downloading', false, true)).toBe('Downloading Update')
      expect(getUpdateModalTitle('available', false, false)).toBe('New Update Available')
      expect(getUpdateModalTitle('error', false, false)).toBe('Update Error')
      expect(getUpdateModalTitle('not-available', false, false)).toBe('Otix is Up to Date')
      expect(getUpdateModalTitle('idle', false, false)).toBe('Software Update')
    })

    it('returns correct descriptions for different update phases', () => {
      expect(getUpdateModalDescription('downloaded', true, false)).toContain('ready to apply')
      expect(getUpdateModalDescription('downloading', false, true)).toContain('Downloading the update')
      expect(getUpdateModalDescription('available', false, false)).toContain('newer release is available')
      expect(getUpdateModalDescription('error', false, false)).toContain('Could not complete update')
      expect(getUpdateModalDescription('not-available', false, false)).toContain('newest version')
      expect(getUpdateModalDescription('idle', false, false)).toContain('Manage client software updates')
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

    it('filters out markdown headings, horizontal dividers, and automated changelog links', () => {
      const raw = `
        ## Otix Release v0.1.23

        ### 🚀 What's Changed

        * feat(updater): private feed check (72b8203e)
        * fix(desktop): ps-list unpack (80624955)

        ---
        **Full Changelog**: https://github.com/dksilv4/Otix/compare/v0.1.22...v0.1.23
        Full Changelog: https://github.com/dksilv4/Otix
      `
      const parsed = parseReleaseNotes(raw)
      expect(parsed).toEqual([
        'feat(updater): private feed check (72b8203e)',
        'fix(desktop): ps-list unpack (80624955)',
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

    it('reads and saves allowPrerelease preference correctly', () => {
      expect(readAllowPrereleasePreference()).toBe(false)
      saveAllowPrereleasePreference(true)
      expect(readAllowPrereleasePreference()).toBe(true)
      saveAllowPrereleasePreference(false)
      expect(readAllowPrereleasePreference()).toBe(false)
    })
  })

  describe('formatUpdateError', () => {
    it('returns null for empty or null error', () => {
      expect(formatUpdateError(null)).toBeNull()
      expect(formatUpdateError(undefined)).toBeNull()
      expect(formatUpdateError('')).toBeNull()
    })

    it('sanitizes 404 releases.atom error', () => {
      const raw = `404 "method: GET url: https://github.com/dksilv4/Otix/releases.atom\n"`
      expect(formatUpdateError(raw)).toBe(
        'Update check unavailable: release servers returned 404.'
      )
    })

    it('sanitizes 403 rate limit error', () => {
      expect(formatUpdateError('API rate limit exceeded')).toBe(
        'GitHub API rate limit exceeded. Please try again later.'
      )
    })

    it('sanitizes network disconnected error', () => {
      expect(formatUpdateError('net::ERR_INTERNET_DISCONNECTED')).toBe(
        'Network error: Unable to reach update servers. Check your connection.'
      )
    })

    it('sanitizes ETIMEDOUT error', () => {
      expect(formatUpdateError('ETIMEDOUT to host')).toBe(
        'Connection timed out while checking for updates.'
      )
    })

    it('sanitizes checksum mismatch error', () => {
      expect(formatUpdateError('sha512 checksum mismatch')).toBe(
        'Update package verification failed: Checksum mismatch.'
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
