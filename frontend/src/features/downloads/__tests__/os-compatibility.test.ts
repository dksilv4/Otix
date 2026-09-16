import { describe, expect, it } from 'vitest'
import {
  detectClientOperatingSystem,
  gameInstallCompatibility,
} from '../os-compatibility'

const platforms = (...values: Array<[string, string]>) =>
  values.map(([slug, name]) => ({ platform: { slug, name } }))

describe('game install OS compatibility', () => {
  it('detects common desktop operating systems', () => {
    expect(detectClientOperatingSystem('Mozilla/5.0 (Windows NT 10.0)')).toBe('windows')
    expect(detectClientOperatingSystem('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos')
    expect(detectClientOperatingSystem('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux')
  })

  it('allows a game that explicitly supports the current OS', () => {
    const result = gameInstallCompatibility(
      platforms(['win', 'PC (Microsoft Windows)'], ['mac', 'Mac']),
      'macos',
    )

    expect(result.compatible).toBe(true)
    expect(result.verified).toBe(true)
  })

  it('blocks a Windows game on macOS', () => {
    const result = gameInstallCompatibility(
      platforms(['win', 'PC (Microsoft Windows)']),
      'macos',
    )

    expect(result.compatible).toBe(false)
    expect(result.button).toBe('Not for macOS')
  })

  it('blocks installation when desktop compatibility cannot be verified', () => {
    const result = gameInstallCompatibility(
      platforms(['playstation-5', 'PlayStation 5']),
      'windows',
    )

    expect(result.compatible).toBe(false)
    expect(result.verified).toBe(false)
    expect(result.button).toBe('Compatibility unknown')
  })
})
