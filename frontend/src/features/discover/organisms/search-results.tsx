import { useRef, useMemo, useEffect } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useInView } from 'framer-motion'
import { motion } from 'framer-motion'
import { MediaGrid } from '@ui/molecules/media-grid'
import { mediaQueries, type MediaListResponse } from '@media/media-queries'
import { mediaKeys } from '@media/media-keys'
import { PersonCard } from '@person/molecules/person-card'
import { personQueries } from '@person/person-queries'
import { DiscoverMediaCard } from '../molecules/discover-media-card'
import { TYPE_OPTIONS, type SortValue } from '../molecules/search-sort-bar'

function SearchSkeleton({ count = 12 }: { count?: number }) {
  return (
    <MediaGrid>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="aspect-[2/3] rounded-lg bg-[var(--dk-surface-glass)] animate-pulse"
        />
      ))}
    </MediaGrid>
  )
}

function SearchEmpty({ query, type }: { query: string; type: string }) {
  const typeLabel = type === 'all' ? '' : TYPE_OPTIONS.find((t) => t.value === type)?.label?.toLowerCase()
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-lg font-semibold text-foreground">No results found</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Nothing matches "{query}"{typeLabel ? ` in ${typeLabel}` : ''}. Try a different search.
      </p>
    </div>
  )
}

function SearchError() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-lg font-semibold text-foreground">Something went wrong</p>
      <p className="mt-1 text-sm text-muted-foreground">Please try again in a moment.</p>
    </div>
  )
}

export function SearchResults({ query, type, sortBy, pageSize = 24 }: { query: string; type: string; sortBy: SortValue; pageSize?: number }) {
  const isPeopleOnly = type === 'people'
  const includePeople = type === 'all' || isPeopleOnly
  const searchType = type === 'all' || isPeopleOnly ? undefined : type
  const sentinelRef = useRef<HTMLDivElement>(null)
  const isSentinelInView = useInView(sentinelRef, { margin: '0px 0px 200px 0px' })

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...mediaQueries.search({ query, type: searchType, sortBy: sortBy || undefined }),
    enabled: query.length > 0 && !isPeopleOnly,
  })

  const {
    data: peopleData,
    isLoading: isPeopleLoading,
    isError: isPeopleError,
  } = useQuery({
    ...personQueries.search(query, 10),
    enabled: query.length > 0 && includePeople,
  })

  const items = data?.pages.flatMap((page) => page.items) ?? []
  const people = peopleData?.items ?? []
  const total = data?.pages[0]?.total ?? undefined
  const backfillPending = data?.pages[0]?.backfillPending ?? false

  const queryClient = useQueryClient()
  const knownIds = useMemo(() => items.map((i) => i.id).join(','), [items])

  // Poll for backfill results
  useQuery({
    ...mediaQueries.pollSearch({
      query,
      type: searchType,
      knownIds,
    }),
    enabled: query.length > 0 && !isPeopleOnly && backfillPending,
    refetchInterval: backfillPending ? 3000 : false,
  })

  // Merge poll results into the infinite query cache
  const pollQueryKey = mediaKeys.searchPoll({
    query,
    type: searchType,
    knownIds,
  })
  const pollData = queryClient.getQueryData<MediaListResponse>(pollQueryKey)
  useEffect(() => {
    if (pollData && pollData.items && pollData.items.length > 0) {
      const searchKey = mediaKeys.search({
        query,
        type: searchType,
        sortBy: sortBy || undefined,
      })
      queryClient.setQueryData(searchKey, (old: InfiniteData<MediaListResponse> | undefined) => {
        if (!old) return old
        const existingIds = new Set(items.map((i) => i.id))
        const trulyNew = pollData.items.filter((item) => !existingIds.has(item.id))
        if (trulyNew.length === 0) return old
        return {
          pages: [
            {
              ...old.pages[0],
              items: [...trulyNew, ...old.pages[0].items],
              total: pollData.total,
              hasMore: pollData.hasMore || old.pages[0].hasMore,
              backfillPending: pollData.backfillPending,
            },
            ...old.pages.slice(1),
          ],
          pageParams: old.pageParams,
        }
      })
    }
  }, [pollData])

  // Auto-fetch next page when sentinel comes into view
  useEffect(() => {
    if (isSentinelInView && hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage()
    }
  }, [isSentinelInView, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage])

  const loadedCount = items.length
  const remainingCount = total != null ? Math.min(total - loadedCount, pageSize) : pageSize
  const hasResults = items.length > 0 || people.length > 0
  const isInitialLoading = (!isPeopleOnly && isLoading) || (includePeople && isPeopleLoading)
  const hasError = (!isPeopleOnly && isError) || (includePeople && isPeopleError)

  return (
    <div className="space-y-6">
      {isInitialLoading ? (
        <SearchSkeleton />
      ) : hasError ? (
        <SearchError />
      ) : !hasResults ? (
        <SearchEmpty query={query} type={type} />
      ) : (
        <>
          {includePeople && people.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Artists</h2>
                <span className="text-xs text-muted-foreground">
                  {people.length.toLocaleString()} result{people.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {people.map((person, i) => (
                  <motion.div
                    key={person.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                  >
                    <PersonCard
                      id={person.id}
                      name={person.name}
                      imageUrl={person.photoUrl}
                      role="Artist"
                    />
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {total !== undefined && (
            <p className="text-xs text-muted-foreground">
              {total.toLocaleString()} result{total !== 1 ? 's' : ''}
            </p>
          )}
          {items.length > 0 && (
            <MediaGrid>
              {items.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.6), duration: 0.2 }}
                >
                  <DiscoverMediaCard item={item} />
                </motion.div>
              ))}
            </MediaGrid>
          )}
          {isFetchingNextPage && <SearchSkeleton count={remainingCount} />}
        </>
      )}
      <div ref={sentinelRef} className="h-1" />
    </div>
  )
}
