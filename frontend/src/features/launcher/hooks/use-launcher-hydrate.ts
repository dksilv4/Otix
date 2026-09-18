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

function patchLocalGame(
  queryClient: ReturnType<typeof useQueryClient>,
  game: LocalGame,
): void {
  queryClient.setQueryData(localGameKeys.detail(game.id), game)
  queryClient.setQueriesData({ queryKey: ['local-games', 'list'] }, (old: LocalGame[] | undefined) => {
    if (!old) return [game]
    if (old.some((item) => item.id === game.id)) {
      return old.map((item) => (item.id === game.id ? game : item))
    }
    return [...old, game]
  })
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
    const next = applyAutoMatchToGame(game, {
      mediaItemId: match.mediaItemId,
      title: match.title || game.title,
      posterUrl: match.posterUrl,
      backdropUrl: match.backdropUrl,
    })
    patchLocalGame(queryClient, next)
    if (api?.acceptSuggestion) {
      await api.acceptSuggestion(next.id, {
        id: match.mediaItemId,
        title: next.title,
        slug: next.otixMediaSlug || '',
        posterUrl: match.posterUrl ?? null,
        backdropUrl: match.backdropUrl ?? null,
      })
    }
    accepted.push(next)
  }
  return accepted
}

/** Check if a local game is missing rich catalog data or artwork. */
function needsHydration(g: LocalGame): boolean {
  if (!g.otixMediaId && !g.data?.id) return false
  const hasPoster = !!(g.data?.posterUrl || g.otixPosterUrl)
  const hasLogo = !!(g.data?.logoUrl || g.otixLogoUrl)
  const hasBackdrop = !!(g.data?.backdropUrl || g.otixBackdropUrl)
  const hasTextless = !!(g.data?.textlessPosterUrl || g.otixTextlessPosterUrl)
  const hasRichData = !!(g.data?.genres?.length || g.data?.involvedCompanies?.length)
  const hasOverview = !!g.data?.overview
  if (hasPoster && hasLogo && hasBackdrop && hasTextless && hasRichData && hasOverview) return false
  return true
}

function applyHydratedGame(old: LocalGame, data: Record<string, unknown>): LocalGame {
  return {
    ...old,
    title: (data.title as string) || old.title,
    posterUrl: (data.posterUrl as string) ?? old.posterUrl,
    data: { ...old.data, ...data } as Game,
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
  const mediaId = g.otixMediaId || g.data?.id
  if (!mediaId || mediaId === 'undefined' || mediaId === 'null') return
  if (_hydrated.has(g.id) || _inflight.has(g.id)) return
  _inflight.add(g.id)
  try {
    const { data } = await apiClient.get<Record<string, unknown>>(`/media/game/${mediaId}`)
    patchLocalGame(queryClient, applyHydratedGame(g, data))
    queryClient.setQueryData(gameKeys.detail(mediaId), data)

    const api = getDesktopAPI()
    if (api?.acceptSuggestion) {
      await api.acceptSuggestion(g.id, {
        // hydrated carries the full catalog payload so the desktop persists
        // otix_data (overview, genres, logoColorGuess, …) instead of re-fetching every session
        hydrated: data,
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
    _hydrated.add(g.id)
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

    const run = async () => {
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
        try {
          await apiClient.post('/search/prehydrate', { titles: foundTitles })
        } catch {
          _prehydrateSig = ''
        }
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
        if (!(g.otixMediaId || g.data?.id) || !needsHydration(g) || _hydrated.has(g.id) || _inflight.has(g.id)) continue
        seen.add(g.id)
        toHydrate.push(g)
      }
      if (!toHydrate.length) return

      const concurrency = 4
      const queue = [...toHydrate]
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length > 0) {
          const g = queue.shift()!
          await hydrateGame(g, queryClient)
        }
      })
      await Promise.all(workers)
    }

    void run()
  }, [games, merged, queryClient, serverGamesData?.files])
}
