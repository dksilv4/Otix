import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── Module-level mocks (hoisted by vitest) ─────────────────────────

vi.mock('ps-list', () => ({ default: vi.fn() }))
vi.mock('child_process', () => {
  const actual = vi.importActual('child_process')
  return { ...actual, exec: vi.fn() }
})
vi.mock('fs')

// ── Imports that depend on mocks ────────────────────────────────────

import psList from 'ps-list'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { GameDetector } from './game-detector'
import type { LocalGame } from './scanner'

// ── Helpers ─────────────────────────────────────────────────────────

function makeGame(overrides: Partial<LocalGame> = {}): LocalGame {
  return {
    id: 'test-game',
    title: 'Test Game',
    exePath: 'C:\\Games\\test-game\\testgame.exe',
    installDir: 'C:\\Games\\test-game',
    platform: 'pc',
    ...overrides,
  }
}

/** Resolve the callback passed to `exec()` with fake window titles. */
function mockWindowTitles(titles: Array<{ processName: string; pid: number; title: string }>) {
  const data = titles.map((t) => ({
    ProcessName: t.processName,
    Id: t.pid,
    MainWindowTitle: t.title,
  }))
  const json = JSON.stringify(data)

  const mockedExec = vi.mocked(exec)
  mockedExec.mockImplementation(((_cmd: unknown, _opts: unknown, cb: unknown) => {
    const callback = cb as (err: Error | null, stdout: string, stderr: string) => void
    callback(null, json, '')
    return {} as any
  }) as any)
}

/** Make psList return a given process list with real PIDs. */
function mockProcesses(names: string[]) {
  vi.mocked(psList).mockResolvedValue(names.map((n) => ({ name: n, pid: process.pid, ppid: 0, cpu: 0, memory: 0 })))
}

/** Resolve to an empty process list. */
function mockNoProcesses() {
  vi.mocked(psList).mockResolvedValue([])
}

function createDetector(sessionsDir?: string): GameDetector {
  const dir = sessionsDir ?? path.join(process.cwd(), '.test-sessions')
  return new GameDetector(dir)
}

// ── Tests ───────────────────────────────────────────────────────────

