import type { GameEdition } from '../types'

export interface StoreBadge {
  id: string
  label: string
  externalId: string | number
}

export const formatEditionName = (edition: GameEdition | null, baseGameTitle: string): string => {
  if (!edition) return 'Standard Edition'
  if (edition.name) return edition.name
  return edition.rawTitle || baseGameTitle
}

export const getEditionYear = (releaseDate?: string | null): string | null => {
  if (!releaseDate) return null
  const match = releaseDate.match(/^(\d{4})/)
  return match ? match[1] : null
}

export const getEditionStores = (externalIds: Record<string, string | number>): StoreBadge[] => {
  const stores: StoreBadge[] = []
  if (externalIds.steam) {
    stores.push({ id: 'steam', label: 'Steam', externalId: externalIds.steam })
  }
  if (externalIds.gog) {
    stores.push({ id: 'gog', label: 'GOG', externalId: externalIds.gog })
  }
  if (externalIds.epic) {
    stores.push({ id: 'epic', label: 'Epic', externalId: externalIds.epic })
  }
  return stores
}
