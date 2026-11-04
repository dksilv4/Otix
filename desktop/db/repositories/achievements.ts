// desktop/db/repositories/achievements.ts
import Database from 'better-sqlite3'
import { getDb } from '../connection'

export interface GameAchievementRow {
  id: string
  game_id: string
  app_id: string | null
  api_name: string
  display_name: string
  description: string | null
  icon_url: string | null
  icon_locked_url: string | null
  hidden: number
  points: number
  rarity_percentage: number | null
  created_at?: string
  updated_at?: string
}

export interface UnlockedAchievementRow {
  id: string
  game_id: string
  api_name: string
  unlocked_at: number
  source: string
  created_at?: string
}

export interface AchievementWithUnlock extends GameAchievementRow {
  unlocked: boolean
  unlocked_at: number | null
  source: string | null
}

export interface AchievementStats {
  total: number
  unlocked: number
  totalPoints: number
  earnedPoints: number
  completionPercentage: number
}

export class AchievementsRepository {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDb()
  }

  getAchievementsForGame(gameId: string): AchievementWithUnlock[] {
    const rows = this.db.prepare(`
      SELECT 
        g.id,
        g.game_id,
        g.app_id,
        g.api_name,
        g.display_name,
        g.description,
        g.icon_url,
        g.icon_locked_url,
        g.hidden,
        g.points,
        g.rarity_percentage,
        g.created_at,
        g.updated_at,
        u.unlocked_at,
        u.source,
        CASE WHEN u.id IS NOT NULL THEN 1 ELSE 0 END as unlocked
      FROM game_achievements g
      LEFT JOIN unlocked_achievements u 
        ON g.game_id = u.game_id AND g.api_name = u.api_name
      WHERE g.game_id = ?
      ORDER BY unlocked DESC, g.points DESC, g.display_name ASC
    `).all(gameId) as Array<GameAchievementRow & { unlocked: number; unlocked_at: number | null; source: string | null }>

    return rows.map(r => ({
      ...r,
      unlocked: Boolean(r.unlocked),
    }))
  }

  getUnlockedForGame(gameId: string): UnlockedAchievementRow[] {
    return this.db.prepare(`
      SELECT * FROM unlocked_achievements 
      WHERE game_id = ? 
      ORDER BY unlocked_at DESC
    `).all(gameId) as UnlockedAchievementRow[]
  }

  upsertAchievements(achievements: Array<Omit<GameAchievementRow, 'created_at' | 'updated_at'>>): void {
    if (achievements.length === 0) return

    const stmt = this.db.prepare(`
      INSERT INTO game_achievements (
        id, game_id, app_id, api_name, display_name, description, 
        icon_url, icon_locked_url, hidden, points, rarity_percentage, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
      )
      ON CONFLICT(game_id, api_name) DO UPDATE SET
        app_id = excluded.app_id,
        display_name = excluded.display_name,
        description = excluded.description,
        icon_url = excluded.icon_url,
        icon_locked_url = excluded.icon_locked_url,
        hidden = excluded.hidden,
        points = excluded.points,
        rarity_percentage = excluded.rarity_percentage,
        updated_at = datetime('now')
    `)

    const insertMany = this.db.transaction((items: Array<Omit<GameAchievementRow, 'created_at' | 'updated_at'>>) => {
      for (const item of items) {
        stmt.run(
          item.id,
          item.game_id,
          item.app_id || null,
          item.api_name,
          item.display_name,
          item.description || null,
          item.icon_url || null,
          item.icon_locked_url || null,
          item.hidden ?? 0,
          item.points ?? 10,
          item.rarity_percentage ?? null
        )
      }
    })

    insertMany(achievements)
  }

  unlockAchievement(gameId: string, apiName: string, unlockedAt?: number, source: string = 'local'): boolean {
    const timestamp = unlockedAt || Math.floor(Date.now() / 1000)
    const id = `${gameId}:${apiName}`

    try {
      const result = this.db.prepare(`
        INSERT OR IGNORE INTO unlocked_achievements (id, game_id, api_name, unlocked_at, source)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, gameId, apiName, timestamp, source)

      return result.changes > 0
    } catch {
      return false
    }
  }

  unlockBatch(gameId: string, unlocks: Array<{ apiName: string; unlockedAt?: number; source?: string }>): string[] {
    const newlyUnlocked: string[] = []
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO unlocked_achievements (id, game_id, api_name, unlocked_at, source)
      VALUES (?, ?, ?, ?, ?)
    `)

    const runBatch = this.db.transaction((items: Array<{ apiName: string; unlockedAt?: number; source?: string }>) => {
      for (const item of items) {
        const timestamp = item.unlockedAt || Math.floor(Date.now() / 1000)
        const id = `${gameId}:${item.apiName}`
        const res = stmt.run(id, gameId, item.apiName, timestamp, item.source || 'local')
        if (res.changes > 0) {
          newlyUnlocked.push(item.apiName)
        }
      }
    })

    runBatch(unlocks)
    return newlyUnlocked
  }

  getStatsForGame(gameId: string): AchievementStats {
    const row = this.db.prepare(`
      SELECT 
        COUNT(g.id) as total,
        COUNT(u.id) as unlocked,
        COALESCE(SUM(g.points), 0) as totalPoints,
        COALESCE(SUM(CASE WHEN u.id IS NOT NULL THEN g.points ELSE 0 END), 0) as earnedPoints
      FROM game_achievements g
      LEFT JOIN unlocked_achievements u ON g.game_id = u.game_id AND g.api_name = u.api_name
      WHERE g.game_id = ?
    `).get(gameId) as { total: number; unlocked: number; totalPoints: number; earnedPoints: number }

    const total = row?.total ?? 0
    const unlocked = row?.unlocked ?? 0
    const completionPercentage = total > 0 ? Math.round((unlocked / total) * 100) : 0

    return {
      total,
      unlocked,
      totalPoints: row?.totalPoints ?? 0,
      earnedPoints: row?.earnedPoints ?? 0,
      completionPercentage,
    }
  }

  getRecentUnlocks(limit: number = 10): Array<AchievementWithUnlock & { game_title?: string }> {
    const rows = this.db.prepare(`
      SELECT 
        g.id,
        g.game_id,
        g.app_id,
        g.api_name,
        g.display_name,
        g.description,
        g.icon_url,
        g.icon_locked_url,
        g.hidden,
        g.points,
        g.rarity_percentage,
        g.created_at,
        g.updated_at,
        u.unlocked_at,
        u.source,
        1 as unlocked,
        sg.title as game_title
      FROM unlocked_achievements u
      JOIN game_achievements g ON u.game_id = g.game_id AND u.api_name = g.api_name
      LEFT JOIN scanned_games sg ON u.game_id = sg.id
      ORDER BY u.unlocked_at DESC
      LIMIT ?
    `).all(limit) as Array<GameAchievementRow & { unlocked: number; unlocked_at: number; source: string; game_title?: string }>

    return rows.map(r => ({
      ...r,
      unlocked: true,
    }))
  }
}
