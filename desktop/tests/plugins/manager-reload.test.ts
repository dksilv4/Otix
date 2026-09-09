import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

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

vi.mock('../../db/repositories/plugins', () => ({
  PluginsRepository: vi.fn(() => mockPluginsRepo),
}))

vi.mock('../../db/plugins-db', () => ({
  initPluginsDb: vi.fn(),
}))

vi.mock('../../free-games/aggregator', () => ({
  FreeGamesAggregator: vi.fn(),
}))

import { PluginManager } from '../../plugins/manager'

const validManifest = {
  name: 'demo',
  version: '1.0.0',
  description: 'Demo',
  author: 'Otix',
  repository: 'https://example.com/repo',
  permissions: ['ui:settings'],
  entry: { main: 'main.js' },
}

const rowFor = (over: Record<string, unknown> = {}) => ({
  id: 'demo',
  name: 'demo',
  version: '1.0.0',
  description: '',
  author: '',
  repository: '',
  source_path: null,
  status: 'enabled',
  error: null,
  manifest_json: JSON.stringify(validManifest),
  installed_at: '2026-01-01T00:00:00Z',
  enabled_at: null,
  ...over,
})

describe('PluginManager reload — source refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips reload (no DB write, no state toggle) when the source manifest is missing', async () => {
    mockPluginsRepo.getById.mockReturnValue(rowFor())
    const manager = new PluginManager(
      '/fake/extensions',
      mockPluginsRepo as any,
      '/fake/userData',
    )

    await expect(manager.reload('demo', { refreshSource: true })).resolves.toBeUndefined()

    expect(mockPluginsRepo.updateManifest).not.toHaveBeenCalled()
    expect(mockPluginsRepo.setDisabled).not.toHaveBeenCalled()
    expect(mockPluginsRepo.setEnabled).not.toHaveBeenCalled()
  })

  it('skips reload when the source manifest fails schema validation', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-plugin-reload-'))
    try {
      fs.mkdirSync(path.join(dir, 'demo'), { recursive: true })
      fs.writeFileSync(
        path.join(dir, 'demo', 'manifest.json'),
        JSON.stringify({
          ...validManifest,
          config: { apiKey: { type: 'stirng', label: 'API Key' } },
        }),
      )
      mockPluginsRepo.getById.mockReturnValue(rowFor())
      const manager = new PluginManager(dir, mockPluginsRepo as any, '/fake/userData')

      await expect(manager.reload('demo', { refreshSource: true })).resolves.toBeUndefined()

      expect(mockPluginsRepo.updateManifest).not.toHaveBeenCalled()
      expect(mockPluginsRepo.setDisabled).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects for an unknown plugin before touching the source', async () => {
    mockPluginsRepo.getById.mockReturnValue(null)
    const manager = new PluginManager(
      '/fake/extensions',
      mockPluginsRepo as any,
      '/fake/userData',
    )
    await expect(manager.reload('missing', { refreshSource: true })).rejects.toThrow()
    expect(mockPluginsRepo.updateManifest).not.toHaveBeenCalled()
  })
})
