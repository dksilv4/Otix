// desktop/game/achievements/schema-fetcher.ts
import * as fs from 'fs'
import * as path from 'path'
import type { LocalGame } from '../../preload-api'
import type { AppIdResolution, GameAchievement } from './types'
import { parseBinaryVdf, extractAchievementsFromSchema } from './vdf-parser'
import { AchievementsRepository } from '../../db/repositories/achievements'

const STEAM_CACHE_PATHS = [
  'C:\\Program Files (x86)\\Steam\\appcache\\stats',
  'C:\\Program Files\\Steam\\appcache\\stats',
  'D:\\Steam\\appcache\\stats',
  'E:\\Steam\\appcache\\stats',
]

export class AchievementSchemaFetcher {
  private repo: AchievementsRepository

  constructor(repo?: AchievementsRepository) {
    this.repo = repo || new AchievementsRepository()
  }

  async getOrFetchSchema(game: LocalGame, resolution: AppIdResolution): Promise<GameAchievement[]> {
    // 1. Check local SQLite DB first
    const existing = this.repo.getAchievementsForGame(game.id)
    if (existing.length > 0) {
      return existing.map(e => ({
        id: e.id,
        gameId: e.game_id,
        appId: e.app_id,
        apiName: e.api_name,
        displayName: e.display_name,
        description: e.description,
        iconUrl: e.icon_url,
        iconLockedUrl: e.icon_locked_url,
        hidden: Boolean(e.hidden),
        points: e.points,
        rarityPercentage: e.rarity_percentage,
      }))
    }

    if (!resolution.appId) {
      return []
    }

    const appId = resolution.appId
    let achievements: GameAchievement[] = []

    // 2. Try Steam local appcache binary schema
    achievements = this.loadFromSteamAppCache(game.id, appId)

    // 3. Try Goldberg local achievements.json if no schema from Steam cache
    if (achievements.length === 0 && game.installDir) {
      achievements = this.loadFromGoldbergSchema(game.id, appId, game.installDir)
    }

    // 4. Try Steam Store API as fallback
    if (achievements.length === 0) {
      achievements = await this.fetchFromSteamStoreApi(game.id, appId)
    }

    // 5. Try fetching global unlock percentages to enrich rarity
    if (achievements.length > 0) {
      await this.enrichRarityPercentages(appId, achievements)
    }

    // 6. Persist to SQLite
    if (achievements.length > 0) {
      this.repo.upsertAchievements(
        achievements.map(a => ({
          id: a.id,
          game_id: a.gameId,
          app_id: a.appId || null,
          api_name: a.apiName,
          display_name: a.displayName,
          description: a.description || null,
          icon_url: a.iconUrl || null,
          icon_locked_url: a.iconLockedUrl || null,
          hidden: a.hidden ? 1 : 0,
          points: a.points,
          rarity_percentage: a.rarityPercentage || null,
        }))
      )
    }

    return achievements
  }

  private loadFromSteamAppCache(gameId: string, appId: string): GameAchievement[] {
    const filename = `UserGameStatsSchema_${appId}.bin`
    for (const cacheDir of STEAM_CACHE_PATHS) {
      const fullPath = path.join(cacheDir, filename)
      if (fs.existsSync(fullPath)) {
        try {
          const buf = fs.readFileSync(fullPath)
          const vdfObj = parseBinaryVdf(buf)
          const parsed = extractAchievementsFromSchema(vdfObj, appId)

          if (parsed.length > 0) {
            return parsed.map((item, idx) => ({
              id: `${gameId}:${item.name}`,
              gameId,
              appId,
              apiName: item.name,
              displayName: item.displayName || item.name,
              description: item.description || null,
              iconUrl: item.icon
                ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${appId}/${item.icon}`
                : null,
              iconLockedUrl: item.iconGray
                ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${appId}/${item.iconGray}`
                : null,
              hidden: item.hidden,
              points: 10 + (idx % 4) * 5, // Default points (10, 15, 20, 25)
              rarityPercentage: null,
            }))
          }
        } catch {}
      }
    }
    return []
  }

