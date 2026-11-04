// desktop/game/achievements/adapters/codex-rune.ts
import * as fs from 'fs'
import * as path from 'path'

export interface CodexRuneUnlockCallback {
  (apiName: string, unlockedAt: number): void
}

export class CodexRuneAdapter {
  private watchers: fs.FSWatcher[] = []
  private pollInterval: NodeJS.Timeout | null = null
  private knownUnlocked: Set<string> = new Set()

  findIniFiles(appId: string, installDir?: string): string[] {
    const paths: string[] = []
    const publicDoc = process.env.PUBLIC
    const localAppData = process.env.LOCALAPPDATA
    const appData = process.env.APPDATA

    if (publicDoc) {
      const pCodex = path.join(publicDoc, 'Documents', 'Steam', 'CODEX', appId, 'achievements.ini')
      if (fs.existsSync(pCodex)) paths.push(pCodex)
      const pRune = path.join(publicDoc, 'Documents', 'Steam', 'RUNE', appId, 'achievements.ini')
      if (fs.existsSync(pRune)) paths.push(pRune)
      const pFlt = path.join(publicDoc, 'Documents', 'Steam', 'FLT', appId, 'achievements.ini')
      if (fs.existsSync(pFlt)) paths.push(pFlt)
      const pStats = path.join(publicDoc, 'Documents', 'Steam', 'CODEX', appId, 'stats.ini')
      if (fs.existsSync(pStats)) paths.push(pStats)
    }

    if (localAppData) {
      const lCodex = path.join(localAppData, 'Steam', 'CODEX', appId, 'achievements.ini')
      if (fs.existsSync(lCodex) && !paths.includes(lCodex)) paths.push(lCodex)
    }

    if (appData) {
      const aCodex = path.join(appData, 'Steam', 'CODEX', appId, 'achievements.ini')
      if (fs.existsSync(aCodex) && !paths.includes(aCodex)) paths.push(aCodex)
    }

    if (installDir) {
      const inProfile = path.join(installDir, 'Profile', 'achievements.ini')
      if (fs.existsSync(inProfile) && !paths.includes(inProfile)) paths.push(inProfile)
      const inLocal = path.join(installDir, 'achievements.ini')
      if (fs.existsSync(inLocal) && !paths.includes(inLocal)) paths.push(inLocal)
    }

    return paths
  }

  readUnlockedAchievements(appId: string, installDir?: string): Array<{ apiName: string; unlockedAt?: number }> {
    const files = this.findIniFiles(appId, installDir)
    const results: Array<{ apiName: string; unlockedAt?: number }> = []

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8')
        const lines = content.split(/\r?\n/)
        let inSection = false

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue

          if (trimmed.startsWith('[')) {
            inSection = /\[(?:Achievements|Achievement|Stats)\]/i.test(trimmed)
            continue
          }

          if (inSection) {
            const eqIdx = trimmed.indexOf('=')
            if (eqIdx !== -1) {
              const key = trimmed.slice(0, eqIdx).trim()
              const val = trimmed.slice(eqIdx + 1).trim()
              const numVal = parseInt(val, 10)
              if (!isNaN(numVal) && numVal > 0) {
                // If value is greater than 100,000,000 it is likely a Unix timestamp
                const unlockedAt = numVal > 100000000 ? numVal : undefined
                results.push({ apiName: key, unlockedAt })
              } else if (val.toLowerCase() === 'true') {
                results.push({ apiName: key })
              }
            }
          }
        }
      } catch {}
    }

    return results
  }

  startWatching(appId: string, installDir: string | undefined, onUnlock: CodexRuneUnlockCallback): void {
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

    const files = this.findIniFiles(appId, installDir)
    for (const file of files) {
      try {
        const watcher = fs.watch(file, () => {
          checkFiles()
        })
        this.watchers.push(watcher)
      } catch {}
    }

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
