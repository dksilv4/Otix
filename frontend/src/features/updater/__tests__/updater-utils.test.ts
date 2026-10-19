import { describe, it, expect } from 'vitest'
import {
  formatBytes,
  formatSpeed,
  getUpdateStatusLabel,
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
})
