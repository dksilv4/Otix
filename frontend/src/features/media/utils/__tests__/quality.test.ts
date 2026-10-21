import { describe, it, expect } from 'vitest'
import {
  formatBitrate,
  buildQualityOptions,
  findQualityOption,
  getQualityBadgeLabel,
} from '../quality'

describe('media quality utils', () => {
  describe('formatBitrate', () => {
    it('returns empty string for non-positive values', () => {
      expect(formatBitrate(0)).toBe('')
      expect(formatBitrate(-1)).toBe('')
      expect(formatBitrate(NaN)).toBe('')
    })

    it('formats values under 1 Mbps in Kbps', () => {
      expect(formatBitrate(720_000)).toBe('720 Kbps')
      expect(formatBitrate(320_000)).toBe('320 Kbps')
    })

    it('formats values >= 1 Mbps in Mbps', () => {
      expect(formatBitrate(8_000_000)).toBe('8 Mbps')
      expect(formatBitrate(4_500_000)).toBe('4.5 Mbps')
      expect(formatBitrate(12_000_000)).toBe('12 Mbps')
    })
  })

  describe('buildQualityOptions', () => {
    it('returns default presets when no HLS levels provided', () => {
      const options = buildQualityOptions()
      expect(options[0].id).toBe('auto')
      expect(options.some((o) => o.id === '1080p')).toBe(true)
      expect(options.some((o) => o.id === '720p')).toBe(true)
      expect(options.some((o) => o.id === '480p')).toBe(true)
      expect(options.some((o) => o.id === '360p')).toBe(true)
    })

    it('includes Original when hasDirectPlay is true', () => {
      const options = buildQualityOptions({ hasDirectPlay: true })
      expect(options[0].id).toBe('auto')
      expect(options[1].id).toBe('original')
      expect(options[1].isOriginal).toBe(true)
    })

    it('maps HLS multi-variant levels and sorts descending by resolution', () => {
      const levels = [
        { height: 720, width: 1280, bitrate: 2_500_000 },
        { height: 1080, width: 1920, bitrate: 6_000_000 },
        { height: 480, width: 854, bitrate: 1_200_000 },
      ]
      const options = buildQualityOptions({ hlsLevels: levels, hasDirectPlay: true })
      expect(options[0].id).toBe('auto')
      expect(options[1].id).toBe('original')
      // Next should be 1080p, then 720p, then 480p
      expect(options[2].height).toBe(1080)
      expect(options[2].hlsLevelIndex).toBe(1)
      expect(options[3].height).toBe(720)
      expect(options[3].hlsLevelIndex).toBe(0)
      expect(options[4].height).toBe(480)
      expect(options[4].hlsLevelIndex).toBe(2)
    })
  })

  describe('findQualityOption', () => {
    it('finds existing quality option by id', () => {
      const options = buildQualityOptions({ hasDirectPlay: true })
      expect(findQualityOption(options, 'auto')?.isAuto).toBe(true)
      expect(findQualityOption(options, 'original')?.isOriginal).toBe(true)
      expect(findQualityOption(options, '720p')?.height).toBe(720)
      expect(findQualityOption(options, 'unknown')).toBeUndefined()
    })
  })

  describe('getQualityBadgeLabel', () => {
    const options = buildQualityOptions({ hasDirectPlay: true })

    it('formats auto label with and without resolved height', () => {
      expect(getQualityBadgeLabel('auto', options)).toBe('Auto')
      expect(getQualityBadgeLabel('auto', options, 1080)).toBe('Auto (1080p)')
    })

    it('formats original label', () => {
      expect(getQualityBadgeLabel('original', options)).toBe('Original')
    })

    it('formats preset heights', () => {
      expect(getQualityBadgeLabel('1080p', options)).toBe('1080p')
      expect(getQualityBadgeLabel('720p', options)).toBe('720p')
    })
  })
})
