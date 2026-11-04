// desktop/game/achievements/tracker.ts
import { EventEmitter } from 'events'
import type { LocalGame } from '../../preload-api'
import type {
  AchievementStats,
  AchievementUnlockEvent,
  AchievementWithUnlock,
} from './types'
import { resolveAppId } from './appid-resolver'
import { AchievementSchemaFetcher } from './schema-fetcher'
import { SteamLocalAdapter } from './adapters/steam-local'
import { GoldbergAdapter } from './adapters/goldberg'
import { CodexRuneAdapter } from './adapters/codex-rune'
import { RetroAchievementsAdapter } from './adapters/retroachievements'
import { AchievementsRepository } from '../../db/repositories/achievements'

interface ActiveSession {
  gameId: string
  gameTitle: string
  appId: string | null
  steamAdapter?: SteamLocalAdapter
  goldbergAdapter?: GoldbergAdapter
  codexRuneAdapter?: CodexRuneAdapter
  retroAdapter?: RetroAchievementsAdapter
}

export class AchievementTracker extends EventEmitter {
  private repo: AchievementsRepository
  private schemaFetcher: AchievementSchemaFetcher
  private activeSessions: Map<string, ActiveSession> = new Map()

  constructor(repo?: AchievementsRepository, schemaFetcher?: AchievementSchemaFetcher) {
    super()
    this.repo = repo || new AchievementsRepository()
    this.schemaFetcher = schemaFetcher || new AchievementSchemaFetcher(this.repo)
  }

  async startTracking(game: LocalGame): Promise<void> {
    if (this.activeSessions.has(game.id)) {
      return
    }

    const resolution = resolveAppId(game)
    const session: ActiveSession = {
      gameId: game.id,
      gameTitle: game.title,
      appId: resolution.appId,
    }
    this.activeSessions.set(game.id, session)

    // Load schema in background
    this.schemaFetcher
      .getOrFetchSchema(game, resolution)
      .then(schema => {
        this.emit('achievements:loaded', game.id, schema.length)
      })
      .catch(() => {})

    const appId = resolution.appId

    // 1. Initial offline unlock scan for emulators
    if (appId) {
      const goldberg = new GoldbergAdapter()
      const goldbergUnlocks = goldberg.readUnlockedAchievements(appId, game.installDir)
      if (goldbergUnlocks.length > 0) {
        this.repo.unlockBatch(
          game.id,
          goldbergUnlocks.map(u => ({ apiName: u.apiName, unlockedAt: u.unlockedAt, source: 'goldberg' }))
        )
      }

      const codexRune = new CodexRuneAdapter()
      const codexUnlocks = codexRune.readUnlockedAchievements(appId, game.installDir)
      if (codexUnlocks.length > 0) {
        this.repo.unlockBatch(
          game.id,
          codexUnlocks.map(u => ({ apiName: u.apiName, unlockedAt: u.unlockedAt, source: 'codex_rune' }))
        )
      }

      // 2. Start Live Watchers
      // Steam Live log watcher
      const steamAdapter = new SteamLocalAdapter()
      steamAdapter.startWatching(appId, (apiName, unlockedAt) => {
        this.handleUnlock(game.id, game.title, apiName, 'steam', unlockedAt)
      })
      session.steamAdapter = steamAdapter

      // Goldberg live watcher
      goldberg.startWatching(appId, game.installDir, (apiName, unlockedAt) => {
        this.handleUnlock(game.id, game.title, apiName, 'goldberg', unlockedAt)
      })
      session.goldbergAdapter = goldberg

      // CODEX/RUNE live watcher
      codexRune.startWatching(appId, game.installDir, (apiName, unlockedAt) => {
        this.handleUnlock(game.id, game.title, apiName, 'codex_rune', unlockedAt)
      })
      session.codexRuneAdapter = codexRune
    }

    // RetroAchievements live adapter
    if (resolution.source === 'retroachievements') {
      const retroAdapter = new RetroAchievementsAdapter()
      // Can be started if credentials or gameId configured
      session.retroAdapter = retroAdapter
    }
  }

