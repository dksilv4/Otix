// desktop/ipc/achievements.ts
import { ipcMain } from 'electron'
import type { AchievementTracker } from '../game/achievements/tracker'
import { GamesRepository } from '../db/repositories/games'

let trackerInstance: AchievementTracker | null = null
let _gamesRepo: GamesRepository | null = null

function getGamesRepo(): GamesRepository {
  if (!_gamesRepo) {
    _gamesRepo = new GamesRepository()
  }
  return _gamesRepo
}

export function registerAchievementsIPC(tracker?: AchievementTracker): void {
  if (tracker) {
    trackerInstance = tracker
  }

  ipcMain.handle('achievements:get-for-game', async (_event, gameId: string) => {
    if (!trackerInstance || !gameId) return []
    try {
      // First check DB
      let achievements = trackerInstance.getAchievementsForGame(gameId)
      // If none cached yet, try fetching on demand if game exists
      if (achievements.length === 0) {
        const gameRow = getGamesRepo().getGameById(gameId)
        if (gameRow) {
          const localGame = {
            id: gameRow.id,
            title: gameRow.title,
            exePath: gameRow.exe_path,
            installDir: gameRow.install_dir,
            platform: gameRow.platform,
            otixMediaId: gameRow.otix_media_id || undefined,
            sources: gameRow.sources ? JSON.parse(gameRow.sources) : undefined,
          }
          await trackerInstance.syncGame(localGame as any)
          achievements = trackerInstance.getAchievementsForGame(gameId)
        }
      }
      return achievements
    } catch (err) {
      console.error('[ipc/achievements] get-for-game failed:', err)
      return []
    }
  })

  ipcMain.handle('achievements:get-stats', async (_event, gameId: string) => {
    if (!trackerInstance || !gameId) {
      return { total: 0, unlocked: 0, totalPoints: 0, earnedPoints: 0, completionPercentage: 0 }
    }
    try {
      return trackerInstance.getStatsForGame(gameId)
    } catch (err) {
      console.error('[ipc/achievements] get-stats failed:', err)
      return { total: 0, unlocked: 0, totalPoints: 0, earnedPoints: 0, completionPercentage: 0 }
    }
  })

  ipcMain.handle('achievements:get-recent-unlocks', async (_event, limit?: number) => {
    if (!trackerInstance) return []
    try {
      return trackerInstance.getRecentUnlocks(limit || 10)
    } catch (err) {
      console.error('[ipc/achievements] get-recent-unlocks failed:', err)
      return []
    }
  })

  ipcMain.handle('achievements:sync', async (_event, gameId: string) => {
    if (!trackerInstance || !gameId) return { synced: 0 }
    try {
      const gameRow = getGamesRepo().getGameById(gameId)
      if (!gameRow) return { synced: 0 }

      const localGame = {
        id: gameRow.id,
        title: gameRow.title,
        exePath: gameRow.exe_path,
        installDir: gameRow.install_dir,
        platform: gameRow.platform,
        otixMediaId: gameRow.otix_media_id || undefined,
        sources: gameRow.sources ? JSON.parse(gameRow.sources) : undefined,
      }
      return await trackerInstance.syncGame(localGame as any)
    } catch (err) {
      console.error('[ipc/achievements] sync failed:', err)
      return { synced: 0 }
    }
  })
}
