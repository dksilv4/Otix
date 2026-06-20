/**
 * Shared matching utility for plugin-scanned games.
 *
 * Takes scanned games from any platform plugin, batch-matches them
 * against Otix media items via /media/match/batch, and persists the
 * results to the desktop scanned-games database.
 *
 * Updated for new candidate-based matching (multi-candidate per game,
 * auto-match vs suggestions, confirm endpoint).
 *
 * Single source of truth — used by PluginSlot and any future plugin UI.
 */

import { apiClient } from '@/lib/api/client'

// ── Types ────────────────────────────────────────────────────────────────

export interface MatchableGame {
  id: string
  title: string
  developer?: string
  developerId?: string | null        // Epic account ID of developer/company
  appName?: string
  namespace?: string
  catalogItemId?: string
  exePath?: string | null
  installDir?: string | null
  platform: string
  posterUrl?: string | null
  logoUrl?: string | null
  contentType?: string
  platforms?: string[]
  savePaths?: string[] | null       // detected save game directories
  sources?: Record<string, unknown>[]
  developerExternalIds?: { source: string; id: string; entity_type: string; name: string }[]
}

export interface MatchCandidate {
  media_item_id: string | null
  title: string
  poster_url: string | null
  backdrop_url: string | null
  release_year: number | null
  platforms: string[] | null
  developer: string | null
  confidence: number
  match_type: string  // "direct" | "exact_title" | "ilike" | "trigram" | "igdb_crossref" | "igdb_search" | "igdb_fuzzy" | "none"
  needs_import: boolean
  provider_id: string | null
  provider: string | null
}

export interface GameMatchResponse {
  query_id: string
  query_title: string
  candidates: MatchCandidate[]
  auto_match: MatchCandidate | null
  // Plugin-injected fields (not from backend)
  _epic_poster_url?: string | null
  _epic_logo_url?: string | null
}

export interface BatchMatchOutcome {
  matched: number
  suggested: number
  total: number
  games: MatchableGame[]
  matches: GameMatchResponse[]
}

// ── Batch match + save ────────────────────────────────────────────────────

/**
 * Run the full match pipeline for a set of scanned games.
 *
 * 1. POSTs games to /media/match/batch (new candidate-based format)
 * 2. Saves all games to scanned-games DB
 * 3. For auto-matched games (high confidence), calls /media/match/confirm
 * 4. For suggested games (candidates but no auto_match), leaves for user pick
 *
 * @returns summary with matched/suggested counts and match data
 */
