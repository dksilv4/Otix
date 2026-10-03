import { describe, it, expect } from 'vitest'
import { formatRAM } from '../utils'

describe('formatRAM', () => {
  it('formats raw OS usable RAM bytes (31.1 GB) to installed physical capacity 32 GB', () => {
    // 33346146304 bytes (~31.05 GB usable reported by Windows on a 32GB system)
    expect(formatRAM(33346146304)).toBe('32 GB')
  })

  it('formats exact power-of-two 32 GB properly', () => {
    expect(formatRAM(32 * 1024 * 1024 * 1024)).toBe('32 GB')
  })

  it('normalizes common system memory configurations with hardware reservation', () => {
    // 16 GB with APU/iGPU reserve (~14.5 GB) -> 16 GB
    expect(formatRAM(15569256448)).toBe('16 GB')
    // 8 GB laptop with ~7.2 GB usable -> 8 GB
    expect(formatRAM(7730941132)).toBe('8 GB')
    // 64 GB workstation with ~62.8 GB usable -> 64 GB
    expect(formatRAM(67431200000)).toBe('64 GB')
    // 24 GB non-binary DDR5 -> 24 GB
    expect(formatRAM(25000000000)).toBe('24 GB')
    // 48 GB non-binary DDR5 -> 48 GB
    expect(formatRAM(50000000000)).toBe('48 GB')
  })

  it('handles null, undefined, and zero gracefully', () => {
    expect(formatRAM(null)).toBe('0 B')
    expect(formatRAM(undefined)).toBe('0 B')
    expect(formatRAM(0)).toBe('0 B')
  })
})
