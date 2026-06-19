// desktop/db/connection.ts
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

const connections = new Map<string, Database>()

export function getDbPath(name: string): string {
  const userData = app.getPath('userData')
  const dbDir = path.join(userData, 'databases')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  return path.join(dbDir, `${name}.db`)
}

export function getConnection(name: string): Database {
  const existing = connections.get(name)
  if (existing) return existing

  const dbPath = getDbPath(name)
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  connections.set(name, db)
  return db
}

export function closeAllConnections(): void {
  for (const [name, db] of connections) {
    try { db.close() } catch {}
    connections.delete(name)
  }
}

export function closeConnection(name: string): void {
  const db = connections.get(name)
  if (db) {
    try { db.close() } catch {}
    connections.delete(name)
  }
}
