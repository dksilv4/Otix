// desktop/game/achievements/adapters/goldberg.ts
import * as fs from 'fs'
import * as path from 'path'

export interface GoldbergUnlockCallback {
  (apiName: string, unlockedAt: number): void
}

export class GoldbergAdapter {
  private watchers: fs.FSWatcher[] = []
  private pollInterval: NodeJS.Timeout | null = null
  private knownUnlocked: Set<string> = new Set()

  findAchievementsFiles(appId: string, installDir?: string): string[] {
    const paths: string[] = []
    const appData = process.env.APPDATA

    if (appData) {
      const gSaves = path.join(appData, 'Goldberg SteamEmu Saves', appId, 'achievements.json')
      if (fs.existsSync(gSaves)) {
        paths.push(gSaves)
      }
    }

    if (installDir) {
      const localDirect = path.join(installDir, 'steam_settings', 'achievements.json')
      if (fs.existsSync(localDirect) && !paths.includes(localDirect)) {
        paths.push(localDirect)
      }
      const localNested = path.join(installDir, 'steam_settings', 'settings', 'achievements.json')
      if (fs.existsSync(localNested) && !paths.includes(localNested)) {
        paths.push(localNested)
      }
    }

    return paths
  }

  readUnlockedAchievements(appId: string, installDir?: string): Array<{ apiName: string; unlockedAt?: number }> {
    const files = this.findAchievementsFiles(appId, installDir)
    const results: Array<{ apiName: string; unlockedAt?: number }> = []

    for (const file of files) {
      try {
        const raw = fs.readFileSync(file, 'utf8')
        const data = JSON.parse(raw)

        if (Array.isArray(data)) {
          for (const item of data) {
            if (typeof item === 'string') {
              results.push({ apiName: item })
            } else if (typeof item === 'object' && item !== null) {
              const name = item.name || item.apiName || item.id
              const earned = item.earned !== false && item.unlocked !== false
              if (name && earned) {
                results.push({
                  apiName: String(name),
                  unlockedAt: typeof item.earned_time === 'number' ? item.earned_time : undefined,
                })
              }
            }
          }
        } else if (typeof data === 'object' && data !== null) {
          for (const [key, val] of Object.entries(data)) {
            if (typeof val === 'object' && val !== null) {
              const record = val as Record<string, any>
              const earned = record.earned !== false && record.unlocked !== false
              if (earned) {
                results.push({
                  apiName: key,
                  unlockedAt: typeof record.earned_time === 'number' ? record.earned_time : undefined,
                })
              }
            } else if (val === true || val === 1) {
              results.push({ apiName: key })
            }
          }
        }
      } catch {}
    }

    return results
  }

  startWatching(appId: string, installDir: string | undefined, onUnlock: GoldbergUnlockCallback): void {
    // Initial populate
    const initial = this.readUnlockedAchievements(appId, installDir)
    for (const item of initial) {
      this.knownUnlocked.add(item.apiName)
    }

    const checkFiles = () => {
      const current = this.readUnlockedAchievements(appId, installDir)
      for (const item of current) {
        if (!this.knownUnlocked.has(item.apiName)) {
          this.knownUnlocked.add(item.apiName)
          onUnlock(item.apiName, item.unlockedAt || Math.floor(Date.now() / 1000))
        }
      }
    }

    const files = this.findAchievementsFiles(appId, installDir)
    for (const file of files) {
      try {
        const watcher = fs.watch(file, () => {
          checkFiles()
        })
        this.watchers.push(watcher)
      } catch {}
    }

    // Polling fallback
    this.pollInterval = setInterval(checkFiles, 3000)
  }

  stop(): void {
    for (const w of this.watchers) {
      try {
        w.close()
      } catch {}
    }
    this.watchers = []
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    this.knownUnlocked.clear()
  }
}
