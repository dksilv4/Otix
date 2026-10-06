import { XP_PER_LEVEL, LEVEL_TIERS, LEVEL_TITLES, GRADIENTS } from './constants'
import type { UserGamification, LevelTier } from './types'

export function getLevelTitle(level: number): string {
  for (const t of LEVEL_TITLES) {
    if (level >= t.min && level <= t.max) {
      return t.title
    }
  }
  return 'Novice'
}

export function computeGamification(totalXp: number): UserGamification {
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1
  const xpFloor = (level - 1) * XP_PER_LEVEL
  const xpCeil = level * XP_PER_LEVEL
  const levelTitle = getLevelTitle(level)

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

export const relativeDate = (ts: number): string => {
  if (!ts) return 'Recently'
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const fullDateTime = (ts: number): string => {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const humanPlaytime = (seconds: number): string => {
  if (seconds <= 0) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

