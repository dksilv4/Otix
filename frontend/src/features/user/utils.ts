import { XP_PER_LEVEL, LEVEL_TIERS, LEVEL_TITLES, GRADIENTS } from './constants'
import type { UserGamification, LevelTier } from './types'

export function computeGamification(totalXp: number): UserGamification {
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1
  const xpFloor = (level - 1) * XP_PER_LEVEL
  const xpCeil = level * XP_PER_LEVEL

  let levelTitle = 'Novice'
  for (const t of LEVEL_TITLES) {
    if (level >= t.min && level <= t.max) {
      levelTitle = t.title
      break
    }
  }

  return {
    level,
    xp: totalXp,
    xpToNextLevel: xpCeil - xpFloor,
    xpProgress: Math.min(1, (totalXp - xpFloor) / (xpCeil - xpFloor)),
    levelTitle,
  }
}

export function getLevelTier(level: number): LevelTier {
  for (const entry of LEVEL_TIERS) {
    if (level >= entry.min) return entry.tier
  }
  return LEVEL_TIERS[LEVEL_TIERS.length - 1].tier
}

export function pickGradient(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }
  const [a, b, c] = GRADIENTS[Math.abs(hash) % GRADIENTS.length]
  return `linear-gradient(160deg, ${a} 0%, ${b} 50%, ${c} 100%)`
}

export function formatMemberSince(dateStr: string): { label: string; tooltip: string } {
  const joined = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - joined.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)

  const exact = joined.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  if (years < 1) {
    if (months < 1) return { label: 'this month', tooltip: exact }
    return { label: `${months}mo ago`, tooltip: exact }
  }
  if (years === 1 && months === 0) return { label: '1yr ago', tooltip: exact }
  if (years === 1) return { label: `1yr ${months}mo ago`, tooltip: exact }
  return { label: `${years}yr ago`, tooltip: exact }
}
