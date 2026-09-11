import { describe, expect, it } from 'vitest'
import { mapServerPlugin, packPayload, toStatus } from '@/features/plugins/server-api'
import type { ServerPluginRow } from '@/features/plugins/server-api'
import type { PluginInfo } from '@/features/plugins/types/plugins'

function row(overrides: Partial<ServerPluginRow> = {}): ServerPluginRow {
  return {
    id: 'plex',
    version: '1.0.0',
    description: 'desc',
    author: 'Otix',
    repository: '',
    enabled: true,
    error: '',
    manifest: {
      name: 'plex',
      version: '1.0.0',
      description: 'desc',
      author: 'Otix',
      repository: '',
      min_app_version: '',
      permissions: ['network:external'],
      entry: { main: 'plugin.py' },
      config: { serverUrl: { type: 'serverUrl', label: 'Plex server' } },
    },
    updated_at: '2026-09-09T00:00:00Z',
    ...overrides,
  }
}

describe('toStatus', () => {
  it('maps enabled/error/disabled', () => {
    expect(toStatus({ enabled: true })).toBe('enabled')
    expect(toStatus({ enabled: true, error: 'boom' })).toBe('error')
    expect(toStatus({ enabled: false, error: 'boom' })).toBe('error')
    expect(toStatus({ enabled: false })).toBe('disabled')
  })
})

describe('mapServerPlugin', () => {
  it('maps a server registry row to PluginInfo', () => {
    const info: PluginInfo = mapServerPlugin(row())
    expect(info.id).toBe('plex')
    expect(info.name).toBe('plex')
    expect(info.status).toBe('enabled')
    expect(info.error).toBeUndefined()
    expect(info.manifest.permissions).toEqual(['network:external'])
    expect(info.manifest.config).toEqual({
      serverUrl: { type: 'serverUrl', label: 'Plex server' },
    })
    expect(info.installedAt).toBe('2026-09-09T00:00:00Z')
  })

  it('surfaces errors as status error', () => {
    const info = mapServerPlugin(row({ enabled: true, error: 'missing grants' }))
    expect(info.status).toBe('error')
    expect(info.error).toBe('missing grants')
  })

  it('falls back to id when the manifest snapshot lacks a name', () => {
    const noName = row()
    delete (noName.manifest as Record<string, unknown>).name
    expect(mapServerPlugin(noName).name).toBe('plex')
  })
})

describe('packPayload', () => {
  it('packs backend-call args into a single payload', () => {
    expect(packPayload([])).toBeNull()
    expect(packPayload([{ section: 1 }])).toEqual({ section: 1 })
    expect(packPayload(['x', 'y'])).toEqual(['x', 'y'])
  })
})
