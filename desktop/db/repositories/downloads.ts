// desktop/db/repositories/downloads.ts
import Database from 'better-sqlite3'
import { getDb } from '../connection'

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
  private getByUserIdStmt: Database.Statement
  private getByIdStmt: Database.Statement
  private insertStmt: Database.Statement
  private updateStatusStmt: Database.Statement
  private updateSabIdStmt: Database.Statement
  private updatePercentageStmt: Database.Statement
  private markCompletedStmt: Database.Statement
  private deleteStmt: Database.Statement
  private getActiveDownloadsStmt: Database.Statement
  private purgeOldDeletedStmt: Database.Statement

  constructor() {
    this.db = getDb()
    this.getByUserIdStmt = this.db.prepare('SELECT * FROM downloads WHERE user_id = ? ORDER BY created_at DESC')
    this.getByIdStmt = this.db.prepare('SELECT * FROM downloads WHERE id = ?')
    this.insertStmt = this.db.prepare(`
      INSERT INTO downloads (id, user_id, media_item_id, nzb_name, nzb_size, nzb_url, iso_path, media_item_title)
      VALUES (@id, @user_id, @media_item_id, @nzb_name, @nzb_size, @nzb_url, @iso_path, @media_item_title)
    `)
    this.updateStatusStmt = this.db.prepare(`
      UPDATE downloads SET status = ?, error_message = ?, updated_at = datetime('now') WHERE id = ?
    `)
    this.updateSabIdStmt = this.db.prepare(
      "UPDATE downloads SET sabnzbd_nzo_id = ?, updated_at = datetime('now') WHERE id = ?"
    )
    this.updatePercentageStmt = this.db.prepare(
      "UPDATE downloads SET percentage = ?, updated_at = datetime('now') WHERE id = ?"
    )
    this.markCompletedStmt = this.db.prepare(`
      UPDATE downloads SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
    `)
    this.deleteStmt = this.db.prepare('DELETE FROM downloads WHERE id = ?')
    this.getActiveDownloadsStmt = this.db.prepare(
      "SELECT * FROM downloads WHERE status NOT IN ('completed', 'failed', 'cancelled')"
    )
    this.purgeOldDeletedStmt = this.db.prepare(`
      DELETE FROM downloads
      WHERE status IN ('completed', 'failed', 'cancelled')
      AND updated_at < datetime('now', '-' || ? || ' days')
    `)
  }

  getByUserId(userId: string): DownloadRow[] {
    return this.getByUserIdStmt.all(userId) as DownloadRow[]
  }

  getById(id: string): DownloadRow | null {
    return (this.getByIdStmt.get(id) as DownloadRow) || null
  }

  insert(dl: CreateDownload): DownloadRow {
    this.insertStmt.run(dl)
    return this.getById(dl.id)!
  }

  updateStatus(id: string, status: string, errorMessage?: string): void {
    this.updateStatusStmt.run(status, errorMessage || null, id)
  }

  updateSabId(id: string, sabNzoId: string): void {
    this.updateSabIdStmt.run(sabNzoId, id)
  }

  updatePercentage(id: string, percentage: number): void {
    this.updatePercentageStmt.run(percentage, id)
  }

  markCompleted(id: string): void {
    this.markCompletedStmt.run(id)
  }

  delete(id: string): void {
    this.deleteStmt.run(id)
  }

  getActiveDownloads(): DownloadRow[] {
    return this.getActiveDownloadsStmt.all() as DownloadRow[]
  }

  purgeOldDeleted(olderThanDays: number): number {
    const result = this.purgeOldDeletedStmt.run(olderThanDays)
    return result.changes
  }
}
