/* ── useHydrateLocalGames — persist scanned server releases and fill catalog data ── */

import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { getDesktopAPI } from '@/lib/desktop/api'
import { localGameKeys, useLocalGames } from '@/features/launcher/data/game-queries'
import { gameKeys } from '@/features/launcher/data/queries'
import { useServerGames, serverKeys } from '@/features/downloads/use-server-downloads'
import {
  applyAutoMatchToGame,
  autoMatchTargetGames,
  foundServerGameTitles,
  listUnmatchedServerGames,
  mergeLocalAndServerGames,
  persistableServerGames,
} from '@/features/launcher/data/visible-games'
import type { LocalGame, Game } from '@/features/launcher/types'

// Module-level set — survives remounts, runs once per app session
const _hydrated = new Set<string>()
const _inflight = new Set<string>()
let _serverPersistSig = ''
let _prehydrateSig = ''
let _autoMatchSig = ''
let _isRunningHydration = false

const AUTO_MATCH_MIN_CONFIDENCE = 0.85

interface AutoMatchCandidate {
  mediaItemId: string | null
  title: string
  posterUrl?: string | null
  backdropUrl?: string | null
  confidence: number
}

interface AutoMatchResult {
  queryId: string
  queryTitle: string
  autoMatch: AutoMatchCandidate | null
}

let _pendingPatches = new Map<string, LocalGame>()
let _patchFlushTimer: ReturnType<typeof setTimeout> | null = null

export function patchLocalGames(
  queryClient: ReturnType<typeof useQueryClient>,
  games: LocalGame[],
): void {
  if (!games.length) return
  for (const game of games) {
    queryClient.setQueryData(localGameKeys.detail(game.id), game)
  }
  const gamesById = new Map(games.map((g) => [g.id, g]))
  queryClient.setQueriesData({ queryKey: localGameKeys.list() }, (old: LocalGame[] | undefined) => {
    if (!old) return games
    const oldIds = new Set(old.map((item) => item.id))
    const updated = old.map((item) => gamesById.get(item.id) ?? item)
    for (const [id, game] of gamesById) {
      if (!oldIds.has(id)) {
        updated.push(game)
      }
    }
    return updated
  })
}

export function queuePatchLocalGame(
  queryClient: ReturnType<typeof useQueryClient>,
  game: LocalGame,
): void {
  queryClient.setQueryData(localGameKeys.detail(game.id), game)
  _pendingPatches.set(game.id, game)

  if (!_patchFlushTimer) {
    _patchFlushTimer = setTimeout(() => {
      _patchFlushTimer = null
      flushPendingPatches(queryClient)
    }, 100)
  }
}

export function flushPendingPatches(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  if (_patchFlushTimer) {
    clearTimeout(_patchFlushTimer)
    _patchFlushTimer = null
  }
  if (_pendingPatches.size === 0) return
  const gamesToPatch = Array.from(_pendingPatches.values())
  _pendingPatches.clear()
  patchLocalGames(queryClient, gamesToPatch)
}

export function patchLocalGame(
  queryClient: ReturnType<typeof useQueryClient>,
  game: LocalGame,
): void {
  queuePatchLocalGame(queryClient, game)
}

