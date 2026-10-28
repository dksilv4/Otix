/**
 * Autonomous Game Matching & Optimal Release Selection Engine.
 *
 * Implements a high-precision scoring algorithm that filters indexer releases
 * by available node downloaders and selects the optimal full game installer
 * (and any sequential companion updates) based on quality, integrity, and health.
 */

import {
  compareVersions,
  isVersionLineage,
  parseReleaseTitle,
  type ParsedGameRelease,
} from './release-parse'
import {
  inferReleaseProtocol,
  releaseQueueBlockReason,
} from './provider-utils'
import { releaseDownloadUrl } from './usenet-utils'
import type { ServerProwlarrRelease } from './usenet-types'

export interface GameAutoMatchQuery {
  title: string
  year?: number | null
  platform?: string | null
  mediaItemId?: string | number | null
}

export interface DownloaderCapabilities {
  torrentConfigured: boolean
  usenetConfigured: boolean
}

export interface BestGameMatchResult {
  baseRelease: ServerProwlarrRelease
  baseParsed: ParsedGameRelease
  companionUpdates: ServerProwlarrRelease[]
  score: number
  reasons: string[]
}

const REPACKER_SCORES: Record<string, { score: number; label: string }> = {
  gog: { score: 100, label: 'DRM-free GOG release' },
  fitgirl: { score: 85, label: 'FitGirl Repack' },
  dodi: { score: 80, label: 'DODI Repack' },
  elamigos: { score: 80, label: 'ElAmigos Repack' },
  empress: { score: 70, label: 'EMPRESS release' },
  rune: { score: 65, label: 'RUNE Scene release' },
  flt: { score: 65, label: 'FLT Scene release' },
  codex: { score: 65, label: 'CODEX Scene release' },
  cpy: { score: 60, label: 'CPY Scene release' },
  skidrow: { score: 60, label: 'SKIDROW Scene release' },
  plaza: { score: 60, label: 'PLAZA Scene release' },
}

const PREMIUM_EDITIONS = new Set([
  'goty',
  'complete',
  'deluxe',
  'ultimate',
  'definitive',
  'enhanced',
  'anniversary',
  'royal',
  'legendary',
  'premium',
  'gold',
])

/**
 * Score a single game release candidate based on source trustworthiness, edition, health, and metadata matching.
 */
export function scoreGameRelease(
  release: ServerProwlarrRelease,
  query: GameAutoMatchQuery,
  capabilities: DownloaderCapabilities,
): { score: number; reasons: string[]; parsed: ParsedGameRelease } | null {
  const downloadUrl = releaseDownloadUrl(release)
  const protocol = inferReleaseProtocol(release)

  // 1. Filter out releases incompatible with active downloaders or without download URLs
  const blockedReason = releaseQueueBlockReason(
    { protocol, download_url: downloadUrl },
    { torrentConfigured: capabilities.torrentConfigured, usenetConfigured: capabilities.usenetConfigured },
  )
  if (blockedReason) return null

  // 2. Parse title and verify query compatibility
  const parsed = parseReleaseTitle(release.title, query.title)
  if (!parsed.matchedQuery) return null

  // 3. Must be a full base game (not an update-only patch or standalone DLC)
  if (parsed.kind !== 'game') return null

  // 4. Sanity check minimum file size: a PC game should be at least 150MB
  const sizeBytes = release.size || 0
  if (sizeBytes > 0 && sizeBytes < 150_000_000 && (!parsed.platformKey || parsed.platformKey === 'pc')) {
    return null
  }

  let score = 100
  const reasons: string[] = ['Query matched base game']

  // 5. Repacker & Scene Group Trust
  const repackerInfo = REPACKER_SCORES[parsed.repackerKey]
  if (repackerInfo) {
    score += repackerInfo.score
    reasons.push(repackerInfo.label)
  } else if (parsed.sceneGroup) {
    score += 40
    reasons.push(`Scene group ${parsed.sceneGroup}`)
  }

  // 6. Edition Value (Complete / GOTY / Deluxe)
  if (PREMIUM_EDITIONS.has(parsed.editionKey)) {
    score += 35
    reasons.push(`${parsed.editionLabel} bundle`)
  }

  // 7. Release Year Alignment
  if (query.year) {
    const yearStr = String(query.year)
    if (parsed.year === yearStr) {
      score += 30
      reasons.push(`Matches release year (${yearStr})`)
    } else if (parsed.year) {
      const yearDiff = Math.abs(Number.parseInt(parsed.year, 10) - query.year)
      if (yearDiff > 3) {
        // High penalty for year mismatch (e.g. original 2005 vs 2023 remake)
        score -= 50
        reasons.push(`Year mismatch (${parsed.year} vs ${yearStr})`)
      }
    }
  }

  // 8. Protocol & Health Scoring
  if (protocol === 'torrent') {
    const seeders = release.seeders ?? 0
    if (seeders >= 100) {
      score += 50
      reasons.push('Excellent torrent swarm (100+ seeders)')
    } else if (seeders >= 50) {
      score += 40
      reasons.push('Healthy torrent swarm (50+ seeders)')
    } else if (seeders >= 20) {
      score += 30
      reasons.push('Active torrent swarm (20+ seeders)')
    } else if (seeders >= 5) {
      score += 15
      reasons.push('Modest seeders (5+)')
    } else if (seeders >= 1) {
      score += 5
    } else {
      // 0 seeders is severely penalized
      score -= 100
      reasons.push('Zero active seeders')
    }
  } else if (protocol === 'usenet') {
    // Usenet direct line speed bonus
    score += 35
    reasons.push('Direct Usenet retention')
    if (release.age_days != null) {
      if (release.age_days < 100) {
        score += 15
        reasons.push('Recent Usenet upload')
      } else if (release.age_days > 2500) {
        score -= 20
        reasons.push('Old Usenet post (>2500d)')
      }
    }
  }

  // 9. Versioned release preference
  if (parsed.version) {
    score += 10
    reasons.push(`Versioned release (v${parsed.version})`)
  }

  return { score, reasons, parsed }
}

