import { useRef, useMemo, useEffect } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useInView } from 'framer-motion'
import { motion } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { UserRound, Music } from 'lucide-react'
import { useSearchBackfill } from '@search/hooks/use-search-backfill'
import { MediaGrid } from '@ui/molecules/media-grid'
import { Image } from '@ui/atoms/image'
import { Skeleton } from '@ui/atoms/skeleton'
import { mediaQueries } from '@/old-features/media/media-queries'
import { PersonCard } from '@/old-features/person/molecules/person-card'
import { personQueries } from '@/old-features/person/person-queries'
import { userQueries } from '@/old-features/user/user-queries'
import { DiscoverMediaCard } from '@discover/components/molecules/discover-media-card'
import { TYPE_OPTIONS } from '@search/components/molecules/search-sort-bar'

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
        <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
      ))}
    </MediaGrid>
  )
}

function SearchEmpty({ query, type }: { query: string; type: string }) {
  const typeLabel =
    type === 'all'
      ? ''
      : TYPE_OPTIONS.find((t) => t.value === type)?.label?.toLowerCase()
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-lg font-semibold text-muted-foreground">
        No results found
      </p>
      <p className="mt-1 text-sm text-muted-foreground/60">
        Nothing matches &quot;{query}&quot;
        {typeLabel ? ` in ${typeLabel}` : ''}. Try a different search.
      </p>
    </div>
  )
}

function SearchError() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-lg font-semibold text-muted-foreground">
        Something went wrong
      </p>
      <p className="mt-1 text-sm text-muted-foreground/60">
        Please try again in a moment.
      </p>
    </div>
  )
}

interface SearchResultsProps {
  query: string
  type: string
  sort: string
}