  stopTracking(gameId: string): void {
    const session = this.activeSessions.get(gameId)
    if (!session) return

    if (session.steamAdapter) {
      session.steamAdapter.stop()
    }
    if (session.goldbergAdapter) {
      session.goldbergAdapter.stop()
    }
    if (session.codexRuneAdapter) {
      session.codexRuneAdapter.stop()
    }
    if (session.retroAdapter) {
      session.retroAdapter.stop()
    }

    this.activeSessions.delete(gameId)
  }

  handleUnlock(
    gameId: string,
    gameTitle: string,
    apiName: string,
    source: string,
    unlockedAt?: number
  ): boolean {
    const ts = unlockedAt || Math.floor(Date.now() / 1000)
    const newlyUnlocked = this.repo.unlockAchievement(gameId, apiName, ts, source)

    if (newlyUnlocked) {
      // Fetch achievement definition for title, description, icon, points
      const allAchievements = this.repo.getAchievementsForGame(gameId)
      const found = allAchievements.find(a => a.api_name.toLowerCase() === apiName.toLowerCase())

      const payload: AchievementUnlockEvent = {
        gameId,
        gameTitle,
        apiName,
        displayName: found?.display_name || apiName,
        description: found?.description || null,
        iconUrl: found?.icon_url || null,
        points: found?.points || 10,
        unlockedAt: ts,
        source,
        rarityPercentage: found?.rarity_percentage || null,
      }

      this.emit('achievement:unlocked', payload)
      return true
    }

    return false
  }

  getAchievementsForGame(gameId: string): AchievementWithUnlock[] {
    const rows = this.repo.getAchievementsForGame(gameId)
    return rows.map(r => ({
      id: r.id,
      gameId: r.game_id,
      appId: r.app_id,
      apiName: r.api_name,
      displayName: r.display_name,
      description: r.description,
      iconUrl: r.icon_url,
      iconLockedUrl: r.icon_locked_url,
      hidden: Boolean(r.hidden),
      points: r.points,
      rarityPercentage: r.rarity_percentage,
      unlocked: r.unlocked,
      unlockedAt: r.unlocked_at,
      source: r.source,
    }))
  }

  getStatsForGame(gameId: string): AchievementStats {
    return this.repo.getStatsForGame(gameId)
  }

  getRecentUnlocks(limit: number = 10): Array<AchievementWithUnlock & { game_title?: string }> {
    const rows = this.repo.getRecentUnlocks(limit)
    return rows.map(r => ({
      id: r.id,
      gameId: r.game_id,
      appId: r.app_id,
      apiName: r.api_name,
      displayName: r.display_name,
      description: r.description,
      iconUrl: r.icon_url,
      iconLockedUrl: r.icon_locked_url,
      hidden: Boolean(r.hidden),
      points: r.points,
      rarityPercentage: r.rarity_percentage,
      unlocked: true,
      unlockedAt: r.unlocked_at,
      source: r.source,
      game_title: r.game_title,
    }))
  }

  async syncGame(game: LocalGame): Promise<{ synced: number }> {
    const resolution = resolveAppId(game)
    await this.schemaFetcher.getOrFetchSchema(game, resolution)

    let totalSynced = 0
    if (resolution.appId) {
      const goldberg = new GoldbergAdapter()
      const gUnlocks = goldberg.readUnlockedAchievements(resolution.appId, game.installDir)
      if (gUnlocks.length > 0) {
        const added = this.repo.unlockBatch(
          game.id,
          gUnlocks.map(u => ({ apiName: u.apiName, unlockedAt: u.unlockedAt, source: 'goldberg' }))
        )
        totalSynced += added.length
      }

      const codex = new CodexRuneAdapter()
      const cUnlocks = codex.readUnlockedAchievements(resolution.appId, game.installDir)
      if (cUnlocks.length > 0) {
        const added = this.repo.unlockBatch(
          game.id,
          cUnlocks.map(u => ({ apiName: u.apiName, unlockedAt: u.unlockedAt, source: 'codex_rune' }))
        )
        totalSynced += added.length
      }
    }

    return { synced: totalSynced }
  }
}
