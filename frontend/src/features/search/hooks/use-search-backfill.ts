import { useRef, useEffect } from 'react'
import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { mediaQueries } from '@media/queries/media-queries'
import { mediaKeys } from '@media/queries/media-keys'

export function useSearchBackfill(
  query: string,
  type: string,
  sort: string,
  currentIds: Set<string>,
  hasMore: boolean | undefined,
  backfillPending?: boolean,
) {
  const queryClient = useQueryClient()
  const polledIdsRef = useRef<Set<string>>(new Set())

  const searchType = type === 'all' || type === 'person' || type === 'user' ? undefined : type
  const sortBy = sort || undefined

  const { data: pollData } = useQuery({
    ...mediaQueries.pollSearch({
      query,
      type: searchType,
      knownIds: Array.from(currentIds).join(','),
    }),
    enabled: !!query && (Boolean(backfillPending) || (currentIds.size > 0 && Boolean(hasMore))),
    refetchInterval: backfillPending ? 2000 : false,
  })

  useEffect(() => {
    if (!Array.isArray(pollData?.items) || pollData.items.length === 0) return
    const newItems = pollData.items.filter((item) => !polledIdsRef.current.has(item.id))
    if (newItems.length === 0) return
    newItems.forEach((item) => polledIdsRef.current.add(item.id))

    queryClient.setQueryData<InfiniteData<{ items: typeof pollData.items }>>(
      mediaKeys.search({
        query,
        type: searchType,
        sortBy,
      }),
      (prev) => {
        if (!prev) return prev
        const firstPage = prev.pages[0]
        const existingItems = Array.isArray(firstPage?.items) ? firstPage.items : []
        return {
          ...prev,
          pages: [{ ...firstPage, items: [...newItems, ...existingItems] }, ...prev.pages.slice(1)],
        }
      },
    )
  }, [pollData, query, searchType, sortBy, queryClient])
}
