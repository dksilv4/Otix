import { apiClient, CLIENT_API_BASE_URL, convertKeysToCamelCase } from '@/lib/api/client'
import { ACCESS_TOKEN_KEY } from '@/lib/config/config'

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

// ── SSE stream matcher ────────────────────────────────────────────────────

// The batch endpoint is slow (IGDB 4 RPS + SteamGrid 2 RPS with up to 4
// artwork calls per unmatched game), so a single POST that must return all
// results can blow past any timeout once the library grows. The /match/stream
// endpoint yields one game-progress event per game as it finishes; we read the
// stream incrementally so there is no total-request timeout, only an idle
// watchdog that fires when the server goes silent for a long stretch.
const STREAM_IDLE_TIMEOUT_MS = 120_000
const MAX_RETRY_DEPTH = 4

function mapCandidate(c: any): MatchCandidateCamel {
  return {
    mediaItemId: c.mediaItemId ?? null,
    title: c.title,
    posterUrl: c.posterUrl ?? null,
    backdropUrl: c.backdropUrl ?? null,
    releaseYear: c.releaseYear ?? null,
    platforms: c.platforms ?? null,
    developer: c.developer ?? null,
    confidence: c.confidence ?? 0,
    matchType: c.matchType ?? 'unknown',
    needsImport: c.needsImport ?? false,
    providerId: c.providerId ?? null,
    provider: c.provider ?? null,
  }
}

// game-progress event payload → the same MatchResponse shape the old batch
// endpoint returned (camelCased; the raw SSE frame is snake_case).
function toMatchResponse(evt: any): MatchResponse {
  return {
    queryId: evt.queryId ?? '',
    queryTitle: evt.queryTitle ?? '',
    candidates: (evt.candidates || []).map(mapCandidate),
    autoMatch: evt.autoMatch && evt.match ? mapCandidate(evt.match) : null,
  }
}

/**
 * Stream a batch of match requests from /media/match/stream, calling
 * `onResult` for each game as its event arrives. Results are index-aligned to
 * the input games (via the server's game_index plus the base offset).
 *
 * If the stream fails (connection drop, idle timeout, HTTP error) the batch is
 * split in half and each half retried so a single problematic game is isolated
 * instead of re-processing (and discarding) the whole scan. Games that exhaust
 * the retry depth yield `null`.
 */
async function matchViaSse(
  games: any[],
  baseIdx: number,
  onResult: (idx: number, m: MatchResponse | null) => void,
  depth = 0,
): Promise<void> {
  const controller = new AbortController()
  let idleTimer: ReturnType<typeof setTimeout> | undefined

  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS)
  }

  try {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_TOKEN_KEY) : null
    const res = await fetch(`${CLIENT_API_BASE_URL}/media/match/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ games }),
      signal: controller.signal,
    })
    if (!res.ok || !res.body) {
      throw new Error(`match stream ${res.status} ${res.statusText}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finished = false

    resetIdle()
    while (!finished) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      resetIdle()

      const frames = buffer.split('\n\n')
      buffer = frames.pop() || ''
      for (const frame of frames) {
        let eventType = 'message'
        let dataStr = ''
        for (const line of frame.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim()
          else if (line.startsWith('data: ')) dataStr = line.slice(6).trim()
        }
        if (!dataStr) continue
        let payload: any
        try {
          payload = JSON.parse(dataStr)
        } catch {
          continue
        }
        const evt = convertKeysToCamelCase(payload) as any
        if (eventType === 'game-progress') {
          const idx = baseIdx + (typeof evt.gameIndex === 'number' ? evt.gameIndex : -1)
          if (idx < 0) continue
          const m = evt.status === 'error' ? null : toMatchResponse(evt)
          onResult(idx, m)
        } else if (eventType === 'complete') {
          finished = true
          break
        }
      }
    }
  } catch (err) {
    console.warn(`[matching] stream of ${games.length} failed (depth ${depth}), splitting:`, err)
    if (games.length <= 1 || depth >= MAX_RETRY_DEPTH) {
      // Give up on this game rather than block the whole scan
      onResult(baseIdx, null)
      return
    }
    const mid = Math.ceil(games.length / 2)
    await matchViaSse(games.slice(0, mid), baseIdx, onResult, depth + 1)
    await matchViaSse(games.slice(mid), baseIdx + mid, onResult, depth + 1)
  } finally {
    if (idleTimer) clearTimeout(idleTimer)
  }
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

  type MaybeMatch = MatchResponse | null | undefined
  const matches: MaybeMatch[] = new Array(batchGames.length).fill(undefined)
  const persistPromises: Promise<void>[] = []
  let matched = 0
  let suggested = 0

  // Persist each game as its stream event arrives so a dropped connection never
  // loses already-matched games.
  const onResult = (idx: number, m: MatchResponse | null) => {
    matches[idx] = m
    if (!m || !desktopAPI?.acceptSuggestion || idx >= matchGames.length) return
    const best = m.autoMatch?.mediaItemId && !m.autoMatch.needsImport ? m.autoMatch : null
    if (best) {
      persistPromises.push(
        desktopAPI.acceptSuggestion(matchGames[idx].id, {
          id: best.mediaItemId, title: best.title, slug: best.mediaItemId,
          posterUrl: best.posterUrl || null, developer: best.developer || null,
          platforms: best.platforms || [], confidence: best.confidence,
        } as any)
          .then(() => { matched++ })
          .catch((err: any) => console.error('[matching] persist failed for', matchGames[idx].id, err)),
      )
    } else if (m.candidates.length > 0) {
      suggested++
      const candidate = m.candidates[0]
      if (candidate.mediaItemId && !candidate.needsImport) {
        persistPromises.push(
          desktopAPI.acceptSuggestion(matchGames[idx].id, {
            id: candidate.mediaItemId, title: candidate.title, slug: candidate.mediaItemId,
            posterUrl: candidate.posterUrl || null, developer: candidate.developer || null,
            platforms: candidate.platforms || [], confidence: candidate.confidence,
            _candidates: m.candidates,
          } as any)
            .catch((err: any) => console.error('[matching] acceptSuggestion (candidate) failed for', matchGames[idx].id, err)),
        )
      }
    }
  }

  await matchViaSse(batchGames, 0, onResult)
  await Promise.all(persistPromises)

  const responded = matches.filter((m): m is MatchResponse => m != null)
  console.log(`[matching] ${games.length} games sent, ${responded.length} responses, ${responded.filter(m => m.autoMatch).length} auto-matched, ${responded.filter(m => m.candidates.length > 0 && !m.autoMatch).length} candidates`)

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

  return {
    matched,
    suggested,
    total: games.length,
    games,
    matches: responded,
  }
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