/**
 * Finds sequential official updates/patches compatible with the selected base game release.
 */
export function findCompanionUpdates(
  baseRelease: ServerProwlarrRelease,
  baseParsed: ParsedGameRelease,
  allReleases: ServerProwlarrRelease[],
  capabilities: DownloaderCapabilities,
): ServerProwlarrRelease[] {
  const eligibleUpdates: { release: ServerProwlarrRelease; parsed: ParsedGameRelease }[] = []

  for (const item of allReleases) {
    if (item.guid === baseRelease.guid) continue

    const downloadUrl = releaseDownloadUrl(item)
    const protocol = inferReleaseProtocol(item)
    if (
      releaseQueueBlockReason(
        { protocol, download_url: downloadUrl },
        { torrentConfigured: capabilities.torrentConfigured, usenetConfigured: capabilities.usenetConfigured },
      )
    ) {
      continue
    }

    const parsed = parseReleaseTitle(item.title, baseParsed.gameTitle)
    if (!parsed.matchedQuery || parsed.kind !== 'update') continue

    // Compatibility check: must match repacker or scene group
    const sameRepacker =
      parsed.repackerKey !== 'unknown' && parsed.repackerKey === baseParsed.repackerKey
    const sameGroup =
      Boolean(parsed.sceneGroup) &&
      Boolean(baseParsed.sceneGroup) &&
      parsed.sceneGroup?.toLowerCase() === baseParsed.sceneGroup?.toLowerCase()

    if (!sameRepacker && !sameGroup) continue

    // Check version lineage
    if (parsed.version && baseParsed.version) {
      const isDescendant =
        isVersionLineage(parsed.version, baseParsed.version) ||
        compareVersions(parsed.version, baseParsed.version) < 0
      if (!isDescendant) continue
    }

    eligibleUpdates.push({ release: item, parsed })
  }

  // Deduplicate and sort updates ascending by version so they queue in install order
  const seen = new Set<string>()
  const sorted = eligibleUpdates
    .filter((u) => {
      const key = u.parsed.version || u.release.guid
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => compareVersions(b.parsed.version, a.parsed.version)) // oldest first (ascending)
    .map((u) => u.release)

  return sorted
}

/**
 * Ranks all available releases and selects the best candidate for the requested game.
 */
export function findBestGameRelease(
  releases: ServerProwlarrRelease[],
  query: GameAutoMatchQuery,
  capabilities: DownloaderCapabilities,
): BestGameMatchResult | null {
  if (!releases || releases.length === 0 || !query.title?.trim()) {
    return null
  }

  const scoredCandidates: {
    release: ServerProwlarrRelease
    parsed: ParsedGameRelease
    score: number
    reasons: string[]
  }[] = []

  for (const rel of releases) {
    const res = scoreGameRelease(rel, query, capabilities)
    if (res && res.score > 0) {
      scoredCandidates.push({
        release: rel,
        parsed: res.parsed,
        score: res.score,
        reasons: res.reasons,
      })
    }
  }

  if (scoredCandidates.length === 0) {
    return null
  }

  // Sort descending by score; if tied, sort by size descending
  scoredCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (b.release.size || 0) - (a.release.size || 0)
  })

  const top = scoredCandidates[0]
  const companionUpdates = findCompanionUpdates(
    top.release,
    top.parsed,
    releases,
    capabilities,
  )

  return {
    baseRelease: top.release,
    baseParsed: top.parsed,
    companionUpdates,
    score: top.score,
    reasons: top.reasons,
  }
}
