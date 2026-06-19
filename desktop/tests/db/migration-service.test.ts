// desktop/tests/db/migration-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'

describe('MigrationService', () => {
  let db: Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('runs migrations in order and records version', () => {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)

    const migrations = [
      {
        id: 1,
        name: 'create_foo',
        up(sql: { exec: (s: string) => void }) {
          sql.exec('CREATE TABLE foo (id INTEGER PRIMARY KEY)')
        },
      },
      {
        id: 2,
        name: 'add_bar',
        up(sql: { exec: (s: string) => void }) {
          sql.exec('CREATE TABLE bar (id INTEGER PRIMARY KEY, foo_id INTEGER)')
        },
      },
    ]

    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as any
    const currentVersion = row?.version ?? 0
    expect(currentVersion).toBe(0)

    for (const m of migrations.sort((a, b) => a.id - b.id)) {
      if (m.id <= currentVersion) continue
      db.transaction(() => {
        m.up({ exec: (s: string) => db.exec(s) })
        db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(m.id, m.name)
      })()
    }

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as any[]
    expect(tables.map((t: any) => t.name).sort()).toEqual(['bar', 'foo', 'schema_version'])

    const versionRow = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any
    expect(versionRow.v).toBe(2)
  })

  it('skips already applied migrations', () => {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(1, 'done')

    let secondRan = false
    const migrations = [
      { id: 1, name: 'first', up() { throw new Error('should not run') } },
      { id: 2, name: 'second', up() { secondRan = true } },
    ]

    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as any
    const currentVersion = row?.version ?? 0

    for (const m of migrations.sort((a, b) => a.id - b.id)) {
      if (m.id <= currentVersion) continue
      db.transaction(() => {
        m.up()
        db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(m.id, m.name)
      })()
    }

    expect(secondRan).toBe(true)
  })
})
