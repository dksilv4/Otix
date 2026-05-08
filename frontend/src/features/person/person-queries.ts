import { queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface PersonCredit {
  id: string
  mediaItem: {
    id: string
    mediaType: string
    title: string
    slug: string
    posterUrl: string | null
    releaseDate: string | null
  }
  role: string
  characterName?: string
  sortOrder: number
}

export interface PersonDetail {
  id: string
  name: string
  photoUrl: string | null
  bio: string | null
  birthDate: string | null
  deathDate: string | null
  birthplace: string | null
  knownFor: string | null
  credits: PersonCredit[]
}

export const personQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: ['person', id],
      queryFn: async () => {
        const { data } = await apiClient.get<PersonDetail>(`/person/${id}`)
        return data
      },
      staleTime: 1000 * 60 * 10,
    }),
}
