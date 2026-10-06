import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getGamingSessionState,
  setGamingSessionState,
  resetGamingSessionState,
  subscribeGamingSessionState,
} from '../utils/gaming-xp-store'

describe('gaming-xp-store', () => {
  beforeEach(() => {
    resetGamingSessionState()
  })

  it('initializes with default zeroed state', () => {
    const state = getGamingSessionState()
    expect(state.sessionXp).toBe(0)
    expect(state.isGaming).toBe(false)
    expect(state.currentGameId).toBeNull()
  })

  it('updates state and notifies subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeGamingSessionState(listener)

    setGamingSessionState({
      sessionXp: 20,
      dailyXp: 50,
      isGaming: true,
      currentGameId: 'game-1',
      currentGameTitle: 'Elden Ring',
    })

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionXp: 20,
        dailyXp: 50,
        isGaming: true,
        currentGameId: 'game-1',
        currentGameTitle: 'Elden Ring',
      }),
    )

    const updated = getGamingSessionState()
    expect(updated.sessionXp).toBe(20)
    expect(updated.dailyXp).toBe(50)

    unsubscribe()
  })

  it('resets session state accurately', () => {
    setGamingSessionState({
      sessionXp: 30,
      isGaming: true,
      currentGameId: 'bg3',
    })

    resetGamingSessionState()

    const state = getGamingSessionState()
    expect(state.sessionXp).toBe(0)
    expect(state.isGaming).toBe(false)
    expect(state.currentGameId).toBeNull()
  })
})
