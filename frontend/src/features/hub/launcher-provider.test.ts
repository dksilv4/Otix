import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockLaunchGame: vi.fn(),
  mockScanPaths: vi.fn(),
  mockGetScanPaths: vi.fn(),
  mockFetchGames: vi.fn(),
  desktopApi: { value: null as unknown },
}))

vi.mock('@/lib/desktop/api', () => ({
  getDesktopAPI: () => mocks.desktopApi.value,
  hasDesktopAPI: () => mocks.desktopApi.value !== null,
}))

vi.mock('@/features/launcher/data/storage', () => ({
  fetchGames: (...args: unknown[]) => mocks.mockFetchGames(...args),
  fetchIsoPaths: () => Promise.resolve([]),
}))

vi.mock('@/lib/router', () => ({
  router: { navigate: vi.fn() },
}))

import { createLauncherProvider } from './providers/launcher-provider'

const SAMPLE_GAMES = [
  { id: 'g1', title: 'Cyberpunk 2077', exePath: '/games/cp2077.exe', platform: 'steam', installDir: '/games' },
  { id: 'g2', title: 'Hades', exePath: '/games/hades.exe', platform: 'pc', installDir: '/games' },
]

function mockDesktop() {
  mocks.desktopApi.value = {
    launchGame: mocks.mockLaunchGame,
    scanPaths: mocks.mockScanPaths,
    getScanPaths: mocks.mockGetScanPaths,
  }
}

describe('launcher provider', () => {
  beforeEach(() => {
    mocks.desktopApi.value = null
    mocks.mockLaunchGame.mockReset()
    mocks.mockScanPaths.mockReset()
    mocks.mockGetScanPaths.mockReset()
    mocks.mockFetchGames.mockReset()
  })

  it('returns no commands when not on desktop', async () => {
    const commands = await createLauncherProvider().search('cyberpunk')
    expect(commands).toEqual([])
    expect(mocks.mockFetchGames).not.toHaveBeenCalled()
  })

  it('returns default actions on empty query', async () => {
    mockDesktop()
    const commands = await createLauncherProvider().search('')
    expect(commands.map((c) => c.id)).toEqual(['launcher:library', 'launcher:scan'])
  })

  it('returns launch/open commands for matching installed games', async () => {
    mockDesktop()
    mocks.mockFetchGames.mockResolvedValue(SAMPLE_GAMES)
    const commands = await createLauncherProvider().search('cyber')
    const titles = commands.map((c) => c.title)
    expect(titles).toContain('Launch Cyberpunk 2077')
    expect(titles).toContain('Open Cyberpunk 2077')
    expect(titles).not.toContain('Launch Hades')
  })

  it('includes no game commands when nothing matches', async () => {
    mockDesktop()
    mocks.mockFetchGames.mockResolvedValue(SAMPLE_GAMES)
    const commands = await createLauncherProvider().search('zzzz')
    expect(commands.some((c) => c.title.startsWith('Launch') || c.title.startsWith('Open'))).toBe(false)
  })

  it('launch command calls api.launchGame with the game', async () => {
    mockDesktop()
    mocks.mockFetchGames.mockResolvedValue(SAMPLE_GAMES)
    const commands = await createLauncherProvider().search('cyber')
    const launch = commands.find((c) => c.id === 'launcher:launch:g1')
    expect(launch).toBeDefined()
    launch!.run()
    expect(mocks.mockLaunchGame).toHaveBeenCalledWith(SAMPLE_GAMES[0])
  })
})
