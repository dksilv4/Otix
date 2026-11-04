// desktop/game/achievements/__tests__/appid-resolver.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { resolveAppId } from '../appid-resolver'
import type { LocalGame } from '../../../preload-api'

describe('appid-resolver', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-appid-test-'))
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  it('resolves AppID from otixMediaId starting with steam:', () => {
    const game: LocalGame = {
      id: 'custom-game-1',
      title: 'Portal 2',
      exePath: 'C:\\Games\\Portal2\\portal2.exe',
      installDir: 'C:\\Games\\Portal2',
      platform: 'steam',
      otixMediaId: 'steam:620',
    }
    const res = resolveAppId(game)
    expect(res.appId).toBe('620')
    expect(res.source).toBe('steam')
  })

  it('resolves AppID from game.id if numeric', () => {
    const game: LocalGame = {
      id: '252950',
      title: 'Rocket League',
      exePath: 'C:\\Games\\RL\\rocketleague.exe',
      installDir: 'C:\\Games\\RL',
      platform: 'steam',
    }
    const res = resolveAppId(game)
    expect(res.appId).toBe('252950')
  })

  it('resolves AppID from steam_appid.txt in installDir', () => {
    const txtPath = path.join(tempDir, 'steam_appid.txt')
    fs.writeFileSync(txtPath, '105600\n')

    const game: LocalGame = {
      id: 'game-terraria',
      title: 'Terraria',
      exePath: path.join(tempDir, 'Terraria.exe'),
      installDir: tempDir,
      platform: 'pc',
    }
    const res = resolveAppId(game)
    expect(res.appId).toBe('105600')
    expect(res.source).toBe('local')
  })

  it('resolves AppID and detects goldberg emulator when steam_settings exists', () => {
    const settingsDir = path.join(tempDir, 'steam_settings')
    fs.mkdirSync(settingsDir)
    fs.writeFileSync(path.join(settingsDir, 'steam_appid.txt'), '883710')

    const game: LocalGame = {
      id: 'game-re',
      title: 'Resident Evil 2',
      exePath: path.join(tempDir, 're2.exe'),
      installDir: tempDir,
      platform: 'pc',
    }
    const res = resolveAppId(game)
    expect(res.appId).toBe('883710')
    expect(res.source).toBe('goldberg')
  })

  it('resolves AppID and detects codex emulator from steam_emu.ini', () => {
    const iniPath = path.join(tempDir, 'steam_emu.ini')
    fs.writeFileSync(iniPath, '[Settings]\nAppId=550\nUserName=CODEX\n')

    const game: LocalGame = {
      id: 'game-l4d2',
      title: 'Left 4 Dead 2',
      exePath: path.join(tempDir, 'left4dead2.exe'),
      installDir: tempDir,
      platform: 'pc',
    }
    const res = resolveAppId(game)
    expect(res.appId).toBe('550')
    expect(res.source).toBe('codex_rune')
  })

  it('detects emulator source for retroarch platform', () => {
    const game: LocalGame = {
      id: 'snes-smw',
      title: 'Super Mario World',
      exePath: 'C:\\Emulators\\RetroArch\\retroarch.exe',
      installDir: 'C:\\Emulators\\RetroArch',
      platform: 'retroarch',
    }
    const res = resolveAppId(game)
    expect(res.appId).toBeNull()
    expect(res.source).toBe('retroachievements')
  })
})
