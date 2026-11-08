import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from 'react'
import type { GameEdition } from '../types'

export interface GameEditionsContextValue {
  editions: GameEdition[]
  selectedEdition: GameEdition | null
  selectedEditionId: number | null
  selectEdition: (editionId: number | null) => void
  hasEditions: boolean
  activeTitle: string
  activeReleaseDate: string | null
  activeExternalIds: Record<string, string | number>
}

const GameEditionsContext = createContext<GameEditionsContextValue | null>(null)

export interface GameEditionsProviderProps {
  children: ReactNode
  editions?: GameEdition[]
  baseGameTitle: string
  baseReleaseDate?: string | null
}

export const GameEditionsProvider = ({
  children,
  editions = [],
  baseGameTitle,
  baseReleaseDate = null,
}: GameEditionsProviderProps) => {
  const [selectedEditionId, setSelectedEditionId] = useState<number | null>(null)

  const selectedEdition = useMemo(() => {
    if (selectedEditionId === null) return null
    return editions.find((ed) => ed.id === selectedEditionId) || null
  }, [editions, selectedEditionId])

  const selectEdition = useCallback((editionId: number | null) => {
    setSelectedEditionId(editionId)
  }, [])

  const hasEditions = editions.length > 0
  const activeTitle = selectedEdition ? selectedEdition.rawTitle : baseGameTitle
  const activeReleaseDate = selectedEdition?.releaseDate || baseReleaseDate
  const activeExternalIds = useMemo(() => {
    return selectedEdition?.externalIds || {}
  }, [selectedEdition])

  const value = useMemo(
    () => ({
      editions,
      selectedEdition,
      selectedEditionId,
      selectEdition,
      hasEditions,
      activeTitle,
      activeReleaseDate,
      activeExternalIds,
    }),
    [
      editions,
      selectedEdition,
      selectedEditionId,
      selectEdition,
      hasEditions,
      activeTitle,
      activeReleaseDate,
      activeExternalIds,
    ],
  )

  return <GameEditionsContext.Provider value={value}>{children}</GameEditionsContext.Provider>
}

export const useGameEditionsContext = (): GameEditionsContextValue => {
  const ctx = useContext(GameEditionsContext)
  if (!ctx) {
    return {
      editions: [],
      selectedEdition: null,
      selectedEditionId: null,
      selectEdition: () => {},
      hasEditions: false,
      activeTitle: '',
      activeReleaseDate: null,
      activeExternalIds: {},
    }
  }
  return ctx
}
