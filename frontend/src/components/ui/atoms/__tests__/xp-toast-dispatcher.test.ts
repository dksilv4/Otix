import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  showXPToast,
  showLevelUpToast,
  addXPToast,
  xpListeners,
  levelUpListeners,
  xpGainListeners,
  type XPToast,
  type LevelUpEvent,
} from '../xp-toast-dispatcher'

describe('xp-toast-dispatcher', () => {
  beforeEach(() => {
    xpListeners.clear()
    levelUpListeners.clear()
    xpGainListeners.clear()
  })

  it('dispatches XPToast to xpListeners', () => {
    const listener = vi.fn()
    xpListeners.add(listener)

    showXPToast(30)

    expect(listener).toHaveBeenCalledTimes(1)
    const toasts: XPToast[] = listener.mock.calls[0][0]
    expect(toasts[0].amount).toBe(30)
    expect(toasts[0].isLevelUp).toBeFalsy()
  })

  it('dispatches to xpGainListeners for positive amounts', () => {
    const gainListener = vi.fn()
    xpGainListeners.add(gainListener)

    showXPToast(50)

    expect(gainListener).toHaveBeenCalledWith(50)
  })

  it('addXPToast returns toast id', () => {
    const id = addXPToast(20)
    expect(id).toBeGreaterThan(0)
  })

  it('showLevelUpToast notifies listeners with title', () => {
    const levelListener = vi.fn()
    levelUpListeners.add(levelListener)

    showLevelUpToast(10, 'Adept')

    expect(levelListener).toHaveBeenCalledWith({ level: 10, title: 'Adept' })
  })

  it('detects level up when threshold is crossed', () => {
    const levelListener = vi.fn()
    levelUpListeners.add(levelListener)

    // User is at 280 XP (Level 1), gains 30 XP -> 310 XP (Level 2)
    showXPToast(30, 280)

    expect(levelListener).toHaveBeenCalledTimes(1)
    const event: LevelUpEvent = levelListener.mock.calls[0][0]
    expect(event.level).toBe(2)
    expect(event.title).toBe('Novice')
  })

  it('does not trigger level up when within same level', () => {
    const levelListener = vi.fn()
    levelUpListeners.add(levelListener)

    // User is at 100 XP (Level 1), gains 30 XP -> 130 XP (Level 1)
    showXPToast(30, 100)

    expect(levelListener).not.toHaveBeenCalled()
  })

  it('triggers higher tier titles on level up', () => {
    const levelListener = vi.fn()
    levelUpListeners.add(levelListener)

    // User at 1190 XP (Level 4 Novice), gains 30 XP -> 1220 XP (Level 5 Apprentice)
    showXPToast(30, 1190)

    expect(levelListener).toHaveBeenCalledTimes(1)
    const event: LevelUpEvent = levelListener.mock.calls[0][0]
    expect(event.level).toBe(5)
    expect(event.title).toBe('Apprentice')
  })
})
