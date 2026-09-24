import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PluginNotRunningError } from '../../plugin-runtime/errors'

// ── Hoisted shared mocks ──────────────────────────────────────

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

// ── Module mocks (hoisted to top by vitest) ───────────────────

vi.mock('../../db/repositories/plugins', () => ({
  PluginsRepository: vi.fn(() => mockPluginsRepo),
}))

vi.mock('../../db/plugins-db', () => ({
  initPluginsDb: vi.fn(),
}))

vi.mock('../../free-games/aggregator', () => ({
  FreeGamesAggregator: vi.fn(),
}))

// ── Import after mocks ────────────────────────────────────────

import { PluginManager } from '../../plugin-runtime/manager'

describe('PluginManager lifecycle', () => {
  let manager: PluginManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new PluginManager(
      '/fake/extensions',
      mockPluginsRepo as any,
      '/fake/userData',
    )
  })

  it('starts with no plugins', () => {
    const plugins = manager.getAllPlugins()
    expect(plugins).toEqual([])
    expect(mockPluginsRepo.getAll).toHaveBeenCalledOnce()
  })

  it('getPlugin returns null for unknown plugin', () => {
    const plugin = manager.getPlugin('unknown-plugin')
    expect(plugin).toBeNull()
    expect(mockPluginsRepo.getById).toHaveBeenCalledWith('unknown-plugin')
  })

  it('getPluginsForSlot returns empty array when no plugins registered', () => {
    const slots = manager.getPluginsForSlot('any/location')
    expect(slots).toEqual([])
  })

  it('callPluginData throws PluginNotRunningError for unknown plugin', async () => {
    await expect(
      manager.callPluginData('unknown-plugin', 'someMethod'),
    ).rejects.toThrow(PluginNotRunningError)
  })
})
