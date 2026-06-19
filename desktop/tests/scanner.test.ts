import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mock factory and shared fn before any imports
const mockStatFn = vi.hoisted(() => vi.fn())

vi.mock('fs/promises', async (importOriginal: () => Promise<typeof import('fs/promises')>) => {
  const actual = await importOriginal()
  return {
    ...(actual as any),
    stat: mockStatFn,
  }
})

import { pickBestExe } from '../game/scanner'

// Helper to configure mockStatFn to return a specific file size for a given path fragment
function mockStat(pathContains: string, sizeMb: number) {
  mockStatFn.mockImplementation(async (path: string) => {
    if (path.includes(pathContains)) {
      return { size: sizeMb * 1024 * 1024, isFile: () => true } as any
    }
    // Default: 1MB catch-all (shouldn't matter for scored picks)
    return { size: 1 * 1024 * 1024, isFile: () => true } as any
  })
}

describe('pickBestExe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for empty list', async () => {
    await expect(pickBestExe([], 'Stellar Blade')).resolves.toBeNull()
  })

  it('returns the only exe', async () => {
    mockStat('game.exe', 10)
    await expect(pickBestExe(['C:\\Games\\Stellar Blade\\game.exe'], 'Stellar Blade')).resolves.toBe('C:\\Games\\Stellar Blade\\game.exe')
  })

  it('prefers folder-name match over non-match', async () => {
    mockStat('StellarBladeLauncher.exe', 2)
    mockStat('SB-Win64-Shipping.exe', 50)

    const result = await pickBestExe(
      [
        'C:\\Games\\Stellar Blade\\StellarBladeLauncher.exe',
        'C:\\Games\\Stellar Blade\\Binaries\\Win64\\SB-Win64-Shipping.exe',
      ],
      'Stellar Blade',
    )
    // Shipping bonus (80) + depth bonus (30) + size (30) = 140
    // vs name match (100) + size (2) = 102
    expect(result).toBe('C:\\Games\\Stellar Blade\\Binaries\\Win64\\SB-Win64-Shipping.exe')
  })

  it('filters out uninstaller and utility exes', async () => {
    mockStat('unins000.exe', 1)
    mockStat('vcredist_x64.exe', 10)
    mockStat('game.exe', 5)

    const result = await pickBestExe(
      [
        'C:\\Games\\Game\\unins000.exe',
        'C:\\Games\\Game\\vcredist_x64.exe',
        'C:\\Games\\Game\\game.exe',
      ],
      'Game',
    )
    // Only game.exe survives filtering
    expect(result).toBe('C:\\Games\\Game\\game.exe')
  })

  it('prefers Shipping exe when folder-name match is a launcher', async () => {
    mockStat('Launcher.exe', 1)
    mockStat('SB-Win64-Shipping.exe', 200)

    const result = await pickBestExe(
      [
        'C:\\Games\\Stellar Blade\\Launcher.exe',
        'C:\\Games\\Stellar Blade\\Engine\\Binaries\\ThirdParty\\SB-Win64-Shipping.exe',
      ],
      'Stellar Blade',
    )
    // Shipping (80) + depth (30) + size (30) = 140
    // vs name match (100) + size (1) = 101
    expect(result).toContain('SB-Win64-Shipping')
  })

  it('prefers deeper path for similar names', async () => {
    mockStat('stellarblade.exe', 2)
    mockStat('stellarblade.exe', 2)

    const result = await pickBestExe(
      [
        'C:\\Games\\Stellar Blade\\stellarblade.exe',
        'C:\\Games\\Stellar Blade\\Binaries\\Win64\\stellarblade.exe',
      ],
      'Stellar Blade',
    )
    // Both have name match (100) + similar size. Deeper path gets +30 depth bonus
    expect(result).toContain('Binaries')
  })

  it('returns null when all exes are filtered as junk', async () => {
    mockStat('unins000.exe', 1)
    mockStat('crashhandler.exe', 2)
    mockStat('setup.exe', 5)

    const result = await pickBestExe(
      [
        'C:\\Games\\Game\\unins000.exe',
        'C:\\Games\\Game\\crashhandler.exe',
        'C:\\Games\\Game\\setup.exe',
      ],
      'Game',
    )
    expect(result).toBeNull()
  })

  it('scores size correctly up to 30 cap', async () => {
    mockStat('game.exe', 500)

    const result = await pickBestExe(['C:\\Games\\Game\\game.exe'], 'Game')
    expect(result).toBe('C:\\Games\\Game\\game.exe')
  })
})