  private loadFromGoldbergSchema(gameId: string, appId: string, installDir: string): GameAchievement[] {
    const candidates = [
      path.join(installDir, 'steam_settings', 'achievements.json'),
      path.join(installDir, 'steam_settings', 'settings', 'achievements.json'),
    ]

    for (const file of candidates) {
      if (fs.existsSync(file)) {
        try {
          const raw = fs.readFileSync(file, 'utf8')
          const data = JSON.parse(raw)
          if (Array.isArray(data)) {
            const list: GameAchievement[] = []
            for (let i = 0; i < data.length; i++) {
              const item = data[i]
              const name = item.name || item.apiName || item.id
              if (!name) continue

              const displayName = item.displayName || item.name || name
              const description = item.description || null
              let iconUrl = item.icon || null
              let iconLockedUrl = item.icongray || item.iconGray || null

              if (iconUrl && !iconUrl.startsWith('http')) {
                const localIcon = path.join(path.dirname(file), iconUrl)
                if (fs.existsSync(localIcon)) {
                  iconUrl = `file://${localIcon.replace(/\\/g, '/')}`
                } else {
                  iconUrl = `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${appId}/${iconUrl}`
                }
              }

              if (iconLockedUrl && !iconLockedUrl.startsWith('http')) {
                const localGray = path.join(path.dirname(file), iconLockedUrl)
                if (fs.existsSync(localGray)) {
                  iconLockedUrl = `file://${localGray.replace(/\\/g, '/')}`
                } else {
                  iconLockedUrl = `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${appId}/${iconLockedUrl}`
                }
              }

              list.push({
                id: `${gameId}:${name}`,
                gameId,
                appId,
                apiName: String(name),
                displayName: String(displayName),
                description,
                iconUrl,
                iconLockedUrl,
                hidden: Boolean(item.hidden),
                points: typeof item.points === 'number' ? item.points : 10 + (i % 4) * 5,
                rarityPercentage: null,
              })
            }
            if (list.length > 0) return list
          }
        } catch {}
      }
    }
    return []
  }

  private async fetchFromSteamStoreApi(gameId: string, appId: string): Promise<GameAchievement[]> {
    try {
      const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`
      const res = await fetch(url, { headers: { 'User-Agent': 'Otix-Desktop/1.0' } })
      if (!res.ok) return []

      const json = await res.json() as Record<string, any>
      const gameData = json[appId]?.data
      const highlighted = gameData?.achievements?.highlighted
      if (!Array.isArray(highlighted)) return []

      return highlighted.map((item: any, idx: number) => {
        const name = item.name || `ACH_${idx + 1}`
        return {
          id: `${gameId}:${name}`,
          gameId,
          appId,
          apiName: name,
          displayName: item.localized_name || item.name || name,
          description: null,
          iconUrl: item.path || (item.icon ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${appId}/${item.icon}` : null),
          iconLockedUrl: null,
          hidden: Boolean(item.hidden),
          points: 10 + (idx % 4) * 5,
          rarityPercentage: null,
        }
      })
    } catch {
      return []
    }
  }

  private async enrichRarityPercentages(appId: string, achievements: GameAchievement[]): Promise<void> {
    try {
      const url = `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appId}`
      const res = await fetch(url, { headers: { 'User-Agent': 'Otix-Desktop/1.0' } })
      if (!res.ok) return

      const data = await res.json() as Record<string, any>
      const list = data.achievementpercentages?.achievements
      if (!Array.isArray(list)) return

      const rarityMap = new Map<string, number>()
      for (const item of list) {
        if (item.name && item.percent !== undefined) {
          rarityMap.set(String(item.name).toLowerCase(), parseFloat(item.percent))
        }
      }

      for (const ach of achievements) {
        const percent = rarityMap.get(ach.apiName.toLowerCase())
        if (percent !== undefined && !isNaN(percent)) {
          ach.rarityPercentage = percent
        }
      }
    } catch {}
  }
}
