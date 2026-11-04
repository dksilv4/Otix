import type { GameAchievement } from '../types'

export type AchievementFilterType = 'all' | 'unlocked' | 'locked' | 'rare'

export function formatUnlockDate(timestamp?: number | null): string {
  if (!timestamp) return ''
  try {
    const d = new Date(timestamp * 1000)
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export function formatRarityPercentage(rarity?: number | null): string {
  if (rarity === null || rarity === undefined) return ''
  return `${rarity.toFixed(1)}%`
}

export function isRareAchievement(rarity?: number | null): boolean {
  if (rarity === null || rarity === undefined) return false
  return rarity <= 10.0
}

export function filterAchievements(
  achievements: GameAchievement[],
  filter: AchievementFilterType,
  query: string
): GameAchievement[] {
  const normalizedQuery = query.trim().toLowerCase()

  return achievements.filter((ach) => {
    // 1. Status Filter
    if (filter === 'unlocked' && !ach.unlocked) return false
    if (filter === 'locked' && ach.unlocked) return false
    if (filter === 'rare' && !isRareAchievement(ach.rarityPercentage)) return false

    // 2. Query Search
    if (normalizedQuery) {
      const matchTitle = ach.displayName.toLowerCase().includes(normalizedQuery)
      const matchDesc = (ach.description || '').toLowerCase().includes(normalizedQuery)
      if (!matchTitle && !matchDesc) return false
    }

    return true
  })
}
