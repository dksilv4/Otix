import { describe, it, expect } from 'vitest'
import {
  formatDisplayTitle,
  formatDisplayResolution,
  getInternalStorageDisks,
  formatUptime,
  suggestDuplicateNodeName,
  suggestDuplicateNodeUrl,
} from '../node-machine'

describe('node-machine utils', () => {
  describe('formatDisplayTitle', () => {
    it('returns default fallback when display is missing or empty', () => {
      expect(formatDisplayTitle(null)).toBe('Display')
      expect(formatDisplayTitle(undefined)).toBe('Display')
      expect(formatDisplayTitle({})).toBe('Display')
    })

    it('strips raw Windows display device path from name', () => {
      expect(formatDisplayTitle({ name: 'Display 1 (\\\\.\\DISPLAY1)' })).toBe('Display 1')
      expect(formatDisplayTitle({ name: 'Primary Display (\\\\.\\DISPLAY2)' })).toBe('Primary Display')
      expect(formatDisplayTitle({ name: '\\\\.\\DISPLAY1', index: 1 })).toBe('Display 1')
    })

    it('uses model name when name is generic or missing', () => {
      expect(
        formatDisplayTitle({
          name: 'Generic PnP Monitor',
          model: 'LG ULTRAGEAR 27GP850',
        }),
      ).toBe('LG ULTRAGEAR 27GP850')

      expect(
        formatDisplayTitle({
          name: '',
          model: 'ROG PG279Q',
          manufacturer: 'ASUS',
        }),
      ).toBe('ASUS ROG PG279Q')
    })

    it('falls back to manufacturer with index when model is also generic or empty', () => {
      expect(
        formatDisplayTitle({
          name: 'Generic PnP Monitor',
          model: '2560x1440 Display',
          manufacturer: 'Samsung',
          index: 2,
        }),
      ).toBe('Samsung Display 2')

      expect(
        formatDisplayTitle({
          name: 'Generic PnP Monitor',
          index: 3,
        }),
      ).toBe('Display 3')
    })

    it('preserves clean branded display name', () => {
      expect(formatDisplayTitle({ name: 'Dell U2720Q' })).toBe('Dell U2720Q')
      expect(formatDisplayTitle({ name: 'Samsung Odyssey Neo G9' })).toBe('Samsung Odyssey Neo G9')
    })
  })

  describe('formatDisplayResolution', () => {
    it('formats resolution with refresh rate', () => {
      expect(
        formatDisplayResolution({
          resolution: '2560x1440',
          refreshRate: 144,
        }),
      ).toBe('2560x1440 @ 144Hz')
    })

    it('falls back to width and height when resolution string is missing', () => {
      expect(
        formatDisplayResolution({
          width: 1920,
          height: 1080,
          refreshRate: 60,
        }),
      ).toBe('1920x1080 @ 60Hz')
    })

    it('returns plain resolution when refresh rate is not provided or 0', () => {
      expect(
        formatDisplayResolution({
          resolution: '3840x2160',
        }),
      ).toBe('3840x2160')
    })
  })

  describe('getInternalStorageDisks', () => {
    it('filters out USB, flash, and removable drives', () => {
      const storage = [
        {
          drive: 'C:\\',
          fileSystem: 'NTFS',
          totalBytes: 1000,
          freeBytes: 200,
          usedBytes: 800,
          usagePercent: 80,
        },
        {
          drive: 'D:\\',
          label: 'Data Storage',
          fileSystem: 'NTFS',
          totalBytes: 2000,
          freeBytes: 500,
          usedBytes: 1500,
          usagePercent: 75,
        },
        {
          drive: 'E:\\',
          label: 'USB Backup Drive',
          fileSystem: 'FAT32',
          totalBytes: 128,
          freeBytes: 64,
          usedBytes: 64,
          usagePercent: 50,
        },
        {
          drive: 'F:\\',
          label: 'Removable Media',
          fileSystem: 'exFAT',
          totalBytes: 64,
          freeBytes: 32,
          usedBytes: 32,
          usagePercent: 50,
        },
        {
          drive: 'G:\\',
          label: 'Flash Drive',
          fileSystem: 'FAT32',
          totalBytes: 32,
          freeBytes: 16,
          usedBytes: 16,
          usagePercent: 50,
        },
      ]

      const internal = getInternalStorageDisks(storage)
      expect(internal).toHaveLength(2)
      expect(internal.map((d) => d.drive)).toEqual(['C:\\', 'D:\\'])
    })

    it('handles empty or null storage array gracefully', () => {
      expect(getInternalStorageDisks(null)).toEqual([])
      expect(getInternalStorageDisks(undefined)).toEqual([])
      expect(getInternalStorageDisks([])).toEqual([])
    })
  })

  describe('formatUptime', () => {
    it('formats uptime in hours and minutes', () => {
      expect(formatUptime(3660)).toBe('1h 1m')
      expect(formatUptime(7200)).toBe('2h 0m')
      expect(formatUptime(180)).toBe('3m')
      expect(formatUptime(0)).toBe('Just started')
      expect(formatUptime(-5)).toBe('Just started')
      expect(formatUptime(undefined)).toBe('Just started')
    })
  })

  describe('suggestDuplicateNodeName and URL', () => {
    it('suggests duplicate name with (Copy)', () => {
      expect(suggestDuplicateNodeName('Rig 1', [])).toBe('Rig 1 (Copy)')
      expect(suggestDuplicateNodeName('Rig 1', ['Rig 1 (Copy)'])).toBe('Rig 1 (Copy 2)')
    })

    it('suggests incremented port for duplicate URL', () => {
      expect(suggestDuplicateNodeUrl('http://127.0.0.1:8090')).toBe('http://127.0.0.1:8091')
      expect(suggestDuplicateNodeUrl(null)).toBe('http://127.0.0.1:8091')
    })
  })
})
