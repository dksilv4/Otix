import { apiClient } from '@/lib/api/client'

export interface MatchableGame {
  id: string
  title: string
  developer?: string
  developerId?: string | null
  publisher?: string
  releaseYear?: number | null
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
  savePaths?: string[] | null
  sources?: Record<string, unknown>[]
  developerExternalIds?: { source: string; id: string; entity_type: string; name: string }[]
}

// ── API response types (camelCase — axios interceptor converts snake_case) ──

interface MatchCandidateCamel {
  mediaItemId: string | null
  title: string
  posterUrl: string | null
  backdropUrl: string | null
  releaseYear: number | null
  platforms: string[] | null
  developer: string | null
  confidence: number
  matchType: string
  needsImport: boolean
  providerId: string | null
  provider: string | null
}

interface MatchResponse {
  queryId: string
  queryTitle: string
  candidates: MatchCandidateCamel[]
  autoMatch: MatchCandidateCamel | null
}

export interface BatchMatchOutcome {
  matched: number
  suggested: number
  total: number
  games: MatchableGame[]
  matches: MatchResponse[]
}

// ── Batch match + save ────────────────────────────────────────────────────

export async function batchMatchAndSave(
  games: MatchableGame[],
  desktopAPI?: any,
  apiBaseUrl?: string,
): Promise<BatchMatchOutcome> {
  if (!games.length) {
    return { matched: 0, suggested: 0, total: 0, games: [], matches: [] }
  }

  const batchGames = games.map((g) => ({
    query_id: (g.platform || 'unknown') + ':' + (g.appName || g.catalogItemId || g.id),
    title: g.title,
    developer: g.developer || null,
    publisher: g.publisher || null,
    release_year: g.releaseYear || null,
    poster_url: g.posterUrl || null,
    external_ids: g.sources?.length
      ? g.sources.map((s: any) => ({ source: s.source || g.platform || 'unknown', id: s.id || s.appName || s.catalogItemId || g.id }))
      : [{ source: g.platform || 'unknown', id: g.appName || g.catalogItemId || g.id }],
    media_type: 'game',
  }))

  let matches: MatchResponse[] = []

  try {
    const { data } = await apiClient.post<{ matches: any[] }>(
      '/media/match/batch',
      { games: batchGames },
      { timeout: 120000 },
    )
    // axios converts snake_case → camelCase. Map to our types.
    matches = (data.matches || []).map((m: any) => ({
      queryId: m.queryId || m.query_id || '',
      queryTitle: m.queryTitle || m.query_title || '',
      candidates: (m.candidates || []).map((c: any) => ({
        mediaItemId: c.mediaItemId || c.media_item_id || null,
        title: c.title,
        posterUrl: c.posterUrl || c.poster_url || null,
        backdropUrl: c.backdropUrl || c.backdrop_url || null,
        releaseYear: c.releaseYear || c.release_year || null,
        platforms: c.platforms || null,
        developer: c.developer || null,
        confidence: c.confidence,
        matchType: c.matchType || c.match_type || 'unknown',
        needsImport: c.needsImport || c.needs_import || false,
        providerId: c.providerId || c.provider_id || null,
        provider: c.provider || null,
      })),
      autoMatch: m.autoMatch || m.auto_match ? {
        mediaItemId: (m.autoMatch || m.auto_match).mediaItemId || (m.autoMatch || m.auto_match).media_item_id || null,
        title: (m.autoMatch || m.auto_match).title,
        posterUrl: (m.autoMatch || m.auto_match).posterUrl || (m.autoMatch || m.auto_match).poster_url || null,
        backdropUrl: (m.autoMatch || m.auto_match).backdropUrl || (m.autoMatch || m.auto_match).backdrop_url || null,
        releaseYear: (m.autoMatch || m.auto_match).releaseYear || (m.autoMatch || m.auto_match).release_year || null,
        platforms: (m.autoMatch || m.auto_match).platforms || null,
        developer: (m.autoMatch || m.auto_match).developer || null,
        confidence: (m.autoMatch || m.auto_match).confidence,
        matchType: (m.autoMatch || m.auto_match).matchType || (m.autoMatch || m.auto_match).match_type || 'unknown',
        needsImport: (m.autoMatch || m.auto_match).needsImport || (m.autoMatch || m.auto_match).needs_import || false,
        providerId: (m.autoMatch || m.auto_match).providerId || (m.autoMatch || m.auto_match).provider_id || null,
        provider: (m.autoMatch || m.auto_match).provider || null,
      } : null,
    }))
    console.log(`[matching] ${games.length} games sent, ${matches.length} responses, ${matches.filter(m => m.autoMatch).length} auto-matched, ${matches.filter(m => m.candidates.length > 0 && !m.autoMatch).length} candidates`)
  } catch (err) {
    console.error('[matching] batch match request failed:', err)
  }

  // Save to scanned games DB
  if (desktopAPI?.saveScannedGames) {
    try {
      const toSave = games.map((g) => ({
        id: g.id, title: g.title,
        exePath: g.exePath || g.installDir || '',
        installDir: g.installDir || '',
        platform: g.platform as any,
        posterUrl: g.posterUrl || undefined,
        iconUrl: g.logoUrl || undefined,
        sources: g.sources || [{ source: g.platform, appName: g.appName, namespace: g.namespace, catalogItemId: g.catalogItemId, developer: g.developer, developerId: g.developerId, contentType: g.contentType, platforms: g.platforms, savePaths: g.savePaths }],
      }))
      await desktopAPI.saveScannedGames(toSave)
    } catch (err) {
      console.error('[matching] saveScannedGames failed:', err)
    }
  }

  let matched = 0
  let suggested = 0
  if (desktopAPI?.acceptSuggestion) {
    for (let i = 0; i < Math.min(games.length, matches.length); i++) {
      const m = matches[i]
      if (!m) continue
      const queryId = (games[i].platform || 'unknown') + ':' + (games[i].appName || games[i].catalogItemId || games[i].id)

      // Auto-match (backend already creates approved proposal)
      let best = m.autoMatch?.mediaItemId && !m.autoMatch.needsImport ? m.autoMatch : null

      if (best) {
        try {
          await desktopAPI.acceptSuggestion(games[i].id, {
            id: best.mediaItemId, title: best.title, slug: best.mediaItemId,
            posterUrl: best.posterUrl || null, developer: best.developer || null,
            platforms: best.platforms || [], confidence: best.confidence,
          } as any)
          matched++
        } catch (err) {
          console.error('[matching] persist failed for', games[i].id, err)
        }
      }

      // Candidates — save as suggestions for user review
      else if (m.candidates.length > 0) {
        suggested++
        const best = m.candidates[0]
        if (best.mediaItemId && !best.needsImport) {
          try {
            await desktopAPI.acceptSuggestion(games[i].id, {
              id: best.mediaItemId, title: best.title, slug: best.mediaItemId,
              posterUrl: best.posterUrl || null, developer: best.developer || null,
              platforms: best.platforms || [], confidence: best.confidence,
              _candidates: m.candidates,
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

export async function confirmMatch(
  queryId: string,
  mediaItemId: string | null,
  igdbId: number | null,
): Promise<{ success: boolean; media_item_id?: string; error?: string }> {
  try {
    const { data } = await apiClient.post('/media/match/confirm', {
      query_id: queryId, media_item_id: mediaItemId,
      igdb_id: igdbId, rejected: false, rejected_permanently: false,
    }, { timeout: 30000 })
    return data
  } catch (err) {
    console.error('[matching] confirmMatch failed:', err)
    return { success: false, error: String(err) }
  }
}

export async function rejectMatch(
  queryId: string, permanent: boolean = false,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data } = await apiClient.post('/media/match/confirm', {
      query_id: queryId, rejected: !permanent, rejected_permanently: permanent,
    })
    return data
  } catch (err) {
    console.error('[matching] rejectMatch failed:', err)
    return { success: false, error: String(err) }
  }
}

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