export function SearchResults({ query, type, sort }: SearchResultsProps) {
  const isPeopleOnly = type === 'people'
  const isUsersOnly = type === 'users'
  const includePeople = type === 'all' || isPeopleOnly
  const includeUsers = type === 'all' || isUsersOnly
  const searchType =
    type === 'all' || isPeopleOnly || isUsersOnly ? undefined : type

  const sentinelRef = useRef<HTMLDivElement>(null)
  const isSentinelInView = useInView(sentinelRef, {
    margin: '0px 0px 200px 0px',
  })

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...mediaQueries.search({
      query,
      type: searchType,
      sortBy: sort || undefined,
    }),
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

  // Backfill polling for newly discovered media items
  const knownIds = useMemo(() => new Set(items.map((i) => i.id)), [items])
  useSearchBackfill(query, knownIds, hasNextPage)

  // Auto-fetch next page when the sentinel enters the viewport
  useEffect(() => {
    if (isSentinelInView && hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage()
    }
  }, [isSentinelInView, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage])

  const hasResults =
    items.length > 0 ||
    people.length > 0 ||
    users.length > 0 ||
    tracks.length > 0

  const isInitialLoading =
    (!isPeopleOnly && !isUsersOnly && isLoading) ||
    (includePeople && isPeopleLoading) ||
    (includeUsers && isUsersLoading)

  const hasError =
    (!isPeopleOnly && !isUsersOnly && isError) ||
    (includePeople && isPeopleError) ||
    (includeUsers && isUsersError)

  return (
    <div>
      {isInitialLoading ? (
        <SearchSkeleton />
      ) : hasError ? (
        <SearchError />
      ) : !hasResults ? (
        <SearchEmpty query={query} type={type} />
      ) : (
        <>
          {/* Users section */}
          {includeUsers && users.length > 0 && (
            <section className="mb-8">
              <div className="mb-4 flex items-center gap-2 px-4 lg:px-8">
                <h2 className="text-lg font-semibold text-foreground/80">
                  Users
                </h2>
                <span className="text-sm text-muted-foreground/50">
                  {users.length.toLocaleString()} result
                  {users.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex gap-3 overflow-x-auto px-4 pb-2 lg:px-8">
                {users.map((user, i) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: Math.min(i * 0.03, 0.3),
                      duration: 0.2,
                    }}
                    className="shrink-0"
                  >
                    <Link
                      to="/u/$username"
                      params={{ username: user.username }}
                      className="group relative flex w-40 flex-col items-center rounded-xl bg-white/[0.03] p-4 text-center ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.06]"
                    >
                      {user.avatarUrl ? (
                        <Image
                          src={user.avatarUrl}
                          alt={user.username}
                          className="h-16 w-16 rounded-full"
                          fallback={
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
                              <UserRound
                                className="h-8 w-8 text-muted-foreground/50"
                                aria-hidden="true"
                              />
                            </div>
                          }
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
                          <UserRound
                            className="h-8 w-8 text-muted-foreground/50"
                            aria-hidden="true"
                          />
                        </div>
                      )}
                      <div className="mt-2">
                        {user.levelTitle && (
                          <p className="text-[10px] text-muted-foreground/40">
                            {user.levelTitle}
                          </p>
                        )}
                        <h3 className="max-w-[120px] truncate text-sm font-medium text-foreground/80">
                          {user.username}
                        </h3>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* People / Artists section */}
          {includePeople && people.length > 0 && (
            <section className="mb-8">
              <div className="mb-4 flex items-center gap-2 px-4 lg:px-8">
                <h2 className="text-lg font-semibold text-foreground/80">
                  Artists
                </h2>
                <span className="text-sm text-muted-foreground/50">
                  {people.length.toLocaleString()} result
                  {people.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex gap-3 overflow-x-auto px-4 pb-2 lg:px-8">
                {people.map((person, i) => (
                  <motion.div
                    key={person.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: Math.min(i * 0.03, 0.3),
                      duration: 0.2,
                    }}
                    className="shrink-0"
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

          {/* Tracks section */}
          {tracks.length > 0 && (
            <section className="mb-8">
              <div className="mb-4 flex items-center gap-2 px-4 lg:px-8">
                <h2 className="text-lg font-semibold text-foreground/80">
                  Tracks
                </h2>
                <span className="text-sm text-muted-foreground/50">
                  {tracks.length.toLocaleString()} result
                  {tracks.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-1 px-4 lg:px-8">
                {tracks.map((track, i) => (
                  <motion.div
                    key={track.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: Math.min(i * 0.03, 0.3),
                      duration: 0.2,
                    }}
                  >
                    <Link
                      to="/media/$mediaType/$mediaId"
                      params={{
                        mediaType: 'music',
                        mediaId: track.albumId,
                      }}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded">
                        {track.albumPosterUrl ? (
                          <Image
                            src={track.albumPosterUrl}
                            alt={track.albumTitle}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
                            <Music className="h-5 w-5 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium text-foreground/80">
                          {track.title}
                        </h3>
                        <p className="truncate text-xs text-muted-foreground/50">
                          {track.albumArtistName || 'Unknown Artist'} &mdash;{' '}
                          {track.albumTitle}
                        </p>
                      </div>
                      {track.durationMs != null && (
                        <span className="shrink-0 text-xs text-muted-foreground/40">
                          {formatTrackDuration(track.durationMs)}
                        </span>
                      )}
                    </Link>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* Total count */}
          {total !== undefined && (
            <p className="px-4 pb-2 text-sm text-muted-foreground/50 lg:px-8">
              {total.toLocaleString()} result{total !== 1 ? 's' : ''}
            </p>
          )}

          {/* Media items grid */}
          {items.length > 0 && (
            <MediaGrid className="px-4 lg:px-8">
              {items.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: Math.min(i * 0.03, 0.6),
                    duration: 0.2,
                  }}
                >
                  <DiscoverMediaCard item={item} />
                </motion.div>
              ))}
            </MediaGrid>
          )}

          {/* Loading more */}
          {isFetchingNextPage && <SearchSkeleton count={12} />}
        </>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} />
    </div>
  )
}
