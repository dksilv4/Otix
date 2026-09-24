import { describe, it, expect, vi } from 'vitest'

// better-sqlite3 is compiled for Electron's ABI, not node — mock it. The
// scoping logic under test never touches a real DB handle.
vi.mock('better-sqlite3', () => ({ default: vi.fn() }))

import { validateAndPrepareSql } from '../../plugin-runtime/worker-bridge'

type Deps = Parameters<typeof validateAndPrepareSql>[2]

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    pluginId: 'test-plugin',
    manifest: { name: 'Test Plugin' } as any,
    worker: {} as any,
    eventBus: {} as any,
    pluginDb: {} as any,
    dbConfig: { tables: { items: { columns: { id: 'TEXT' } } } },
    hasPermission: vi.fn(() => false),
    requestPermission: vi.fn(async () => true),
    apiBaseUrl: 'http://localhost:8000',
    authToken: 'token',
    getConfig: () => ({}),
    getConfigValue: () => undefined,
    setConfigValue: () => {},
    callPlugin: async () => undefined,
    serviceRegistry: {} as any,
    ...overrides,
  }
}

describe('validateAndPrepareSql — table scoping', () => {
  it('allows a plugin to access its own declared tables without prompting', async () => {
    const deps = makeDeps()
    const { sql } = await validateAndPrepareSql('SELECT * FROM items', [], deps, true)
    expect(deps.requestPermission).not.toHaveBeenCalled()
    expect(sql).toBe('SELECT * FROM test-plugin_items')
  })

  it('allows tables already carrying the plugin namespace prefix without prompting', async () => {
    // Dashed plugin ids make prefixed names unparseable as bare identifiers,
    // so plugins reference them quoted — which is valid SQLite.
    const deps = makeDeps({ dbConfig: { tables: { saved: { columns: {} } } } })
    const { sql } = await validateAndPrepareSql('SELECT * FROM "test-plugin_saved"', [], deps, true)
    expect(deps.requestPermission).not.toHaveBeenCalled()
    expect(sql).toBe('SELECT * FROM "test-plugin_saved"')
  })

  it('rejects db.* access when the plugin has no db.tables schema', async () => {
    const deps = makeDeps({ dbConfig: null })
    await expect(
      validateAndPrepareSql('SELECT * FROM anything', [], deps, true),
    ).rejects.toThrow('db.tables')
  })

  it('prompts for cross-namespace table access and succeeds when granted', async () => {
    const deps = makeDeps()
    const { sql } = await validateAndPrepareSql('SELECT * FROM downloads', [], deps, true)
    expect(deps.requestPermission).toHaveBeenCalledWith('table:downloads')
    // Not a declared table — no prefixing applied.
    expect(sql).toBe('SELECT * FROM downloads')
  })

  it('skips the prompt when table permission is already granted', async () => {
    const deps = makeDeps({ hasPermission: vi.fn(() => true) })
    await validateAndPrepareSql('SELECT * FROM downloads', [], deps, true)
    expect(deps.requestPermission).not.toHaveBeenCalled()
  })

  it('throws when cross-namespace access is denied', async () => {
    const deps = makeDeps({ requestPermission: vi.fn(async () => false) })
    await expect(
      validateAndPrepareSql('SELECT * FROM downloads', [], deps, true),
    ).rejects.toThrow('Permission denied: access to table "downloads"')
  })

  it('handles schema-qualified table names on the downloadsDb.* path', async () => {
    const deps = makeDeps()
    const { sql } = await validateAndPrepareSql('SELECT * FROM main.downloads', [], deps, false)
    expect(deps.requestPermission).toHaveBeenCalledWith('table:downloads')
    // downloadsDb.* path applies no prefixing.
    expect(sql).toBe('SELECT * FROM main.downloads')
  })

  it('rejects unsafe statements (PRAGMA, DROP, multi-statement)', async () => {
    const deps = makeDeps()
    for (const bad of [
      'PRAGMA table_info(users)',
      'DROP TABLE items',
      'SELECT 1; DROP TABLE items',
    ]) {
      await expect(validateAndPrepareSql(bad, [], deps, true)).rejects.toThrow('unsafe')
    }
  })
})