export async function batchMatchAndSave(
  games: MatchableGame[],
  desktopAPI?: any,
  apiBaseUrl?: string,
): Promise<BatchMatchOutcome> {
  if (!games.length) {
    return { matched: 0, suggested: 0, total: 0, games: [], matches: [] }
  }

  // Build batch match request with query_id for correlation
  const batchGames = games.map((g) => ({
    query_id: (g.platform || 'unknown') + ':' + (g.appName || g.catalogItemId || g.id),
    title: g.title,
    developer: g.developer || null,
    external_ids: [
      {
        source: g.platform || 'unknown',
        id: g.appName || g.catalogItemId || g.id,
      },
    ],
    media_type: 'game',
  }))

  let matches: GameMatchResponse[] = []

  try {
    const { data } = await apiClient.post<{ matches: GameMatchResponse[] }>(
      '/media/match/batch',
      { games: batchGames },
    )
    matches = data.matches || []
  } catch (err) {
    console.error('[matching] batch match request failed:', err)
  }

  // Save to scanned games DB
  if (desktopAPI?.saveScannedGames) {
    try {
      const toSave = games.map((g, i) => ({
        id: g.id,
        title: g.title,
        exePath: g.exePath || g.installDir || '',
        installDir: g.installDir || '',
        platform: g.platform as any,
        posterUrl: g.posterUrl || undefined,
        iconUrl: g.logoUrl || undefined,
        savePaths: g.savePaths || undefined,
        sources: g.sources || [
          {
            source: g.platform,
            appName: g.appName,
            namespace: g.namespace,
            catalogItemId: g.catalogItemId,
            developer: g.developer,
            developerId: g.developerId,
            contentType: g.contentType,
            platforms: g.platforms,
            savePaths: g.savePaths,
          },
        ],
      }))
      await desktopAPI.saveScannedGames(toSave)
    } catch (err) {
      console.error('[matching] saveScannedGames failed:', err)
    }
  }

  // Auto-accept suggestions for auto-matched games
  let matched = 0
  let suggested = 0
  if (desktopAPI?.acceptSuggestion) {
    for (let i = 0; i < Math.min(games.length, matches.length); i++) {
      const match = matches[i]
      if (!match) continue

      // If auto_match is set by the backend, accept it automatically
      if (match.auto_match && match.auto_match.media_item_id && !match.auto_match.needs_import) {
        try {
          await desktopAPI.acceptSuggestion(games[i].id, {
            id: match.auto_match.media_item_id,
            title: match.auto_match.title,
            slug: match.auto_match.media_item_id,
            mediaType: 'game',
            posterUrl: match.auto_match.poster_url || null,
            developer: match.auto_match.developer || null,
            platforms: match.auto_match.platforms || [],
            confidence: match.auto_match.confidence,
          } as any)
          matched++
        } catch (err) {
          console.error('[matching] acceptSuggestion (auto) failed for', games[i].id, err)
        }
      } else if (match.candidates.length > 0) {
        // Store candidates as suggestions for user review
        suggested++
        const best = match.candidates[0]
        if (best.media_item_id && !best.needs_import) {
          try {
            await desktopAPI.acceptSuggestion(games[i].id, {
              id: best.media_item_id,
              title: best.title,
              slug: best.media_item_id,
              mediaType: 'game',
              posterUrl: best.poster_url || match._epic_poster_url || null,
              developer: best.developer || null,
              platforms: best.platforms || [],
              confidence: best.confidence,
              _candidates: match.candidates,  // store all candidates for UI
              _epic_poster_url: match._epic_poster_url,
            } as any)
          } catch (err) {
            console.error('[matching] acceptSuggestion (candidate) failed for', games[i].id, err)
          }
        }
      }
    }
  }

  return { matched, suggested, total: games.length, games, matches }
}

// ── Confirm / Reject ──────────────────────────────────────────────────────

/**
 * Confirm a match candidate selected by the user.
 *
 * Calls POST /media/match/confirm to persist the external_id mapping
 * and optionally import the IGDB game.
 */
export async function confirmMatch(
  queryId: string,
  mediaItemId: string | null,
  igdbId: number | null,
): Promise<{ success: boolean; media_item_id?: string; error?: string }> {
  try {
    const { data } = await apiClient.post('/media/match/confirm', {
      query_id: queryId,
      media_item_id: mediaItemId,
      igdb_id: igdbId,
      rejected: false,
      rejected_permanently: false,
    })
    return data
  } catch (err) {
    console.error('[matching] confirmMatch failed:', err)
    return { success: false, error: String(err) }
  }
}

/**
 * Permanently reject all candidates for a game.
 *
 * Calls POST /media/match/confirm with rejected_permanently=true
 * so the game won't be re-suggested on the next scan.
 */
export async function rejectMatch(
  queryId: string,
  permanent: boolean = false,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data } = await apiClient.post('/media/match/confirm', {
      query_id: queryId,
      rejected: !permanent,
      rejected_permanently: permanent,
    })
    return data
  } catch (err) {
    console.error('[matching] rejectMatch failed:', err)
    return { success: false, error: String(err) }
  }
}

/**
 * Remove an existing external_id mapping so a game can be re-matched.
 */
export async function unlinkMatch(
  queryId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data } = await apiClient.post('/media/match/unlink', null, {
      params: { query_id: queryId },
    })
    return data
  } catch (err) {
    console.error('[matching] unlinkMatch failed:', err)
    return { success: false, error: String(err) }
  }
}
