import { describe, it, expect } from 'vitest'
import {
  formatBytes,
  getDriveLetter,
  hasEnoughDiskSpace,
  normalizePath,
} from '../utils/installer-utils'
import { REQUIRED_DISK_SPACE_BYTES } from '../constants'

describe('installer-utils', () => {
  describe('formatBytes', () => {
    it('handles 0 and negative bytes', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(-100)).toBe('0 B')
    })

    it('formats megabytes and gigabytes properly', () => {
      expect(formatBytes(1024 * 1024 * 450)).toBe('450.0 MB')
      expect(formatBytes(1024 * 1024 * 1024 * 12.5)).toBe('12.5 GB')
    })
  })

  describe('getDriveLetter', () => {
    it('extracts drive letters correctly on Windows', () => {
      expect(getDriveLetter('C:\\Program Files\\Otix')).toBe('C:')
      expect(getDriveLetter('d:\\Games\\Otix')).toBe('D:')
      expect(getDriveLetter('e:/otix')).toBe('E:')
      expect(getDriveLetter('')).toBe('C:')
    })
  })

  describe('hasEnoughDiskSpace', () => {
    it('validates disk space requirements correctly', () => {
      expect(hasEnoughDiskSpace(REQUIRED_DISK_SPACE_BYTES + 1000, REQUIRED_DISK_SPACE_BYTES)).toBe(true)
      expect(hasEnoughDiskSpace(REQUIRED_DISK_SPACE_BYTES - 1000, REQUIRED_DISK_SPACE_BYTES)).toBe(false)
    })
  })

  describe('normalizePath', () => {
    it('normalizes redundant slashes and backslashes', () => {
      expect(normalizePath('C:\\\\Program Files\\\\Otix')).toBe('C:/Program Files/Otix')
      expect(normalizePath('/usr//local///bin')).toBe('/usr/local/bin')
    })
  })
})
