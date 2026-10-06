import { cleanGameTitle } from '@/features/launcher/hooks/use-matched-running-game'
import type { NormalizedPlaySession } from '@/features/user/hooks/use-user-game-sessions'
import type { MediaItemDetail } from '@/features/media/queries/media-queries'

export const formatPlaytimeHours = (totalSeconds: number): string => {
  if (totalSeconds <= 0) return '0m'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h`
  return `${minutes}m`
}

export const formatSessionRelative = (ts: number): string => {
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
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const isMatchingSession = (session: NormalizedPlaySession, detail: MediaItemDetail): boolean => {
  if (!session || !detail) return false

  const detailId = String(detail.id || '')
  const detailSlug = (detail.slug || '').toLowerCase().trim()
  const detailTitle = (detail.title || '').toLowerCase().trim()
  const detailSteamId = detail.game?.steamAppId ? String(detail.game.steamAppId) : null

  const sessGid = String(session.gameId || '').trim()
  const sessTitle = cleanGameTitle(session.gameTitle || '', session.processName).toLowerCase().trim()

  // 1. Direct ID / Slug match
  if (sessGid && (sessGid === detailId || sessGid.toLowerCase() === detailSlug)) {
    return true
  }

  // 2. Steam App ID match
  if (detailSteamId) {
    if (sessGid === detailSteamId || sessGid === `steam_${detailSteamId}`) {
      return true
    }
  }

  // 3. Exact cleaned title match
  if (sessTitle && (sessTitle === detailTitle || sessTitle.includes(detailTitle) || detailTitle.includes(sessTitle))) {
    return true
  }

  // 4. Normalized alphanumeric match
  const alphaSess = sessTitle.replace(/[^a-z0-9]/g, '')
  const alphaDetail = detailTitle.replace(/[^a-z0-9]/g, '')
  if (alphaSess && alphaDetail) {
    if (alphaSess === alphaDetail || alphaDetail.includes(alphaSess) || alphaSess.includes(alphaDetail)) {
      return true
    }
  }

  // 5. Direct raw game title match
  const rawSess = (session.gameTitle || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '')
  if (rawSess && alphaDetail && (rawSess === alphaDetail || alphaDetail.includes(rawSess))) {
    return true
  }

  return false
}
