import { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { useRunningGame } from './use-running-game'
import type { RunningGameData } from '@/lib/desktop/api'
import type { MediaItemDetail } from '@/features/media/queries/media-queries'

export interface MatchedGameInfo {
  id: string
  title: string
  slug?: string
  posterUrl?: string | null
  backdropUrl?: string | null
  releaseDate?: string | null
  genres?: string[]
  developer?: string | null
  rating?: number | null
  overview?: string | null
}

import { cleanGameTitle } from '../utils/game-signatures'
export { cleanGameTitle }

export const useMatchedRunningGame = (customGame?: RunningGameData): {
  runningGame: RunningGameData | null
  runningGames: RunningGameData[]
  elapsedMs: number
  matchedGame: MatchedGameInfo | null
  isMatching: boolean
  cycleActiveGame: () => Promise<void>
  setActiveGame: (gameId: string) => Promise<void>
} => {
  const { runningGame: defaultRunningGame, runningGames, elapsedMs: defaultElapsedMs, cycleActiveGame, setActiveGame } = useRunningGame()
  const runningGame = customGame ?? defaultRunningGame
  const [customElapsedMs, setCustomElapsedMs] = useState(() =>
    customGame?.startTime ? Math.max(0, Date.now() - customGame.startTime) : 0,
  )

  useEffect(() => {
    if (!customGame?.startTime) {
      setCustomElapsedMs(0)
      return
    }
    const update = () => {
      setCustomElapsedMs(Math.max(0, Date.now() - customGame.startTime))
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [customGame?.startTime])

  const elapsedMs = customGame ? customElapsedMs : defaultElapsedMs

  const rawTitle = runningGame?.game.title || ''
  const exePath = runningGame?.game.exePath || ''
  const rawMediaId = runningGame?.game.otixMediaId || (runningGame?.game.id && !/^(pc_file_|iso[:_]file_|steam_|rom_|ps\d+_|xbox|switch_|file_)/i.test(runningGame.game.id) ? runningGame.game.id : '')
  const otixMediaId = rawMediaId ? String(rawMediaId).trim().replace(/\.0+$/, '') : ''
  const cleanedTitle = useMemo(() => cleanGameTitle(rawTitle, exePath), [rawTitle, exePath])

  const { data: matchedGame, isLoading: isMatching } = useQuery<MatchedGameInfo | null>({
    queryKey: ['running-game-matched', otixMediaId || cleanedTitle],
    queryFn: async () => {
      // 1. Direct fetch if otixMediaId is known
      if (otixMediaId) {
        try {
          const { data } = await apiClient.get<MediaItemDetail>(`/media/game/${otixMediaId}`, {
            signal: AbortSignal.timeout(4000),
          })
          if (data) {
            const dev = data.involvedCompanies?.find((c) => c.developer)?.company?.name
            return {
              id: data.id,
              title: data.title,
              slug: data.slug,
              posterUrl: data.posterUrl,
              backdropUrl: data.backdropUrl,
              releaseDate: data.releaseDate,
              genres: data.genres?.map((g) => g.name),
              developer: dev || data.involvedCompanies?.[0]?.company?.name || null,
              rating: data.avgRating ?? data.overallRating ?? null,
              overview: data.overview,
            }
          }
        } catch {
          // fall back to search
        }
      }

      if (!cleanedTitle) return null

      // 2. Search catalog by title with smart fallbacks
      interface SearchItem {
        id: string
        title: string
        slug: string
        posterUrl: string | null
        backdropUrl: string | null
        releaseDate: string | null
        avgRating?: number | null
        overview?: string | null
        genres?: Array<{ id: number; name: string } | string>
      }

      const searchQueries = [cleanedTitle]

      // Fallback 1: If exePath has a folder name different from cleanedTitle
      if (exePath) {
        const parts = exePath.split(/[/\\]/).filter(Boolean)
        if (parts.length >= 2) {
          const folderClean = cleanGameTitle(parts[parts.length - 2])
          if (folderClean && !searchQueries.includes(folderClean)) {
            searchQueries.push(folderClean)
          }
        }
      }

      // Fallback 2: Strip trailing numbers or edition markers
      const strippedNumbers = cleanedTitle.replace(/\s+\d+$/, '').trim()
      if (strippedNumbers && !searchQueries.includes(strippedNumbers)) {
        searchQueries.push(strippedNumbers)
      }

      // Fallback 3: Try raw title if distinct
      if (rawTitle && !searchQueries.includes(rawTitle) && !/^file_/i.test(rawTitle)) {
        searchQueries.push(rawTitle)
      }

      for (const query of searchQueries) {
        try {
          const { data: searchData } = await apiClient.get<{ items: SearchItem[] }>(
            '/search',
            { params: { q: query, media_type: 'game', page_size: 5 } },
          )

          const items = searchData?.items || []
          if (items.length === 0) continue

          // Pick exact match or closest, else first item
          const exact = items.find((i) => i.title.toLowerCase() === cleanedTitle.toLowerCase())
            || items.find((i) => i.title.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanedTitle.toLowerCase().replace(/[^a-z0-9]/g, ''))
            || items[0]

          // If exact.id is a numeric database ID, attempt to fetch richer details (genres & dev)
          if (/^\d+$/.test(exact.id)) {
            try {
              const { data: detail } = await apiClient.get<MediaItemDetail>(`/media/game/${exact.id}`, {
                signal: AbortSignal.timeout(3000),
              })
              const dev = detail.involvedCompanies?.find((c) => c.developer)?.company?.name
              return {
                id: detail.id,
                title: detail.title,
                slug: detail.slug,
                posterUrl: detail.posterUrl,
                backdropUrl: detail.backdropUrl,
                releaseDate: detail.releaseDate,
                genres: detail.genres?.map((g) => g.name),
                developer: dev || detail.involvedCompanies?.[0]?.company?.name || null,
                rating: detail.avgRating ?? detail.overallRating ?? null,
                overview: detail.overview,
              }
            } catch {
              // Fall through to exact search item
            }
          }

          // Hydrate directly from the search item (contains full poster, backdrop, overview, ratings)
          const searchGenres = exact.genres?.map((g) => (typeof g === 'string' ? g : g.name))
          return {
            id: exact.id,
            title: exact.title,
            slug: exact.slug,
            posterUrl: exact.posterUrl,
            backdropUrl: exact.backdropUrl,
            releaseDate: exact.releaseDate,
            genres: searchGenres,
            rating: exact.avgRating ?? null,
            overview: exact.overview || null,
          }
        } catch {
          // Try next fallback query
        }
      }

      // Fallback if not in search catalog: return cleaned title and any local artwork
      return {
        id: runningGame?.game.id || '',
        title: cleanedTitle || rawTitle,
        posterUrl: runningGame?.game.posterUrl || null,
        backdropUrl: null,
      }
    },
    enabled: Boolean(runningGame && (otixMediaId || cleanedTitle)),
    staleTime: 1000 * 60 * 15,
  })

  return {
    runningGame,
    runningGames,
    elapsedMs,
    matchedGame: matchedGame || null,
    isMatching,
    cycleActiveGame,
    setActiveGame,
  }
}
