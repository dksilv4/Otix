import { useRef, useMemo, useEffect } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useInView } from 'framer-motion'
import { motion } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { UserRound, Music } from 'lucide-react'
import { MediaGrid } from '@ui/molecules/media-grid'
import { mediaQueries, type MediaListResponse } from '@media/media-queries'
import { mediaKeys } from '@media/media-keys'
import { PersonCard } from '@person/molecules/person-card'
import { personQueries } from '@person/person-queries'
import { userQueries } from '@user/user-queries'
import { DiscoverMediaCard } from '../molecules/discover-media-card'
import { Image } from '@ui/atoms/image'
import { TYPE_OPTIONS, type SortValue } from '../molecules/search-sort-bar'

function formatTrackDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

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
  const isUsersOnly = type === 'users'
  const includePeople = type === 'all' || isPeopleOnly
  const includeUsers = type === 'all' || isUsersOnly
  const searchType = type === 'all' || isPeopleOnly || isUsersOnly ? undefined : type
  const sentinelRef = useRef<HTMLDivElement>(null)
  const isSentinelInView = useInView(sentinelRef, { margin: '0px 0px 200px 0px' })

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...mediaQueries.search({ query, type: searchType, sortBy: sortBy || undefined }),
    enabled: query.length > 0 && !isPeopleOnly && !isUsersOnly,
  })

  const {
    data: peopleData,
    isLoading: isPeopleLoading,
    isError: isPeopleError,
  } = useQuery({
    ...personQueries.search(query, 10),
    enabled: query.length > 0 && includePeople,
  })

  const {
    data: userData,
    isLoading: isUsersLoading,
    isError: isUsersError,
  } = useQuery({
    ...userQueries.search(query, 20),
    enabled: query.length > 0 && includeUsers,
  })

  const items = data?.pages.flatMap((page) => page.items) ?? []
  const tracks = data?.pages[0]?.tracks ?? []
  const people = peopleData?.items ?? []
  const users = userData?.items ?? []
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
  const hasResults = items.length > 0 || people.length > 0 || users.length > 0 || tracks.length > 0
  const isInitialLoading = (!isPeopleOnly && !isUsersOnly && isLoading) || (includePeople && isPeopleLoading) || (includeUsers && isUsersLoading)
  const hasError = (!isPeopleOnly && !isUsersOnly && isError) || (includePeople && isPeopleError) || (includeUsers && isUsersError)

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
          {includeUsers && users.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Users</h2>
                <span className="text-xs text-muted-foreground">
                  {users.length.toLocaleString()} result{users.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {users.map((user, i) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                  >
                    <Link
                      to="/u/$username"
                      params={{ username: user.username }}
                      className="group relative h-48 w-28 shrink-0 overflow-hidden rounded-lg bg-muted shadow-[0_4px_16px_rgb(0_0_0/0.2)] transition-[transform,box-shadow] duration-300 ease-out hover:scale-[1.02] hover:shadow-[0_20px_40px_rgb(0_0_0/0.35)] active:scale-[1.01] sm:h-52 sm:w-32 block outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {user.avatarUrl ? (
                        <Image
                          src={user.avatarUrl}
                          alt={user.username}
                          className="absolute inset-0 h-full w-full rounded-lg transition-transform duration-500 ease-out group-hover:scale-[1.08]"
                          fallback={
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 text-white/45">
                              <UserRound className="h-10 w-10" aria-hidden="true" />
                            </div>
                          }
                        />
                      ) : (
                        <div className="absolute inset-0 flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 text-white/45 transition-transform duration-500 ease-out group-hover:scale-[1.08]">
                          <UserRound className="h-10 w-10" aria-hidden="true" />
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-t from-black/90 via-black/45 to-transparent opacity-90 transition-opacity duration-300 group-hover:opacity-95" />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 text-white">
                        {user.levelTitle && (
                          <p className="mb-1 text-[11px] font-medium uppercase leading-tight text-white/75 truncate">
                            {user.levelTitle}
                          </p>
                        )}
                        <h3 className="truncate text-sm font-semibold leading-tight text-white drop-shadow-[0_2px_8px_rgb(0_0_0/0.75)] sm:text-base">
                          {user.username}
                        </h3>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

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

          {tracks.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Tracks</h2>
                <span className="text-xs text-muted-foreground">
                  {tracks.length.toLocaleString()} result{tracks.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {tracks.map((track, i) => (
                  <motion.div
                    key={track.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                  >
                    <Link
                      to="/media/$mediaType/$mediaId"
                      params={{ mediaType: 'music', mediaId: track.albumId }}
                      className="group relative flex h-20 w-72 shrink-0 items-center gap-3 overflow-hidden rounded-lg bg-[var(--dk-surface-glass)] p-2 transition-[transform,box-shadow] duration-300 ease-out hover:scale-[1.02] hover:shadow-[0_8px_24px_rgb(0_0_0/0.25)] active:scale-[1.01] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                        {track.albumPosterUrl ? (
                          <Image
                            src={track.albumPosterUrl}
                            alt={track.albumTitle}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                            <Music className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium text-foreground">{track.title}</h3>
                        <p className="truncate text-xs text-muted-foreground">
                          {track.albumArtistName || 'Unknown Artist'} — {track.albumTitle}
                        </p>
                      </div>
                      {track.durationMs != null && (
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatTrackDuration(track.durationMs)}
                        </span>
                      )}
                    </Link>
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
