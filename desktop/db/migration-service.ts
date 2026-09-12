// desktop/db/migration-service.ts
// Versioned migrations against the single otix.db connection.

import Database from 'better-sqlite3'
import { getDb } from './connection'

export interface Migration {
  id: number
  name: string
  up(sql: SqlRunner): void
}

export interface SqlRunner {
  exec(sql: string): void
  getDb(): Database.Database
}

class MigrationService {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  private ensureSchemaVersionTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  private getCurrentVersion(): number {
    const row = this.db.prepare(
      'SELECT MAX(version) as version FROM schema_version',
    ).get() as { version: number | null } | undefined
    return row?.version ?? 0
  }

  private setVersion(version: number, name: string): void {
    this.db.prepare(
      'INSERT INTO schema_version (version, name) VALUES (?, ?)',
    ).run(version, name)
  }

  runMigrations(migrations: Migration[]): void {
    this.ensureSchemaVersionTable()
    const currentVersion = this.getCurrentVersion()

    const sorted = [...migrations].sort((a, b) => a.id - b.id)
    const pending = sorted.filter((m) => m.id > currentVersion)

    if (pending.length === 0) return

    const runner: SqlRunner = {
      exec: (sql: string) => this.db.exec(sql),
      getDb: () => this.db,
    }

    for (const migration of pending) {
      const migrate = () => {
        migration.up(runner)
        this.setVersion(migration.id, migration.name)
      }
      this.db.transaction(migrate)()
    }
  }
}

export function createMigrationService(): MigrationService {
  return new MigrationService()
}
