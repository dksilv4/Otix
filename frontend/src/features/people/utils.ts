import type { PersonCredit, PersonDetail, EpisodeInfo } from './types'

// ── Date formatting ───────────────────────────────

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function isUpcoming(dateStr: string): boolean {
  return new Date(dateStr) > new Date()
}

export function formatCountdown(dateStr: string): string {
  const now = new Date()
  const target = new Date(dateStr)
  const diffMs = target.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return 'Releases today'
  if (diffDays === 1) return 'Releases tomorrow'
  if (diffDays < 7) return `In ${diffDays} days`
  if (diffDays < 14) return 'Next week'
  const diffWeeks = Math.round(diffDays / 7)
  if (diffWeeks < 8) return `In ${diffWeeks} weeks`
  const diffMonths = Math.round(diffDays / 30)
  if (diffMonths < 6) return `In ${diffMonths} months`
  return target.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateRange(start: string | null, end: string | null, isSeason: boolean): string | null {
  if (!start) return isSeason ? 'Announced' : null
  if (!isSeason) {
    return new Date(start).getFullYear().toString()
  }
  const monthDay = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (!end || start === end) return monthDay(start)
  return `${monthDay(start)} – ${monthDay(end)}`
}

export function formatRole(role: string): string {
  const labels: Record<string, string> = {
    cast: 'Actor',
    director: 'Director',
    producer: 'Producer',
    writer: 'Writer',
    composer: 'Composer',
    crew: 'Crew',
    voice: 'Voice',
  }
  return labels[role] || role
}

// ── Stats ─────────────────────────────────────────

export function getCreditsStats(credits: PersonDetail['credits']) {
  const safeCredits = Array.isArray(credits) ? credits : []
  const valid = safeCredits.filter((c) => c && c.mediaItem != null)
  const total = valid.length
  const years = valid
    .map((c) => c.mediaItem?.releaseDate)
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getFullYear())
    .filter((yr) => !isNaN(yr))
    .sort((a, b) => a - b)

  const yearsActive = years.length > 0
    ? `${years[0]} – ${years[years.length - 1]}`
    : null

  const byType: Record<string, number> = {}
  for (const c of valid) {
    const t = c.mediaItem!.mediaType || 'other'
    byType[t] = (byType[t] || 0) + 1
  }

  return { total, yearsActive, byType }
}

// ── Timeline grouping ─────────────────────────────

export interface GroupedCredit {
  mediaId: string
  mediaType: string
  title: string
  slug: string
  posterUrl: string | null
  releaseDate: string | null
  lastAirDate: string | null
  roles: { role: string; characterName?: string }[]
  seasonNumber?: number
  seasonName?: string | null
  episodes: EpisodeInfo[]
}

export interface TimelineGroup {
  year: string
  credits: GroupedCredit[]
}

export function expandCredits(credits: PersonCredit[]): GroupedCredit[] {
  const result: GroupedCredit[] = []
  const safeCredits = Array.isArray(credits) ? credits : []

  for (const c of safeCredits) {
    if (!c || !c.mediaItem) continue
    const seasons = Array.isArray(c.mediaItem.seasons) ? c.mediaItem.seasons : []
    if (c.mediaItem.mediaType === 'show' && seasons.length > 0) {
      for (const season of seasons) {
        const episodes = Array.isArray(season?.episodes) ? season.episodes : []
        const byYear = new Map<number, EpisodeInfo[]>()
        for (const ep of episodes) {
          if (!ep.airDate) continue
          const y = new Date(ep.airDate).getFullYear()
          const existing = byYear.get(y)
          if (existing) {
            existing.push(ep)
          } else {
            byYear.set(y, [{ episodeNumber: ep.episodeNumber, name: ep.name, airDate: ep.airDate }])
          }
        }

        if (byYear.size === 0) {
          result.push({
            mediaId: c.mediaItem.id,
            mediaType: c.mediaItem.mediaType,
            title: c.mediaItem.title,
            slug: c.mediaItem.slug,
            posterUrl: c.mediaItem.posterUrl,
            releaseDate: season.firstAirDate ?? null,
            lastAirDate: null,
            roles: [{ role: c.role, characterName: c.characterName }],
            seasonNumber: season.seasonNumber,
            seasonName: season.name,
            episodes: [],
          })
          continue
        }

        const sortedYears = [...byYear.keys()].sort()
        for (const year of sortedYears) {
          const yearEps = byYear.get(year)!
          const airDates = yearEps.map((e) => e.airDate!).filter(Boolean).sort()
          result.push({
            mediaId: c.mediaItem.id,
            mediaType: c.mediaItem.mediaType,
            title: c.mediaItem.title,
            slug: c.mediaItem.slug,
            posterUrl: c.mediaItem.posterUrl,
            releaseDate: airDates[0],
            lastAirDate: airDates[airDates.length - 1],
            roles: [{ role: c.role, characterName: c.characterName }],
            seasonNumber: season.seasonNumber,
            seasonName: season.name,
            episodes: yearEps,
          })
        }
      }
    } else {
      result.push({
        mediaId: c.mediaItem.id,
        mediaType: c.mediaItem.mediaType,
        title: c.mediaItem.title,
        slug: c.mediaItem.slug,
        posterUrl: c.mediaItem.posterUrl,
        releaseDate: c.mediaItem.releaseDate,
        lastAirDate: null,
        roles: [{ role: c.role, characterName: c.characterName }],
        episodes: [],
      })
    }
  }

  return result
}

export function groupCredits(credits: PersonCredit[]): TimelineGroup[] {
  const expanded = expandCredits(credits)

  const byMediaSeasonYear = new Map<string, GroupedCredit>()
  for (const c of expanded) {
    const key = c.seasonNumber != null
      ? `${c.mediaId}-S${c.seasonNumber}-${c.releaseDate ? new Date(c.releaseDate).getFullYear() : '?'}`
      : c.mediaId
    const existing = byMediaSeasonYear.get(key)
    if (existing) {
      for (const r of c.roles) {
        if (!existing.roles.some((er) => er.role === r.role && er.characterName === r.characterName)) {
          existing.roles.push(r)
        }
      }
    } else {
      byMediaSeasonYear.set(key, { ...c })
    }
  }

  const byYear = new Map<string, GroupedCredit[]>()
  for (const credit of byMediaSeasonYear.values()) {
    let year: string
    if (!credit.releaseDate) {
      year = 'Announced'
    } else if (isUpcoming(credit.releaseDate)) {
      year = 'Upcoming'
    } else {
      year = new Date(credit.releaseDate).getFullYear().toString()
    }
    const existing = byYear.get(year)
    if (existing) {
      existing.push(credit)
    } else {
      byYear.set(year, [credit])
    }
  }

  const years = [...byYear.keys()].sort((a, b) => {
    if (a === 'Upcoming') return -1
    if (b === 'Upcoming') return 1
    if (a === 'Announced') return -1
    if (b === 'Announced') return 1
    return parseInt(b) - parseInt(a)
  })

  return years.map((year) => {
    const credits = byYear.get(year)!
    credits.sort((a, b) => {
      const da = a.releaseDate ? new Date(a.releaseDate).getTime() : 0
      const db = b.releaseDate ? new Date(b.releaseDate).getTime() : 0
      if (db !== da) return db - da
      return a.title.localeCompare(b.title)
    })
    return { year, credits }
  })
}
