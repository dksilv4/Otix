// desktop/db/repositories/downloads.ts
import Database from 'better-sqlite3'
import { getConnection } from '../connection'

export interface DownloadRow {
  id: string
  user_id: string
  media_item_id: string | null
  sabnzbd_nzo_id: string | null
  status: string
  nzb_name: string | null
  nzb_size: number | null
  nzb_url: string | null
  iso_path: string | null
  error_message: string | null
  percentage: number
  media_item_title: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateDownload {
  id: string
  user_id: string
  media_item_id?: string
  nzb_name?: string
  nzb_size?: number
  nzb_url?: string
  iso_path?: string
  media_item_title?: string
}

export class DownloadsRepository {
  private db: Database.Database

  constructor() {
    this.db = getConnection('downloads')
  }

  getByUserId(userId: string): DownloadRow[] {
    return this.db.prepare(
      'SELECT * FROM downloads WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId) as DownloadRow[]
  }

  getById(id: string): DownloadRow | null {
    return (this.db.prepare(
      'SELECT * FROM downloads WHERE id = ?'
    ).get(id) as DownloadRow) || null
  }

  insert(dl: CreateDownload): DownloadRow {
    const stmt = this.db.prepare(`
      INSERT INTO downloads (id, user_id, media_item_id, nzb_name, nzb_size, nzb_url, iso_path, media_item_title)
      VALUES (@id, @user_id, @media_item_id, @nzb_name, @nzb_size, @nzb_url, @iso_path, @media_item_title)
    `)
    stmt.run(dl)
    return this.getById(dl.id)!
  }

  updateStatus(id: string, status: string, errorMessage?: string): void {
    this.db.prepare(`
      UPDATE downloads SET status = ?, error_message = ?, updated_at = datetime('now') WHERE id = ?
    `).run(status, errorMessage || null, id)
  }

  updateSabId(id: string, sabNzoId: string): void {
    this.db.prepare(
      'UPDATE downloads SET sabnzbd_nzo_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(sabNzoId, id)
  }

  updatePercentage(id: string, percentage: number): void {
    this.db.prepare(
      'UPDATE downloads SET percentage = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(percentage, id)
  }

  markCompleted(id: string): void {
    this.db.prepare(`
      UPDATE downloads SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
    `).run(id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM downloads WHERE id = ?').run(id)
  }

  getActiveDownloads(): DownloadRow[] {
    return this.db.prepare(
      "SELECT * FROM downloads WHERE status NOT IN ('completed', 'failed', 'cancelled')"
    ).all() as DownloadRow[]
  }

  purgeOldDeleted(olderThanDays: number): number {
    const result = this.db.prepare(`
      DELETE FROM downloads
      WHERE status IN ('completed', 'failed', 'cancelled')
      AND updated_at < datetime('now', '-' || ? || ' days')
    `).run(olderThanDays)
    return result.changes
  }
}
