import { useRef, useEffect } from 'react'
import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { mediaQueries } from '@media/queries/media-queries'
import { mediaKeys } from '@media/queries/media-keys'

export function useSearchBackfill(
  query: string,
  currentIds: Set<string>,
  hasMore: boolean | undefined,
) {
  const queryClient = useQueryClient()
  const polledIdsRef = useRef<Set<string>>(new Set())

  const { data: pollData } = useQuery({
    ...mediaQueries.pollSearch({
      query,
      knownIds: Array.from(currentIds).join(','),
    }),
    enabled: !!query && currentIds.size > 0 && hasMore,
  })

  useEffect(() => {
    if (!pollData?.items?.length) return
    const newItems = pollData.items.filter((item) => !polledIdsRef.current.has(item.id))
    if (newItems.length === 0) return
    newItems.forEach((item) => polledIdsRef.current.add(item.id))

    queryClient.setQueryData<InfiniteData<{ items: typeof pollData.items }>>(
      mediaKeys.search(query, 'all'),
      (prev) => {
        if (!prev) return prev
        const firstPage = prev.pages[0]
        return {
          ...prev,
          pages: [{ ...firstPage, items: [...newItems, ...firstPage.items] }, ...prev.pages.slice(1)],
        }
      },
    )
  }, [pollData, query, queryClient])
}
