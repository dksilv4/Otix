import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
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
    if (!includePopular || popularGames.length === 0) return list

    const existingIds = new Set(list.map((g) => g.id))
    const existingTitles = new Set(list.map((g) => g.title.toLowerCase()))

    for (const pop of popularGames) {
      const lowerTitle = pop.title.toLowerCase()
      if (existingIds.has(pop.id) || existingTitles.has(lowerTitle)) {
        continue
      }
      existingIds.add(pop.id)
      existingTitles.add(lowerTitle)
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
    return list
  }, [localGames, popularGames, includePopular])

  const filteredGames: LocalGame[] = useMemo(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return games
    const q = trimmed.toLowerCase()
    return games.filter((g) => g.title.toLowerCase().includes(q))
  }, [games, searchQuery])

  const filteredGamesById = useMemo(
    () => new Map(filteredGames.map((g) => [g.id, g])),
    [filteredGames],
  )

  const activeGame: LocalGame | null = useMemo(() => {
    if (!filteredGames.length) return null
    if (selectedGameId) {
      const found = filteredGamesById.get(selectedGameId)
      if (found) return found
    }
    return filteredGames[0]
  }, [filteredGames, selectedGameId, filteredGamesById])

  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up any pending navigation on unmount
  useEffect(() => {
    return () => {
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current)
      }
    }
  }, [])

  const selectGame = useCallback((id: string) => {
    setSelectedGameId(id)
    if (navTimerRef.current) {
      clearTimeout(navTimerRef.current)
    }
    navTimerRef.current = setTimeout(() => {
      void navigate({
        to: '/launcher/$gameId',
        params: { gameId: id },
        replace: true,
      })
    }, 150)
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
