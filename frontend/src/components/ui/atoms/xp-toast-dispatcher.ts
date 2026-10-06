import { getLevelTitle } from '@user/utils'

export interface XPToast {
  id: number
  amount: number
  isLevelUp?: boolean
  level?: number
  levelTitle?: string
}

export interface LevelUpEvent {
  level: number
  title: string
}

let toastId = 0
export const xpListeners: Set<(toasts: XPToast[]) => void> = new Set()
export const levelUpListeners: Set<(event: LevelUpEvent) => void> = new Set()
export const xpGainListeners: Set<(amount: number) => void> = new Set()

export function addXPToast(
  amount: number,
  options?: { isLevelUp?: boolean; level?: number; levelTitle?: string },
) {
  const id = ++toastId
  const toast: XPToast = {
    id,
    amount,
    isLevelUp: options?.isLevelUp,
    level: options?.level,
    levelTitle: options?.levelTitle,
  }
  for (const fn of xpListeners) {
    fn([toast])
  }
  if (!options?.isLevelUp && amount > 0) {
    for (const fn of xpGainListeners) {
      fn(amount)
    }
  }
  return id
}

export function showLevelUpToast(level: number, title?: string) {
  const levelTitle = title ?? getLevelTitle(level)
  const event: LevelUpEvent = { level, title: levelTitle }

  for (const fn of levelUpListeners) {
    fn(event)
  }

  addXPToast(0, {
    isLevelUp: true,
    level,
    levelTitle,
  })
}

export function showXPToast(amount: number, currentTotalXp?: number) {
  addXPToast(amount)

  if (currentTotalXp !== undefined && currentTotalXp >= 0) {
    const oldLevel = Math.floor(currentTotalXp / 300) + 1
    const newLevel = Math.floor((currentTotalXp + amount) / 300) + 1
    if (newLevel > oldLevel) {
      showLevelUpToast(newLevel, getLevelTitle(newLevel))
    }
  }
}
