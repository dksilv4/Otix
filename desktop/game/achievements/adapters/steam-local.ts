// desktop/game/achievements/adapters/steam-local.ts
import * as fs from 'fs'
import * as path from 'path'

export interface SteamLogUnlockCallback {
  (apiName: string, unlockedAt: number): void
}

const COMMON_STEAM_PATHS = [
  'C:\\Program Files (x86)\\Steam',
  'C:\\Program Files\\Steam',
  'D:\\Steam',
  'E:\\Steam',
]

export class SteamLocalAdapter {
  private logPath: string | null = null
  private watcher: fs.FSWatcher | null = null
  private lastSize: number = 0
  private intervalTimer: NodeJS.Timeout | null = null

  constructor(customSteamPath?: string) {
    this.logPath = this.findStatsLog(customSteamPath)
  }

  private findStatsLog(customSteamPath?: string): string | null {
    const candidates = customSteamPath ? [customSteamPath, ...COMMON_STEAM_PATHS] : COMMON_STEAM_PATHS
    for (const root of candidates) {
      const candidate = path.join(root, 'logs', 'stats_log.txt')
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }
    return null
  }

  getLogPath(): string | null {
    return this.logPath
  }

  startWatching(appId: string, onUnlock: SteamLogUnlockCallback): void {
    if (!this.logPath || !fs.existsSync(this.logPath)) return

    try {
      const stats = fs.statSync(this.logPath)
      this.lastSize = stats.size
    } catch {
      this.lastSize = 0
    }

    const checkLog = () => {
      if (!this.logPath || !fs.existsSync(this.logPath)) return
      try {
        const stats = fs.statSync(this.logPath)
        if (stats.size > this.lastSize) {
          const stream = fs.createReadStream(this.logPath, {
            start: this.lastSize,
            end: stats.size,
          })

          let buffer = ''
          stream.on('data', chunk => {
            buffer += chunk.toString()
          })

          stream.on('end', () => {
            this.lastSize = stats.size
            this.parseLogLines(buffer, appId, onUnlock)
          })
        } else if (stats.size < this.lastSize) {
          // Log was truncated or rotated
          this.lastSize = stats.size
        }
      } catch {}
    }

    // Use FSWatcher with polling fallback for responsiveness across Windows filesystems
    try {
      this.watcher = fs.watch(this.logPath, () => {
        checkLog()
      })
    } catch {
      // Fallback to polling if fs.watch fails
    }

    this.intervalTimer = setInterval(checkLog, 2000)
  }

  private parseLogLines(content: string, appId: string, onUnlock: SteamLogUnlockCallback): void {
    const lines = content.split(/\r?\n/)
    const setAchRe = /\[AppID\s+(\d+)\]\s+(?:SetAchievement|Achievement unlocked)\s+([^\s\r\n]+)/i

    for (const line of lines) {
      const match = line.match(setAchRe)
      if (match) {
        const matchedAppId = match[1]
        const apiName = match[2]
        if (matchedAppId === appId) {
          onUnlock(apiName, Math.floor(Date.now() / 1000))
        }
      }
    }
  }

  stop(): void {
    if (this.watcher) {
      try {
        this.watcher.close()
      } catch {}
      this.watcher = null
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer)
      this.intervalTimer = null
    }
  }
}
