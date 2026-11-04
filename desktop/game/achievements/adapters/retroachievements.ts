// desktop/game/achievements/adapters/retroachievements.ts
import * as fs from 'fs'
import * as path from 'path'

export interface RetroAchievementsUnlockCallback {
  (apiName: string, unlockedAt: number): void
}

export class RetroAchievementsAdapter {
  private pollInterval: NodeJS.Timeout | null = null
  private knownUnlocked: Set<string> = new Set()

  findRetroArchCheevosDir(): string | null {
    const appData = process.env.APPDATA
    if (appData) {
      const p = path.join(appData, 'RetroArch', 'cheevos')
      if (fs.existsSync(p)) return p
    }
    const commonPaths = [
      'C:\\RetroArch\\cheevos',
      'C:\\Program Files\\RetroArch\\cheevos',
      'D:\\RetroArch\\cheevos',
    ]
    for (const p of commonPaths) {
      if (fs.existsSync(p)) return p
    }
    return null
  }

  async checkRemoteUnlocks(username: string, apiKey: string, gameId: number): Promise<Array<{ apiName: string; unlockedAt?: number }>> {
    if (!username || !apiKey || !gameId) return []

    try {
      const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?z=${encodeURIComponent(username)}&y=${encodeURIComponent(apiKey)}&g=${gameId}`
      const res = await fetch(url, { headers: { 'User-Agent': 'Otix-Desktop/1.0' } })
      if (!res.ok) return []

      const data = await res.json() as Record<string, any>
      const achievements = data.Achievements || {}
      const results: Array<{ apiName: string; unlockedAt?: number }> = []

      for (const [id, ach] of Object.entries(achievements)) {
        const record = ach as Record<string, any>
        if (record.DateEarned) {
          const ts = Math.floor(new Date(record.DateEarned).getTime() / 1000)
          results.push({ apiName: String(id), unlockedAt: isNaN(ts) ? undefined : ts })
        }
      }
      return results
    } catch {
      return []
    }
  }

  startWatching(
    raGameId: number,
    username: string | undefined,
    apiKey: string | undefined,
    onUnlock: RetroAchievementsUnlockCallback
  ): void {
    if (!username || !apiKey) return

    const check = async () => {
      const current = await this.checkRemoteUnlocks(username, apiKey, raGameId)
      for (const item of current) {
        if (!this.knownUnlocked.has(item.apiName)) {
          this.knownUnlocked.add(item.apiName)
          onUnlock(item.apiName, item.unlockedAt || Math.floor(Date.now() / 1000))
        }
      }
    }

    // Initial check
    check().catch(() => {})

    // Check periodically during gameplay (e.g. every 15s)
    this.pollInterval = setInterval(() => {
      check().catch(() => {})
    }, 15000)
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    this.knownUnlocked.clear()
  }
}
