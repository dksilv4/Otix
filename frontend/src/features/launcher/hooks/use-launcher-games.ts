import { useMemo, useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useLauncherVisibleGames } from '@/features/launcher/data/game-queries'
import { usePopularGames } from '@/features/launcher/data/queries'
import { isApplicationGame } from '@/features/launcher/utils'
import type { LocalGame } from '@/features/launcher/types'

export interface UseLauncherGamesOptions {
  includePopular?: boolean
  sortBy?: 'last_played_at' | 'title'
}

export const useLauncherGames = (options: UseLauncherGamesOptions = {}) => {
  const { includePopular = true, sortBy } = options
  const params = useParams({ strict: false }) as Record<string, string>
  const routeGameId = params?.gameId || null
  const navigate = useNavigate()

  const { data: localGames = [], isLoading: isLocalLoading } = useLauncherVisibleGames(
    sortBy ? { sortBy, sortDir: 'desc' } : undefined,
  )
  const { data: popularGames = [], isLoading: isPopularLoading } = usePopularGames({
    enabled: includePopular,
  })

  const [selectedGameId, setSelectedGameId] = useState<string | null>(routeGameId)
  const [searchQuery, setSearchQuery] = useState('')

  // Sync selected game with URL route params when route param changes
  useEffect(() => {
    if (routeGameId) {
      setSelectedGameId(routeGameId)
    }
  }, [routeGameId])

  const games: LocalGame[] = useMemo(() => {
    const list: LocalGame[] = localGames.filter((g) => !isApplicationGame(g))
    if (!includePopular) return list

    popularGames.forEach((pop) => {
      const exists = list.some(
        (g) => g.id === pop.id || g.title.toLowerCase() === pop.title.toLowerCase(),
      )
      if (!exists) {
        list.push({
          id: pop.id,
          title: pop.title,
          platform: 'pc',
          posterUrl: pop.posterUrl ?? undefined,
          otixPosterUrl: pop.posterUrl ?? undefined,
          otixBackdropUrl: pop.backdropUrl ?? undefined,
          otixLogoUrl: pop.logoUrl ?? undefined,
          description: ((pop as unknown as Record<string, unknown>).overview as string) || '',
          data: pop as LocalGame['data'],
        })
      }
    })
    return list
  }, [localGames, popularGames, includePopular])

  const filteredGames: LocalGame[] = useMemo(() => {
    if (!searchQuery.trim()) return games
    const q = searchQuery.toLowerCase()
    return games.filter((g) => g.title.toLowerCase().includes(q))
  }, [games, searchQuery])

  const activeGame: LocalGame | null = useMemo(() => {
    if (!filteredGames.length) return null
    if (selectedGameId) {
      const found = filteredGames.find((g) => g.id === selectedGameId)
      if (found) return found
    }
    return filteredGames[0]
  }, [filteredGames, selectedGameId])

  const selectGame = useCallback((id: string) => {
    setSelectedGameId(id)
    void navigate({
      to: '/launcher/$gameId',
      params: { gameId: id },
      replace: true,
    })
  }, [navigate])

  return {
    games,
    filteredGames,
    activeGame,
    activeGameId: activeGame?.id ?? selectedGameId,
    selectGame,
    setSelectedGameId,
    searchQuery,
    setSearchQuery,
    isLoading: isLocalLoading || (includePopular && isPopularLoading),
  }
}