async function autoMatchUnmatchedGames(
  unmatched: LocalGame[],
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<LocalGame[]> {
  const targets = autoMatchTargetGames(unmatched)
  if (!targets.length) return []
  const { data } = await apiClient.post<{ matches: AutoMatchResult[] }>('/media/match/batch', {
    games: targets.map((game) => ({
      queryId: game.id,
      title: game.title,
      platform: game.platform,
    })),
  })
  const byId = new Map((data.matches || []).map((row) => [row.queryId, row]))
  const accepted: LocalGame[] = []
  const api = getDesktopAPI()
  for (const game of targets) {
    const row = byId.get(game.id)
    const match = row?.autoMatch
    if (!match?.mediaItemId || match.confidence < AUTO_MATCH_MIN_CONFIDENCE) continue
    const cleanMediaItemId = String(match.mediaItemId).trim().replace(/\.0+$/, '')
    const next = applyAutoMatchToGame(game, {
      mediaItemId: cleanMediaItemId,
      title: match.title || game.title,
      posterUrl: match.posterUrl,
      backdropUrl: match.backdropUrl,
    })
    if (api?.acceptSuggestion) {
      await api.acceptSuggestion(next.id, {
        id: cleanMediaItemId,
        title: next.title,
        slug: next.otixMediaSlug || '',
        posterUrl: match.posterUrl ?? null,
        backdropUrl: match.backdropUrl ?? null,
      })
    }
    accepted.push(next)
  }

  // Batch update cache once for all matched targets
  if (accepted.length > 0) {
    patchLocalGames(queryClient, accepted)
  }

  return accepted
}

/** Extract and sanitize a valid catalog media ID from a LocalGame, or null if unmatched. */
export function getCatalogMediaId(g: LocalGame): string | null {
  const rawId = g.otixMediaId || (g.data?.id && g.data.id !== g.id ? g.data.id : null)
  if (!rawId || rawId === 'undefined' || rawId === 'null') return null
  const cleaned = String(rawId).trim().replace(/\.0+$/, '')
  if (!cleaned || /^(pc_file_|iso[:_]file_|steam_|rom_|ps\d+_|xbox|switch_|file_)/i.test(cleaned)) {
    return null
  }
  return cleaned
}

/** Check if a local game is missing rich catalog data or artwork. */
function needsHydration(g: LocalGame): boolean {
  if (!getCatalogMediaId(g)) return false
  if ((g.data as any)?.hydrated) return false
  const hasPoster = !!(g.data?.posterUrl || g.otixPosterUrl || g.posterUrl)
  const hasOverview = !!(g.data?.overview || g.description)
  // If the game already has poster and overview or genre metadata from SQLite, it does NOT need blocking network hydration
  if (hasPoster && (hasOverview || g.data?.genres?.length)) return false
  return true
}

function applyHydratedGame(old: LocalGame, data: Record<string, unknown>): LocalGame {
  return {
    ...old,
    title: (data.title as string) || old.title,
    posterUrl: (data.posterUrl as string) ?? old.posterUrl,
    data: { ...old.data, ...data, hydrated: true } as Game,
    otixMediaTitle: (data.title as string) || old.otixMediaTitle,
    otixMediaSlug: (data.slug as string) || old.otixMediaSlug,
    otixPosterUrl: (data.posterUrl as string) ?? old.otixPosterUrl,
    otixBackdropUrl: (data.backdropUrl as string) ?? old.otixBackdropUrl,
    otixTextlessPosterUrl: (data.textlessPosterUrl as string) ?? old.otixTextlessPosterUrl,
    otixIconUrl: (data.iconUrl as string) ?? old.otixIconUrl,
    otixLogoUrl: (data.logoUrl as string) ?? old.otixLogoUrl,
  }
}

/** Hydrate a single matched game: fetch catalog detail, update cache + desktop DB. */
async function hydrateGame(
  g: LocalGame,
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  const mediaId = getCatalogMediaId(g)
  if (!mediaId) return
  if (_hydrated.has(g.id) || _inflight.has(g.id)) return
  _inflight.add(g.id)
  _hydrated.add(g.id)
  try {
    const { data } = await apiClient.get<Record<string, unknown>>(`/media/game/${mediaId}`)
    patchLocalGame(queryClient, applyHydratedGame(g, data))
    queryClient.setQueryData(gameKeys.detail(mediaId), data)

    const api = getDesktopAPI()
    if (api?.acceptSuggestion) {
      await api.acceptSuggestion(g.id, {
        // hydrated carries the full catalog payload so the desktop persists
        // otix_data (overview, genres, logoColorGuess, …) instead of re-fetching every session
        hydrated: { ...data, hydrated: true },
        id: mediaId,
        title: data.title || g.title,
        slug: data.slug || '',
        posterUrl: data.posterUrl ?? null,
        backdropUrl: data.backdropUrl ?? null,
        textlessPosterUrl: data.textlessPosterUrl ?? null,
        logoUrl: data.logoUrl ?? null,
        iconUrl: data.iconUrl ?? null,
      } as Record<string, unknown>)
    }
  } catch {
    // Network error or 404 — skip silently so a later session can retry
  } finally {
    _inflight.delete(g.id)
  }
}

/** Auto-hydrate matched games once per app session. */
export function useHydrateLocalGames(): void {
  const queryClient = useQueryClient()
  const { data: games } = useLocalGames()
  const { data: serverGamesData } = useServerGames()
  const merged = useMemo(
    () => mergeLocalAndServerGames(games, serverGamesData?.files),
    [games, serverGamesData?.files],
  )

  useEffect(() => {
    const serverGames = persistableServerGames(games, serverGamesData?.files)
    if (!merged.length && !serverGames?.length) return
    if (_isRunningHydration) return

    let cancelled = false

    const run = async () => {
      if (_isRunningHydration || cancelled) return
      _isRunningHydration = true
      try {
        const api = getDesktopAPI()
        if (serverGames) {
          const sig = serverGames
            .map((game) => `${game.id}:${game.otixMediaId || ''}:${(game.updateFiles || []).map((file) => file.path).join(',')}`)
            .sort()
            .join('|')

          if (api?.saveScannedGames && sig !== _serverPersistSig) {
            _serverPersistSig = sig
            if (serverGames.length) {
              await api.saveScannedGames(serverGames)
            }
          }
        }

        const foundTitles = foundServerGameTitles(games, serverGamesData?.files)
        const prehydrateSig = foundTitles.slice().sort().join('|')
        if (prehydrateSig && prehydrateSig !== _prehydrateSig) {
          _prehydrateSig = prehydrateSig
          // Non-blocking background prehydrate — do not block the thread or stall image rendering
          void apiClient
            .post('/search/prehydrate', { titles: foundTitles.slice(0, 10) })
            .catch(() => {
              _prehydrateSig = ''
            })
        }

        const unmatched = listUnmatchedServerGames(games, serverGamesData?.files)
        const autoMatchSig = unmatched.map((game) => `${game.id}:${game.title}`).sort().join('|')
        let newlyMatched: LocalGame[] = []
        if (autoMatchSig && autoMatchSig !== _autoMatchSig) {
          _autoMatchSig = autoMatchSig
          try {
            newlyMatched = await autoMatchUnmatchedGames(unmatched, queryClient)
            if (newlyMatched.length) {
              queryClient.invalidateQueries({ queryKey: serverKeys.games() })
              if (api?.saveScannedGames) {
                await api.saveScannedGames(newlyMatched)
              }
            }
          } catch {
            _autoMatchSig = ''
          }
        }

        const seen = new Set<string>()
        const toHydrate: LocalGame[] = []
        for (const g of [...newlyMatched, ...merged]) {
          if (seen.has(g.id)) continue
          if (!getCatalogMediaId(g) || !needsHydration(g) || _hydrated.has(g.id) || _inflight.has(g.id)) continue
          seen.add(g.id)
          toHydrate.push(g)
        }
        if (!toHydrate.length || cancelled) return

        // Throttle hydration so it never saturates network connections or blocks image loading
        const concurrency = 2
        const queue = toHydrate.slice(0, 10)
        const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
          while (queue.length > 0 && !cancelled) {
            const g = queue.shift()!
            await hydrateGame(g, queryClient)
            await new Promise((resolve) => setTimeout(resolve, 60))
          }
        })
        await Promise.all(workers)
        flushPendingPatches(queryClient)
      } finally {
        _isRunningHydration = false
      }
    }

    const timer = setTimeout(() => {
      void run()
    }, 1000)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [games, merged, queryClient, serverGamesData?.files])
}
