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
  isDlc?: boolean
  dlcOf?: string | null
  isBeta?: boolean
  betaOf?: string | null
  isDemo?: boolean
  demoOf?: string | null
  isApp?: boolean
  gameType?: string
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

// Curated query overrides for titles where Epic's name can't be recovered by
// general cleaning because IGDB uses different naming (roman numerals, a colon,
// expanded numerals).
const TITLE_ALIASES: Record<string, string> = {
  'Shenmue 3': 'Shenmue III',
  'G.I. Joe Wrath of Cobra': 'G.I. Joe: Wrath of Cobra',
  'Warhammer 40K Speed Freeks': 'Warhammer 40,000: Speed Freeks',
}

// Clean the match query so the backend searches the base title. Epic titles
// carry trademark symbols and edition/re-release markers that the backend's
// strict search rejects outright ("Batman™ Arkham Asylum Game of the Year
// Edition" → zero candidates), while the cleaned base title auto-matches.
function matchQueryTitle(g: MatchableGame): string {
  const title = g.title || ''
  if (TITLE_ALIASES[title]) return TITLE_ALIASES[title]
  let t = title
  // Beta/test builds ship with build markers: "33 Immortals Beta",
  // "Chivalry 2 - Public Testing". Strip them so betas match the base game.
  if (g.isBeta) {
    // Parenthetical markers: " (Test branch)", " (Beta)", " [Open Beta]"
    t = t.replace(/[([][^)\]]*(?:beta|test|playtest|pre[- ]?alpha|ptr)[^)\]]*[\])]/gi, '').trim()
    // Separator + marker + optional trailing words: " - Public Testing", " | Open Pre-Alpha Playtest 4"
    t = t.replace(/\s*[-–—|]\s*(?:open pre[- ]?alpha|open beta|closed beta|tech beta|tech test|public testing|public test|test branch|pre[- ]?alpha|playtest|beta|test|ptr)\b.*$/i, '').trim()
    // Bare trailing marker: "Mortal Shell Tech Beta", "33 Immortals Beta"
    t = t.replace(/\s+(?:open pre[- ]?alpha|open beta|closed beta|tech beta|tech test|pre[- ]?alpha|playtest|beta|test)\b\s*$/i, '').trim()
    // Concatenated suffix: "KillingFloor2Beta" → "KillingFloor2"
    t = t.replace(/(?:beta|test)$/i, '').trim()
    // Re-spacing a run-in suffix: "KillingFloor2" → "Killing Floor 2"
    t = t.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-z])(\d)/gi, '$1 $2')
  }
  // Trademark/registered/copyright symbols and curly quotes
  t = t.replace(/[™®©×]/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  // Edition/re-release markers: "Game of the Year Edition", "The Complete
  // Edition", " - Definitive Edition Pack". Only stripped when the marker
  // phrase is present — real subtitles ("Deus Ex - Mankind Divided") are kept.
  const ed = '(?:(?:Game of the Year|GOTY|Complete|Enhanced|Deluxe|Definitive|Ultimate|Collector\\\'?s|Anniversary|Special|Standard|Gold|Celebration|Day One|Digital Deluxe|Remastered)(?:\\s+Edition)(?:\\s+Pack)?)'
  t = t.replace(new RegExp('\\s*(?:[-–—:]\\s*)?(?:The\\s+)?' + ed + '\\s*$', 'i'), '')
  t = t.replace(/\s*(?:[-–—:]\s*)?(?:The Final Cut|Legacy Mode|Re-Elected|Afterlife|Starter Access)\s*$/i, '')
  // Epic uses " - " where IGDB uses ":" for subtitles ("Brothers - A Tale of
  // Two Sons" → "Brothers: A Tale of Two Sons")
  t = t.replace(/\s+[-–—]\s+/g, ': ')
  // Epic writes "X : Y" with spaces around the colon; IGDB writes "X: Y"
  t = t.replace(/\s+:\s+/g, ': ')
  // Trailing parenthetical subtitle: "Never Alone (Kisima Ingitchuna)" → "Never Alone"
  t = t.replace(/\s*\([^)]*\)\s*$/, '').trim()
  return t.replace(/\s+/g, ' ').trim() || title
}

// ── Batch match + save ────────────────────────────────────────────────────

