// desktop/game/achievements/__tests__/adapters.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { GoldbergAdapter } from '../adapters/goldberg'
import { CodexRuneAdapter } from '../adapters/codex-rune'

describe('achievements adapters', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-adapters-test-'))
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  describe('GoldbergAdapter', () => {
    it('parses array of achievements with earned flags', () => {
      const settingsDir = path.join(tempDir, 'steam_settings')
      fs.mkdirSync(settingsDir)
      const achFile = path.join(settingsDir, 'achievements.json')

      fs.writeFileSync(
        achFile,
        JSON.stringify([
          { name: 'ACH_START', earned: true, earned_time: 1700000000 },
          { name: 'ACH_FINISH', earned: false },
        ])
      )

      const adapter = new GoldbergAdapter()
      const unlocked = adapter.readUnlockedAchievements('1234', tempDir)
      expect(unlocked).toEqual([{ apiName: 'ACH_START', unlockedAt: 1700000000 }])
    })

    it('parses dictionary format of achievements.json', () => {
      const settingsDir = path.join(tempDir, 'steam_settings')
      fs.mkdirSync(settingsDir)
      const achFile = path.join(settingsDir, 'achievements.json')

      fs.writeFileSync(
        achFile,
        JSON.stringify({
          ACH_LEVEL1: { earned: true, earned_time: 1711111111 },
          ACH_LEVEL2: { earned: false },
        })
      )

      const adapter = new GoldbergAdapter()
      const unlocked = adapter.readUnlockedAchievements('1234', tempDir)
      expect(unlocked).toEqual([{ apiName: 'ACH_LEVEL1', unlockedAt: 1711111111 }])
    })
  })

  describe('CodexRuneAdapter', () => {
    it('parses achievements.ini with section [Achievements]', () => {
      const iniFile = path.join(tempDir, 'achievements.ini')
      fs.writeFileSync(
        iniFile,
        '[Achievements]\nACH_PROLOGUE=1\nACH_BOSS_1=1700000050\nACH_NOT_EARNED=0\n'
      )

      const adapter = new CodexRuneAdapter()
      const unlocked = adapter.readUnlockedAchievements('5678', tempDir)
      expect(unlocked).toHaveLength(2)
      expect(unlocked).toEqual([
        { apiName: 'ACH_PROLOGUE', unlockedAt: undefined },
        { apiName: 'ACH_BOSS_1', unlockedAt: 1700000050 },
      ])
    })
  })
})