describe('GameDetector', () => {
  let detector: GameDetector

  beforeEach(() => {
    vi.clearAllMocks()

    // Re-establish all basic mocks after clearAllMocks
    mockNoProcesses()
    mockWindowTitles([])

    // Suppress console.error during tests
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Default fs mocks
    vi.mocked(fs.existsSync).mockReturnValue(false)

    detector = createDetector()
  })

  afterEach(() => {
    detector.stopAll()
    vi.clearAllMocks()
  })

  afterEach(() => {
    detector.stopAll()
    vi.restoreAllMocks()
  })

  // ── Empty library ──

  describe('with empty library', () => {
    it('returns nothing from scanRunningProcesses', async () => {
      const results = await detector.scanRunningProcesses()
      expect(results).toEqual([])
    })

    it('returns null from getRunningGame', () => {
      expect(detector.getRunningGame()).toBeNull()
    })

    it('returns empty array from getRunningGames', () => {
      expect(detector.getRunningGames()).toEqual([])
    })
  })

  // ── Exact exe path match ──

  describe('exe path matching', () => {
    it('detects a game when its exe basename matches a running process', async () => {
      const game = makeGame({ id: 'game-1', title: 'Cyberpunk 2077', exePath: 'D:/Games/Cyberpunk 2077/bin/x64/cp2077.exe' })
      detector.setLibrary([game])
      mockProcesses(['cp2077.exe', 'explorer.exe', 'svchost.exe'])

      const results = await detector.scanRunningProcesses()
      expect(results).toHaveLength(1)
      expect(results[0].game.id).toBe('game-1')
    })

    it('is case-insensitive when matching exe names', async () => {
      const game = makeGame({ id: 'game-2', exePath: 'C:/Games/MY GAME/MYGAME.exe' })
      detector.setLibrary([game])
      mockProcesses(['mygame.exe'])

      const results = await detector.scanRunningProcesses()
      expect(results).toHaveLength(1)
    })

    it('matches localExePath when exePath is a steam url', async () => {
      const game = makeGame({
        id: 'game-3',
        exePath: 'steam://rungameid/730',
        localExePath: 'C:/Program Files/Steam/csgo.exe',
      })
      detector.setLibrary([game])
      mockProcesses(['csgo.exe'])

      const results = await detector.scanRunningProcesses()
      expect(results).toHaveLength(1)
    })
  })

  // ── Window title matching ──

  describe('window title matching', () => {
    it('detects a game when its full title appears in a window title', async () => {
      const game = makeGame({ id: 'game-1', title: 'The Witcher 3' })
      detector.setLibrary([game])
      mockProcesses(['witcher3.exe'])
      mockWindowTitles([{ processName: 'witcher3', pid: 2001, title: 'The Witcher 3: Wild Hunt' }])

      const results = await detector.scanRunningProcesses()
      expect(results).toHaveLength(1)
      expect(results[0].game.id).toBe('game-1')
    })

    it('matches when window title shorter but contained in game title', async () => {
      const game = makeGame({ id: 'game-2', title: 'Cyberpunk 2077 — Phantom Liberty' })
      detector.setLibrary([game])
      mockProcesses(['cp2077.exe'])
      mockWindowTitles([{ processName: 'cp2077', pid: 2002, title: 'Cyberpunk 2077' }])

      const results = await detector.scanRunningProcesses()
      expect(results).toHaveLength(1)
    })

    it('matches using word-level matching for long titles', async () => {
      const game = makeGame({ id: 'game-3', title: 'Star Wars: Jedi Fallen Order' })
      detector.setLibrary([game])
      mockProcesses(['swjedifallenorder.exe'])
      mockWindowTitles([{ processName: 'swjedifallenorder', pid: 2003, title: 'Jedi: Fallen Order' }])

      const results = await detector.scanRunningProcesses()
      expect(results).toHaveLength(1)
    })
  })

  // ── Fuzzy process name matching ──

  describe('fuzzy process name matching', () => {
    it('generates exe candidates from the game title and matches them', async () => {
      const game = makeGame({ id: 'game-1', title: 'Cyberpunk 2077' })
      detector.setLibrary([game])
      mockProcesses(['cyberpunk2077.exe'])

      const results = await detector.scanRunningProcesses()
      expect(results).toHaveLength(1)
    })

    it('finds game via install directory basename', async () => {
      const game = makeGame({
        id: 'game-2',
        title: 'Some Obscure Game',
        installDir: 'D:/Games/STARFIELD',
      })
      detector.setLibrary([game])
      mockProcesses(['starfield.exe'])

      const results = await detector.scanRunningProcesses()
      expect(results).toHaveLength(1)
    })

    it('does not false-positive on completely unrelated processes', async () => {
      const game = makeGame({ id: 'game-3', title: 'Baldurs Gate 3' })
      detector.setLibrary([game])
      mockProcesses(['notepad.exe', 'chrome.exe', 'explorer.exe'])

      const results = await detector.scanRunningProcesses()
      expect(results).toHaveLength(0)
    })
  })

  // ── Custom process mappings ──

  describe('custom process mappings', () => {
    it('detects a game via a user-defined process mapping', async () => {
      const game = makeGame({ id: 'game-1', title: 'Some Game' })
      detector.addMapping('game_launcher.exe', 'game-1', 'Some Game')
      detector.setLibrary([game])
      mockProcesses(['game_launcher.exe'])

      const results = await detector.scanRunningProcesses()
      expect(results).toHaveLength(1)
      expect(results[0].game.id).toBe('game-1')
    })
  })

  // ── Session lifecycle ──

  describe('session lifecycle', () => {
    it('emits game:started when a new game is detected', async () => {
      const started = vi.fn()
      detector.on('game:started', started)

      const game = makeGame({ id: 'game-1', exePath: 'C:/game.exe' })
      detector.setLibrary([game])
      mockProcesses(['game.exe'])

      await detector.scanRunningProcesses()
      expect(started).toHaveBeenCalledTimes(1)
      expect(started).toHaveBeenCalledWith(expect.objectContaining({
        game: expect.objectContaining({ id: 'game-1' }),
        launchedByOtix: false,
      }))
    })

    it('does not re-emit game:started for already-detected game', async () => {
      const started = vi.fn()
      detector.on('game:started', started)

      const game = makeGame({ id: 'game-1', exePath: 'C:/game.exe' })
      detector.setLibrary([game])
      mockProcesses(['game.exe'])

      await detector.scanRunningProcesses()
      expect(started).toHaveBeenCalledTimes(1)

      // Second scan — game still running
      await detector.scanRunningProcesses()
      expect(started).toHaveBeenCalledTimes(1)
    })

    it('emits game:ended when a detected game stops running', async () => {
      const ended = vi.fn()
      detector.on('game:ended', ended)

      const game = makeGame({ id: 'game-1', exePath: 'C:/game.exe' })
      detector.setLibrary([game])
      mockProcesses(['game.exe'])

      await detector.scanRunningProcesses()
      expect(ended).not.toHaveBeenCalled()

      // Game stops running
      mockProcesses([])
      await detector.scanRunningProcesses()
      expect(ended).toHaveBeenCalledTimes(1)
      expect(ended).toHaveBeenCalledWith(expect.objectContaining({
        gameId: 'game-1',
        launchedByOtix: false,
      }))
    })

    it('startTracking with a valid PID keeps the game in getRunningGames', () => {
      const started = vi.fn()
      detector.on('game:started', started)

      const game = makeGame()
      // Use the current process's PID which is guaranteed to exist
      detector.startTracking(game, process.pid)

      expect(started).toHaveBeenCalledTimes(1)
      expect(detector.getRunningGame()?.game.id).toBe(game.id)
    })

    it('startTracking without PID preserves the game in getRunningGames', () => {
      const game = makeGame()
      detector.startTracking(game)

      expect(detector.getRunningGame()?.game.id).toBe(game.id)
    })

    it('stopTracking emits game:ended and removes the game', () => {
      const ended = vi.fn()
      detector.on('game:ended', ended)

      const game = makeGame()
      detector.startTracking(game)
      expect(detector.getRunningGame()).not.toBeNull()

      detector.stopTracking(game.id)
      expect(ended).toHaveBeenCalledTimes(1)
      expect(detector.getRunningGame()).toBeNull()
    })
  })

  // ── Multiple game ──

  describe('multiple concurrent game', () => {
    it('detects multiple game running simultaneously', async () => {
      const g1 = makeGame({ id: 'game-1', title: 'Game Alpha', exePath: 'C:/alpha.exe' })
      const g2 = makeGame({ id: 'game-2', title: 'Game Beta', exePath: 'D:/beta.exe' })
      const g3 = makeGame({ id: 'game-3', title: 'Game Gamma', exePath: 'E:/gamma.exe' })
      detector.setLibrary([g1, g2, g3])
      mockProcesses(['alpha.exe', 'gamma.exe'])

      const results = await detector.scanRunningProcesses()
      expect(results).toHaveLength(2)
      const ids = results.map((r) => r.game.id).sort()
      expect(ids).toEqual(['game-1', 'game-3'])
    })

    it('independently starts/stops each game', async () => {
      const ended = vi.fn()
      detector.on('game:ended', ended)

      const g1 = makeGame({ id: 'g1', exePath: 'C:/g1.exe' })
      const g2 = makeGame({ id: 'g2', exePath: 'C:/g2.exe' })
      detector.setLibrary([g1, g2])
      mockProcesses(['g1.exe', 'g2.exe'])

      await detector.scanRunningProcesses()
      expect(detector.getRunningGames()).toHaveLength(2)

      // g2 stops
      mockProcesses(['g1.exe'])
      await detector.scanRunningProcesses()
      expect(detector.getRunningGames()).toHaveLength(1)
      expect(detector.getRunningGame()?.game.id).toBe('g1')
      expect(ended).toHaveBeenCalledWith(expect.objectContaining({ gameId: 'g2' }))
    })
  })

  // ── PID-based tracking ──

  describe('PID-based tracking', () => {
    it('keeps game tracked with a real PID alive even when process list is empty', async () => {
      const game = makeGame({ id: 'game-1', exePath: 'C:/game.exe' })
      detector.setLibrary([game])
      // Use current process PID — guaranteed to exist
      detector.startTracking(game, process.pid)

      // With a valid PID, the game stays alive (getRunningGames PID check succeeds)
      mockProcesses([])
      const results = await detector.scanRunningProcesses()
      expect(results).toHaveLength(1)
    })

    it('cleans up game whose PID no longer exists', async () => {
      const game = makeGame({ id: 'game-1', exePath: 'C:/game.exe' })
      // PID 9999 does not exist — getRunningGames will clean it up
      detector.startTracking(game, 9999)

      mockProcesses([])
      const results = await detector.scanRunningProcesses()
      expect(results).toHaveLength(0)
    })
  })

  // ── Library management ──

  describe('library management', () => {
    it('setLibrary replaces the internal library', () => {
      const g1 = makeGame({ id: 'g1' })
      const g2 = makeGame({ id: 'g2' })
      detector.setLibrary([g1])
      expect(detector.getLibrary()).toHaveLength(1)

      detector.setLibrary([g2])
      expect(detector.getLibrary()).toHaveLength(1)
      expect(detector.getLibrary()[0].id).toBe('g2')
    })

    it('getLibrary returns a copy, not a reference', () => {
      const g1 = makeGame({ id: 'g1' })
      detector.setLibrary([g1])
      const lib = detector.getLibrary()
      lib.pop()
      expect(detector.getLibrary()).toHaveLength(1)
    })
  })

  // ── getRunningProcesses ──

  describe('getRunningProcesses', () => {
    it('returns running processes with window titles', async () => {
      mockProcesses(['notepad.exe', 'chrome.exe'])
      mockWindowTitles([
        { processName: 'notepad', pid: 1001, title: 'Untitled - Notepad' },
      ])

      const procs = await detector.getRunningProcesses()
      expect(procs.length).toBeGreaterThanOrEqual(2)
      const notepad = procs.find((p) => p.name === 'notepad.exe')
      // Note: psList returns "notepad.exe" (with extension) but PowerShell
      // Get-Process returns ProcessName without ".exe", so the matching
      // in getRunningProcesses needs to handle both forms
      expect(notepad).toBeDefined()
    })

    it('filters out system processes', async () => {
      mockProcesses(['system_idle_process', 'notepad.exe'])
      const procs = await detector.getRunningProcesses()
      expect(procs.length).toBeGreaterThanOrEqual(1)
      expect(procs.every((p) => !p.name.toLowerCase().startsWith('system'))).toBe(true)
    })
  })

  // ── getRecentSessions ──

  describe('getRecentSessions', () => {
    it('returns empty array when no sessions file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      expect(detector.getRecentSessions()).toEqual([])
    })

    it('returns empty array when sessions file is corrupted', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json')
      expect(detector.getRecentSessions()).toEqual([])
    })
  })
})