export async function batchMatchAndSave(
  games: MatchableGame[],
  desktopAPI?: any,
  _apiBaseUrl?: string,
): Promise<BatchMatchOutcome> {
  if (!games.length) {
    return { matched: 0, suggested: 0, total: 0, games: [], matches: [] }
  }

  // Applications (non-game software) are stored but never sent to the match API
  const matchGames = games.filter((g) => !g.isApp)
  const batchGames = matchGames.map((g) => ({
    query_id: (g.platform || 'unknown') + ':' + (g.appName || g.catalogItemId || g.id),
    title: matchQueryTitle(g),
    developer: g.developer || null,
    publisher: g.publisher || null,
    release_year: g.releaseYear || null,
    poster_url: g.posterUrl || null,
    is_dlc: g.isDlc === true,
    dlc_of: g.dlcOf || null,
    is_beta: g.isBeta === true,
    beta_of: g.betaOf || null,
    is_demo: g.isDemo === true,
    demo_of: g.demoOf || null,
    game_type: g.contentType || g.gameType || (g.isDemo ? 'demo' : g.isDlc ? 'dlc_addon' : g.isBeta ? 'beta' : 'main_game'),
    external_ids: g.sources?.length
      ? g.sources.map((s: any) => ({ source: s.source || g.platform || 'unknown', id: s.id || s.appName || s.catalogItemId || g.id }))
      : [{ source: g.platform || 'unknown', id: g.appName || g.catalogItemId || g.id }],
    media_type: 'game',
  }))

  let matches: MatchResponse[] = []

  // Large libraries (hundreds of games) can take minutes to match — each game
  // triggers serial IGDB searches server-side (~2s/game). Send the batch in
  // chunks so no single request exceeds the timeout, and accumulate results
  // in order so the per-game loop below stays index-aligned.
  const CHUNK_SIZE = 25
  const mapMatch = (m: any): MatchResponse => ({
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
  })

  try {
    for (let i = 0; i < batchGames.length; i += CHUNK_SIZE) {
      const chunk = batchGames.slice(i, i + CHUNK_SIZE)
      const { data } = await apiClient.post<{ matches: any[] }>(
        '/media/match/batch',
        { games: chunk },
        { timeout: 180000 },
      )
      matches.push(...(data.matches || []).map(mapMatch))
      console.log(
        `[matching] chunk ${i / CHUNK_SIZE + 1}/${Math.ceil(batchGames.length / CHUNK_SIZE)}: ${chunk.length} games → ${(data.matches || []).length} responses`,
      )
    }
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
        isDlc: g.isDlc === true,
        dlcOf: g.dlcOf || undefined,
        isBeta: g.isBeta === true,
        betaOf: g.betaOf || undefined,
        isApp: g.isApp === true,
        gameType: g.gameType || (g.isApp ? 'application' : g.isBeta ? 'beta' : g.isDlc ? 'dlc_addon' : 'main_game'),
        sources: g.sources || [{ source: g.platform, appName: g.appName, namespace: g.namespace, catalogItemId: g.catalogItemId, developer: g.developer, developerId: g.developerId, contentType: g.contentType, platforms: g.platforms, savePaths: g.savePaths, isDlc: g.isDlc === true, dlcOf: g.dlcOf || null, isBeta: g.isBeta === true, betaOf: g.betaOf || null, isApp: g.isApp === true, gameType: g.gameType || (g.isApp ? 'application' : null) }],
      }))
      await desktopAPI.saveScannedGames(toSave)
    } catch (err) {
      console.error('[matching] saveScannedGames failed:', err)
    }
  }

  let matched = 0
  let suggested = 0
  if (desktopAPI?.acceptSuggestion) {
    for (let i = 0; i < Math.min(matchGames.length, matches.length); i++) {
      const m = matches[i]
      if (!m) continue
      // Auto-match (backend already creates approved proposal)
      const best = m.autoMatch?.mediaItemId && !m.autoMatch.needsImport ? m.autoMatch : null

      if (best) {
        try {
          await desktopAPI.acceptSuggestion(matchGames[i].id, {
            id: best.mediaItemId, title: best.title, slug: best.mediaItemId,
            posterUrl: best.posterUrl || null, developer: best.developer || null,
            platforms: best.platforms || [], confidence: best.confidence,
          } as any)
          matched++
        } catch (err) {
          console.error('[matching] persist failed for', matchGames[i].id, err)
        }
      }

      // Candidates — save as suggestions for user review
      else if (m.candidates.length > 0) {
        suggested++
        const best = m.candidates[0]
        if (best.mediaItemId && !best.needsImport) {
          try {
            await desktopAPI.acceptSuggestion(matchGames[i].id, {
              id: best.mediaItemId, title: best.title, slug: best.mediaItemId,
              posterUrl: best.posterUrl || null, developer: best.developer || null,
              platforms: best.platforms || [], confidence: best.confidence,
              _candidates: m.candidates,
            } as any)
          } catch (err) {
            console.error('[matching] acceptSuggestion (candidate) failed for', matchGames[i].id, err)
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
