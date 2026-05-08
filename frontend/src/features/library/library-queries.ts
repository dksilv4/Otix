import { useInfiniteQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { libraryKeys } from "./library-keys"

export interface LibraryResponse {
  items: Array<{
    id: string
    mediaType: string
    title: string
    slug: string
    posterUrl: string | null
    textlessPosterUrl: string | null
    logoUrl: string | null
    releaseDate: string | null
    popularity: number
    likeCount: number
    watchlistCount: number
    watchedCount: number
    playedCount: number
    userInteractions?: {
      liked: boolean
      watchlisted: boolean
      watched: boolean
      played: boolean
    } | null
  }>
  nextCursor: string | null
  hasMore: boolean
}

const LIBRARY_TABS = ["watchlist", "like", "watched", "played", "lists"] as const
export type LibraryTab = (typeof LIBRARY_TABS)[number]

export const TAB_LABELS: Record<LibraryTab, string> = {
  watchlist: "Watchlist",
  like: "Liked",
  watched: "Watched",
  played: "Played",
  lists: "Lists",
}

export function useLibraryTab(tab: LibraryTab) {
  return useInfiniteQuery({
    queryKey: libraryKeys.tab(tab),
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const params: Record<string, string> = { limit: "48" }
      if (pageParam) params.cursor = pageParam
      const { data } = await apiClient.get<LibraryResponse>("/library/" + tab, { params })
      return data
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 2,
  })
}
