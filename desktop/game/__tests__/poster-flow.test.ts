import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database module before importing storage
function createMockDb() {
  const tables = new Map<string, Map<string, Record<string, any>>>()

  function getTable(name: string) {
    if (!tables.has(name)) tables.set(name, new Map())
    return tables.get(name)!
  }

  const mockStmt = {
    run: vi.fn(function (this: any, ...args: any[]) {
      const parsed = this.__sql ? parseSql(this.__sql) : { table: 'scanned_games', type: 'insert' }
      const table = getTable(parsed.table)
      if (parsed.type === 'insert' || parsed.type === 'replace') {
        const id = args[0] as string
        const row: Record<string, any> = { id }
        const cols = parsed.columns || ['id']
        cols.forEach((col: string, i: number) => { row[col] = args[i] })
        table.set(id, row)
      } else if (parsed.type === 'update') {
        let row: Record<string, any> | undefined
        for (const a of args) {
          if (typeof a === 'string' && table.has(a)) {
            row = table.get(a)
            break
          }
        }
        if (!row) {
          const id = args[args.length - 1] as string
          row = table.get(id)
        }
        if (row) {
          const setCols = parsed.setColumns || []
          setCols.forEach((col: string, i: number) => {
            if (args[i] !== undefined && args[i] !== null) {
              row![col] = args[i]
            }
          })
        }
      }
    }),
    get: vi.fn(function (this: any, ...args: any[]) {
      const parsed = this.__sql ? parseSql(this.__sql) : { table: 'scanned_games', type: 'select' }
      const table = getTable(parsed.table)
      return table.get(args[0] as string) || null
    }),
    all: vi.fn(function (this: any, ...args: any[]) {
      const table = getTable('scanned_games')
      return Array.from(table.values())
    }),
  }

  const db = {
    prepare: vi.fn((sql: string) => {
      const stmt = Object.create(mockStmt)
      stmt.__sql = sql
      return stmt
    }),
    exec: vi.fn(),
  }

  return { db, tables, reset: () => { tables.clear() } }
}

function parseSql(sql: string) {
  const upper = sql.toUpperCase()
  if (upper.startsWith('INSERT') || upper.startsWith('INSERT OR REPLACE')) {
    const match = sql.match(/INTO\s+(\w+)\s*\(([^)]+)\)/)
    if (match) {
      return {
        table: match[1],
        type: 'insert',
        columns: match[2].split(',').map((c: string) => c.trim()),
      }
    }
    return { table: 'scanned_games', type: 'insert' }
  }
  if (upper.startsWith('SELECT')) {
    const match = sql.match(/FROM\s+(\w+)/)
    return { table: match?.[1] || 'scanned_games', type: 'select' }
  }
  if (upper.startsWith('UPDATE')) {
    const tableMatch = sql.match(/UPDATE\s+(\w+)/)
    const setMatch = sql.match(/SET\s+([^W]+?)\s*WHERE/)
    const table = tableMatch?.[1] || 'scanned_games'
    let setColumns: string[] = []
    if (setMatch) {
      const parts: string[] = []
      let depth = 0
      let cur = ''
      for (let i = 0; i < setMatch[1].length; i++) {
        const ch = setMatch[1][i]
        if (ch === '(') depth++
        else if (ch === ')') depth--
        else if (ch === ',' && depth === 0) {
          parts.push(cur.trim())
          cur = ''
          continue
        }
        cur += ch
      }
      if (cur.trim()) parts.push(cur.trim())
      setColumns = parts.filter(s => s.includes('?')).map((s: string) => {
        const eqIdx = s.indexOf('=')
        return eqIdx > 0 ? s.substring(0, eqIdx).trim() : s.trim()
      })
    }
    return { table, type: 'update', setColumns }
  }
  if (upper.startsWith('DELETE')) {
    const match = sql.match(/DELETE\s+FROM\s+(\w+)/)
    return { table: match?.[1] || 'scanned_games', type: 'delete' }
  }
  return { table: 'scanned_games', type: 'unknown' }
}

const mockDb = createMockDb()

vi.mock('../../db', () => ({
  getDb: () => mockDb.db,
}))

import { upsertGames, getAllGames, hydrateGame } from '../storage'

describe('game poster flow', () => {
  beforeEach(() => {
    mockDb.reset()
  })

  it('should store Epic native posterUrl via upsertGames and read it back', () => {
    const games = [{
      id: 'epic_Jaguar',
      title: 'Rocket League',
      exePath: 'C:\\Epic\\RocketLeague\\Binaries\\Win64\\RocketLeague.exe',
      installDir: 'C:\\Epic\\RocketLeague',
      platform: 'epic' as const,
      posterUrl: 'https://example.com/epic-poster.jpg',
    }]

    upsertGames(games as any)

    const result = getAllGames()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('epic_Jaguar')
    // Verify posterUrl was stored and is readable
    expect(result[0].posterUrl).toBe('https://example.com/epic-poster.jpg')
  })

  it('should keep posterUrl after hydrateGame updates match data', () => {
    // First, upsert a game with Epic native poster
    upsertGames([{
      id: 'epic_Jaguar',
      title: 'Rocket League',
      exePath: '',
      installDir: '',
      platform: 'epic' as const,
      posterUrl: 'https://example.com/epic-poster.jpg',
    }] as any)

    // Then hydrate with Otix match data (simulating SSE event)
    hydrateGame(
      'epic_Jaguar',
      'Rocket League (Otix)',
      null,
      null,
      null,
    )

    const result = getAllGames()
    expect(result).toHaveLength(1)
    // Native poster should still be present after hydrateGame
    expect(result[0].posterUrl).toBe('https://example.com/epic-poster.jpg')
  })

  it('should show posterUrl for games without match data', () => {
    upsertGames([{
      id: 'epic_TestGame',
      title: 'Test Game',
      exePath: 'game.exe',
      installDir: 'C:\\Games',
      platform: 'epic' as const,
      posterUrl: 'https://example.com/poster.jpg',
    }] as any)

    const result = getAllGames()
    expect(result[0].posterUrl).toBe('https://example.com/poster.jpg')
    expect(result[0].otixPosterUrl).toBeUndefined()
    // Frontend uses: game.otixPosterUrl || game.posterUrl
    const displayUrl = result[0].otixPosterUrl || result[0].posterUrl
    expect(displayUrl).toBe('https://example.com/poster.jpg')
  })
})
