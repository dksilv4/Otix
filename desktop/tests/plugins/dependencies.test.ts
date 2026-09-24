import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────

const mockPluginsRepo = vi.hoisted(() => ({
  getAll: vi.fn().mockReturnValue([]),
  getById: vi.fn().mockReturnValue(null),
  insert: vi.fn(),
  setEnabled: vi.fn(),
  setDisabled: vi.fn(),
  updateStatus: vi.fn(),
  updateManifest: vi.fn(),
  delete: vi.fn(),
  getConfig: vi.fn().mockReturnValue({}),
  setConfig: vi.fn(),
  getPermissions: vi.fn().mockReturnValue([]),
  grantPermission: vi.fn(),
  deleteAllPermissions: vi.fn(),
  deleteAllConfig: vi.fn(),
  getRepos: vi.fn().mockReturnValue([]),
  addRepo: vi.fn(),
  removeRepo: vi.fn(),
}))

vi.mock('../../db/repositories/plugins', () => ({
  PluginsRepository: vi.fn(() => mockPluginsRepo),
}))

vi.mock('../../db/plugins-db', () => ({
  initPluginsDb: vi.fn(),
}))

vi.mock('../../free-games/aggregator', () => ({
  FreeGamesAggregator: vi.fn(),
}))

import { PluginManager } from '../../plugin-runtime/manager'

function row(id: string, manifest: Record<string, unknown>) {
  return {
    id,
    name: (manifest.name as string) || id,
    version: '1.0.0',
    description: '',
    author: '',
    repository: '',
    source_path: null,
    status: 'enabled',
    error: null,
    manifest_json: JSON.stringify(manifest),
    installed_at: 'now',
    enabled_at: 'now',
  }
}

describe('PluginManager dependencies', () => {
  let manager: PluginManager

  beforeEach(() => {
    vi.clearAllMocks()
    mockPluginsRepo.getAll.mockReturnValue([])
    manager = new PluginManager(
      '/fake/extensions',
      mockPluginsRepo as any,
      '/fake/userData',
    )
  })

  const enabledRows = (rows: ReturnType<typeof row>[]) => {
    mockPluginsRepo.getAll.mockReturnValue(rows)
    return manager
  }

  it('returns no dependents when nothing declares depends_on', () => {
    enabledRows([
      row('downloads', { name: 'Download Pipeline', depends_on: undefined }),
      row('nzbplanet', { name: 'NZBPlanet' }),
    ])
    expect(manager.getDependents('downloads')).toEqual([])
    expect(manager.getDependents('nzbplanet')).toEqual([])
  })

  it('returns plugins whose manifest depends_on the given plugin', () => {
    enabledRows([
      row('downloads', { name: 'Download Pipeline' }),
      row('nzbplanet', { name: 'NZBPlanet', depends_on: ['downloads'] }),
      row('sabnzbd', { name: 'SABnzbd', depends_on: ['downloads'] }),
      row('steam-source', { name: 'Steam Source' }),
    ])
    expect(manager.getDependents('downloads')).toEqual(['nzbplanet', 'sabnzbd'])
    expect(manager.getDependents('steam-source')).toEqual([])
  })

  it('resolves dependents transitively', () => {
    enabledRows([
      row('a', {}),
      row('b', { depends_on: ['a'] }),
      row('c', { depends_on: ['b'] }),
    ])
    expect(manager.getDependents('a')).toEqual(['b', 'c'])
  })

  it('terminates on cyclic dependencies instead of looping forever', () => {
    enabledRows([
      row('a', { depends_on: ['b'] }),
      row('b', { depends_on: ['a'] }),
    ])
    expect(manager.getDependents('a')).toEqual(['b'])
  })

  it('disable() cascades through dependents and returns every disabled id', async () => {
    enabledRows([
      row('downloads', { name: 'Download Pipeline' }),
      row('nzbplanet', { name: 'NZBPlanet', depends_on: ['downloads'] }),
      row('sabnzbd', { name: 'SABnzbd', depends_on: ['downloads'] }),
    ])
    const affected = await manager.disable('downloads')
    expect(affected).toEqual(['downloads', 'nzbplanet', 'sabnzbd'])
    expect(mockPluginsRepo.setDisabled).toHaveBeenCalledTimes(3)
    expect(mockPluginsRepo.setDisabled).toHaveBeenCalledWith('downloads')
    expect(mockPluginsRepo.setDisabled).toHaveBeenCalledWith('nzbplanet')
    expect(mockPluginsRepo.setDisabled).toHaveBeenCalledWith('sabnzbd')
  })

  it('disable() stops dependents before the plugin they rely on', async () => {
    enabledRows([
      row('a', {}),
      row('b', { depends_on: ['a'] }),
    ])
    await manager.disable('a')
    const order = mockPluginsRepo.setDisabled.mock.invocationCallOrder
    expect(order[0]).toBeLessThan(order[1])
    expect(mockPluginsRepo.setDisabled.mock.calls[0][0]).toBe('b')
    expect(mockPluginsRepo.setDisabled.mock.calls[1][0]).toBe('a')
  })

  it('disable() returns only the target when nothing depends on it', async () => {
    enabledRows([row('steam-source', { name: 'Steam Source' })])
    const affected = await manager.disable('steam-source')
    expect(affected).toEqual(['steam-source'])
    expect(mockPluginsRepo.setDisabled).toHaveBeenCalledOnce()
  })
})
