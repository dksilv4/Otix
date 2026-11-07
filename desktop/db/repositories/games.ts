// desktop/db/repositories/games.ts
import Database from 'better-sqlite3'
import { getDb } from '../connection'

export interface ScannedGameRow {
  id: string
  title: string
  exe_path: string
  local_exe_path: string | null
  install_dir: string
  platform: string
  icon_url: string | null
  poster_url: string | null
  update_files: string | null
  otix_media_id: string | null
  otix_media_title: string | null
  otix_media_slug: string | null
  otix_confidence: number | null
  otix_match_suggestion: string | null
  otix_poster_url: string | null
  otix_backdrop_url: string | null
  otix_textless_poster_url: string | null
  otix_logo_url: string | null
  otix_icon_url: string | null
  seeded: number
  local_icon_url: string | null
  otix_data: string | null
  last_played_at: string | null
  sources: string | null
  created_at: string
  updated_at: string
}

export interface CreateScannedGame {
  id: string
  title: string
  exe_path: string
  install_dir: string
  platform: string
  icon_url?: string
  poster_url?: string
  update_files?: string
}

export class GamesRepository {
  private db: Database.Database
  private getAllGamesStmt: Database.Statement
  private getGameByIdStmt: Database.Statement
  private insertGameStmt: Database.Statement
  private deleteGameStmt: Database.Statement
  private getScanPathsStmt: Database.Statement
  private addScanPathStmt: Database.Statement
  private removeScanPathStmt: Database.Statement
  private getRejectedSuggestionsStmt: Database.Statement
  private addRejectedSuggestionStmt: Database.Statement
  private getLocalGameMapStmt: Database.Statement
  private setLocalGameMapStmt: Database.Statement

  constructor() {
    this.db = getDb()
    this.getAllGamesStmt = this.db.prepare('SELECT * FROM scanned_games ORDER BY title')
    this.getGameByIdStmt = this.db.prepare('SELECT * FROM scanned_games WHERE id = ?')
    this.insertGameStmt = this.db.prepare(`
      INSERT INTO scanned_games (id, title, exe_path, install_dir, platform, icon_url, poster_url, update_files)
      VALUES (@id, @title, @exe_path, @install_dir, @platform, @icon_url, @poster_url, @update_files)
    `)
    this.deleteGameStmt = this.db.prepare('DELETE FROM scanned_games WHERE id = ?')
    this.getScanPathsStmt = this.db.prepare('SELECT * FROM game_scan_paths')
    this.addScanPathStmt = this.db.prepare('INSERT OR IGNORE INTO game_scan_paths (path, type) VALUES (?, ?)')
    this.removeScanPathStmt = this.db.prepare('DELETE FROM game_scan_paths WHERE path = ?')
    this.getRejectedSuggestionsStmt = this.db.prepare(
      'SELECT suggestion_media_id FROM game_rejected_suggestions WHERE game_title = ? AND game_platform = ?'
    )
    this.addRejectedSuggestionStmt = this.db.prepare(`
      INSERT OR IGNORE INTO game_rejected_suggestions (id, game_title, game_platform, suggestion_media_id)
      VALUES (?, ?, ?, ?)
    `)
    this.getLocalGameMapStmt = this.db.prepare('SELECT game_json FROM local_games_map WHERE media_id = ?')
    this.setLocalGameMapStmt = this.db.prepare('INSERT OR REPLACE INTO local_games_map (media_id, game_json) VALUES (?, ?)')
  }

  getAllGames(): ScannedGameRow[] {
    return this.getAllGamesStmt.all() as ScannedGameRow[]
  }

  getGameById(id: string): ScannedGameRow | null {
    return (this.getGameByIdStmt.get(id) as ScannedGameRow) || null
  }

  insertGame(game: CreateScannedGame): void {
    this.insertGameStmt.run(game)
  }

  updateGameMatch(id: string, updates: Partial<ScannedGameRow>): void {
    const fields: string[] = []
    const values: Record<string, unknown> = { id }
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = @${key}`)
        values[key] = value
      }
    }
    if (fields.length === 0) return
    fields.push("updated_at = datetime('now')")
    this.db.prepare(`UPDATE scanned_games SET ${fields.join(', ')} WHERE id = @id`).run(values)
  }

  deleteGame(id: string): void {
    this.deleteGameStmt.run(id)
  }

  getScanPaths(): { path: string; type: string }[] {
    return this.getScanPathsStmt.all() as { path: string; type: string }[]
  }

  addScanPath(path: string, type: string): void {
    this.addScanPathStmt.run(path, type)
  }

  removeScanPath(path: string): void {
    this.removeScanPathStmt.run(path)
  }

  getRejectedSuggestions(gameTitle: string, gamePlatform: string): string[] {
    const rows = this.getRejectedSuggestionsStmt.all(gameTitle, gamePlatform) as { suggestion_media_id: string }[]
    return rows.map(r => r.suggestion_media_id)
  }

  addRejectedSuggestion(id: string, gameTitle: string, gamePlatform: string, suggestionMediaId: string): void {
    this.addRejectedSuggestionStmt.run(id, gameTitle, gamePlatform, suggestionMediaId)
  }

  getLocalGameMap(mediaId: string): string | null {
    const row = this.getLocalGameMapStmt.get(mediaId) as { game_json: string } | undefined
    return row?.game_json || null
  }

  setLocalGameMap(mediaId: string, gameJson: string): void {
    this.setLocalGameMapStmt.run(mediaId, gameJson)
  }
}
