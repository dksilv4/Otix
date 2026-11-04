// desktop/game/achievements/appid-resolver.ts
import * as fs from 'fs'
import * as path from 'path'
import type { LocalGame } from '../../preload-api'
import type { AppIdResolution, AchievementSource } from './types'

const INI_FILES_TO_CHECK = [
  'steam_api.ini',
  'steam_api64.ini',
  'steam_emu.ini',
  'codex.ini',
  'rune.ini',
  'flt.ini',
  'cream_api.ini',
  'ali213.ini',
  'SmartSteamEmu.ini',
  'valvesoftware.ini',
]

export function resolveAppId(game: LocalGame): AppIdResolution {
  // 1. Direct Steam Media ID or Game ID
  if (game.otixMediaId && game.otixMediaId.startsWith('steam:')) {
    const rawId = game.otixMediaId.slice(6)
    if (/^\d+$/.test(rawId)) {
      return { appId: rawId, source: game.platform === 'steam' ? 'steam' : 'local' }
    }
  }

  if (game.id && /^\d+$/.test(game.id)) {
    return { appId: game.id, source: game.platform === 'steam' ? 'steam' : 'local' }
  }

  if (game.id && game.id.startsWith('steam:')) {
    const rawId = game.id.slice(6)
    if (/^\d+$/.test(rawId)) {
      return { appId: rawId, source: game.platform === 'steam' ? 'steam' : 'local' }
    }
  }

  // 2. Check external sources metadata
  if (Array.isArray(game.sources)) {
    for (const src of game.sources) {
      if (typeof src === 'object' && src !== null) {
        const record = src as Record<string, any>
        if (record.source === 'steam' && record.id && /^\d+$/.test(String(record.id))) {
          return { appId: String(record.id), source: 'steam' }
        }
      }
    }
  }

  // 3. Inspect Filesystem around installDir and exePath
  const searchDirs: string[] = []
  if (game.installDir) {
    searchDirs.push(game.installDir)
  }
  if (game.exePath) {
    const exeDir = path.dirname(game.exePath)
    if (!searchDirs.includes(exeDir)) {
      searchDirs.push(exeDir)
    }
  }

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue

    // A. Check steam_appid.txt
    const steamAppIdTxt = path.join(dir, 'steam_appid.txt')
    if (fs.existsSync(steamAppIdTxt)) {
      try {
        const content = fs.readFileSync(steamAppIdTxt, 'utf8').trim()
        const match = content.match(/^(\d+)/)
        if (match) {
          const isGoldberg = fs.existsSync(path.join(dir, 'steam_settings'))
          return {
            appId: match[1],
            source: isGoldberg ? 'goldberg' : 'local',
            sourcePath: steamAppIdTxt,
          }
        }
      } catch {}
    }

    // B. Check steam_settings/steam_appid.txt
    const settingsAppId = path.join(dir, 'steam_settings', 'steam_appid.txt')
    if (fs.existsSync(settingsAppId)) {
      try {
        const content = fs.readFileSync(settingsAppId, 'utf8').trim()
        const match = content.match(/^(\d+)/)
        if (match) {
          return {
            appId: match[1],
            source: 'goldberg',
            sourcePath: settingsAppId,
          }
        }
      } catch {}
    }

    // C. Check steam_settings/settings.json
    const settingsJson = path.join(dir, 'steam_settings', 'settings.json')
    if (fs.existsSync(settingsJson)) {
      try {
        const json = JSON.parse(fs.readFileSync(settingsJson, 'utf8'))
        const appId = json.appid || json.app_id || json.AppId
        if (appId && /^\d+$/.test(String(appId))) {
          return {
            appId: String(appId),
            source: 'goldberg',
            sourcePath: settingsJson,
          }
        }
      } catch {}
    }

    // D. Check common emulator INI files
    for (const iniName of INI_FILES_TO_CHECK) {
      const iniPath = path.join(dir, iniName)
      if (fs.existsSync(iniPath)) {
        try {
          const content = fs.readFileSync(iniPath, 'utf8')
          const match = content.match(/(?:AppId|appid|AppID)\s*=\s*(\d+)/i)
          if (match) {
            let source: AchievementSource = 'local'
            if (iniName.includes('codex') || content.includes('CODEX')) {
              source = 'codex_rune'
            } else if (iniName.includes('rune') || content.includes('RUNE')) {
              source = 'codex_rune'
            } else if (iniName.includes('goldberg') || content.includes('Goldberg')) {
              source = 'goldberg'
            }
            return {
              appId: match[1],
              source,
              sourcePath: iniPath,
            }
          }
        } catch {}
      }
    }
  }

  // 4. Check RetroAchievements emulator match
  if (isRetroEmulator(game)) {
    return {
      appId: null,
      source: 'retroachievements',
    }
  }

  return {
    appId: null,
    source: 'local',
  }
}

function isRetroEmulator(game: LocalGame): boolean {
  const p = (game.platform || '').toLowerCase()
  if (['retroarch', 'duckstation', 'pcsx2', 'dolphin', 'snes', 'genesis', 'gba', 'psx', 'ps2'].includes(p)) {
    return true
  }
  const exe = path.basename(game.exePath || '').toLowerCase()
  return (
    exe.includes('retroarch') ||
    exe.includes('duckstation') ||
    exe.includes('pcsx2') ||
    exe.includes('dolphin') ||
    exe.includes('ppsspp') ||
    exe.includes('rpcs3')
  )
}
