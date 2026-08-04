/* ── useHydrateLocalGames — auto-refresh matched game data from server ── */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useLocalGames } from '@/features/launcher/data/game-queries'
import { localGameKeys } from '@/features/launcher/data/game-queries'
import { gameKeys } from '@/features/launcher/data/queries'
import type { LocalGame, Game } from '@/features/launcher/types'

// Module-level set — survives remounts, runs once per app session
const _hydrated = new Set<string>()

/** Check if a local game is missing rich catalog data or artwork. */
function needsHydration(g: LocalGame): boolean {
  if (!g.otixMediaId && !g.data?.id) return false
  const hasPoster = !!(g.data?.posterUrl || g.otixPosterUrl)
  const hasLogo = !!(g.data?.logoUrl || g.otixLogoUrl)
  const hasBackdrop = !!(g.data?.backdropUrl || g.otixBackdropUrl)
  const hasTextless = !!(g.data?.textlessPosterUrl || g.otixTextlessPosterUrl)
  const hasRichData = !!(g.data?.genres?.length || g.data?.involvedCompanies?.length)
  const hasOverview = !!(g.data?.overview || g.data?.summary)
  if (hasPoster && hasLogo && hasBackdrop && hasTextless && hasRichData && hasOverview) return false
  return true
}

/** Hydrate a single matched game: fetch catalog detail, update cache + desktop DB. */
async function hydrateGame(
  g: LocalGame,
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  const mediaId = g.otixMediaId || g.data?.id
  if (!mediaId || mediaId === 'undefined' || mediaId === 'null') return
  try {
    const { data } = await apiClient.get<Record<string, unknown>>(`/media/game/${mediaId}`)

    queryClient.setQueryData(localGameKeys.detail(g.id), (old: LocalGame | undefined) => {
      if (!old) return old
      return {
        ...old,
        data: { ...old.data, ...data } as Game,
        otixPosterUrl: (data.posterUrl as string) ?? old.otixPosterUrl,
        otixBackdropUrl: (data.backdropUrl as string) ?? old.otixBackdropUrl,
        otixTextlessPosterUrl: (data.textlessPosterUrl as string) ?? old.otixTextlessPosterUrl,
        otixIconUrl: (data.iconUrl as string) ?? old.otixIconUrl,
        otixLogoUrl: (data.logoUrl as string) ?? old.otixLogoUrl,
      }
    })

    queryClient.setQueryData(gameKeys.detail(mediaId), data)
    _hydrated.add(g.id)

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

/** Auto-hydrate matched games once per app session. */
export function useHydrateLocalGames(): void {
  const queryClient = useQueryClient()
  const { data: games } = useLocalGames()

  useEffect(() => {
    if (!games?.length) return

    const toHydrate = games.filter(
      (g) => (g.otixMediaId || g.data?.id) && needsHydration(g) && !_hydrated.has(g.id),
    )
    if (!toHydrate.length) return

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
