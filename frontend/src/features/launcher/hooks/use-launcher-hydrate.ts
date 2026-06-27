/* ── useHydrateLocalGames — auto-refresh matched game data from server ── */

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useLocalGames } from '@/features/launcher/game-queries'
import { localGameKeys } from '@/features/launcher/game-queries'
import { gameKeys } from '@/features/launcher/queries'
import type { LocalGame, Game } from '@/features/launcher/types'

/** Check if a local game is missing rich catalog data (poster, backdrop, logo). */
function needsHydration(g: LocalGame): boolean {
  if (!g.otixMediaId && !g.data?.id) return false
  // Check both g.data (backend match flow) and otix* (desktop DB) fields
  return !(g.data?.backdropUrl || g.otixBackdropUrl) && !(g.data?.posterUrl || g.otixPosterUrl)
}

/** Hydrate a single matched game: fetch catalog detail, update cache + desktop DB. */
async function hydrateGame(
  g: LocalGame,
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  const mediaId = g.otixMediaId || g.data?.id
  // Guard against bogus IDs — empty string, literal "undefined", etc.
  if (!mediaId || mediaId === 'undefined' || mediaId === 'null') return
  try {
    const { data } = await apiClient.get<Record<string, unknown>>(`/media/game/${mediaId}`)

    // Update local game cache with rich catalog data
    queryClient.setQueryData(localGameKeys.detail(g.id), (old: LocalGame | undefined) => {
      if (!old) return old
      return {
        ...old,
        data: { ...old.data, ...data } as Game,
        otixPosterUrl: (data.posterUrl as string) ?? old.otixPosterUrl,
        otixBackdropUrl: (data.backdropUrl as string) ?? old.otixBackdropUrl,
        otixIconUrl: (data.iconUrl as string) ?? old.otixIconUrl,
        otixLogoUrl: (data.logoUrl as string) ?? old.otixLogoUrl,
      }
    })

    // Update catalog detail cache
    queryClient.setQueryData(gameKeys.detail(mediaId), data)

    // Persist to desktop local DB
    const api = getDesktopAPI()
    if (api?.acceptSuggestion) {
      await api.acceptSuggestion(g.id, {
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
    // Network error or 404 — skip silently
  }
}

/**
 * On mount, checks all matched local games and refreshes stale catalog data
 * from the server. Runs once per mount.
 */
export function useHydrateLocalGames(): void {
  const queryClient = useQueryClient()
  // Fetch ALL games and filter by otix ID manually — desktop `matched` filter unreliable
  const { data: games } = useLocalGames()
  const hydratedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!games?.length) return

    const toHydrate = games.filter(
      (g) => (g.otixMediaId || g.data?.id) && needsHydration(g) && !hydratedRef.current.has(g.id),
    )
    if (!toHydrate.length) return

    // Mark as hydrated immediately to avoid double-fires
    toHydrate.forEach((g) => hydratedRef.current.add(g.id))

    // Hydrate concurrently with a semaphore to avoid flooding
    const concurrency = 4
    const run = async () => {
      const queue = [...toHydrate]
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length > 0) {
          const g = queue.shift()!
          await hydrateGame(g, queryClient)
        }
      })
      await Promise.all(workers)
    }
    run()
  }, [games, queryClient])
}
