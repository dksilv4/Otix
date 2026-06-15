import { useRef, useMemo, useEffect } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useInView } from 'framer-motion'
import { motion } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { UserRound, Music } from 'lucide-react'
import { useSearchBackfill } from '@search/hooks/use-search-backfill'
import { MediaGrid } from '@ui/molecules/media-grid'
import { Carousel } from '@ui/molecules/carousel'
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

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-4 flex items-center gap-2 px-4 lg:px-8">
      <h2 className="text-lg font-semibold text-foreground/80">{title}</h2>
      <span className="text-sm text-muted-foreground/50">
        {count.toLocaleString()} result{count !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

export function SearchResults({ query, type, sort }: SearchResultsProps) {
  const isAllTypes = type === 'all'
  const isPeopleOnly = type === 'people'
  const isUsersOnly = type === 'users'

  // ── Grouped search (type === 'all') ───────────────────────────────
  const {
    data: groupedData,
    isLoading: isGroupedLoading,
    isError: isGroupedError,
  } = useQuery({
    ...mediaQueries.structuredSearch(query),
    enabled: query.length > 0 && isAllTypes,
  })

  // ── Infinite search (specific media types) ────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null)
  const isSentinelInView = useInView(sentinelRef, {
    margin: '0px 0px 200px 0px',
  })

  const searchType = isPeopleOnly || isUsersOnly ? undefined : type

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
    enabled: query.length > 0 && !isAllTypes && !isPeopleOnly && !isUsersOnly,
  })

  // ── People-only search ────────────────────────────────────────────
  const {
    data: peopleData,
    isLoading: isPeopleLoading,
    isError: isPeopleError,
  } = useQuery({
    ...personQueries.search(query, 10),
    enabled: query.length > 0 && isPeopleOnly,
  })

  // ── Users-only search ─────────────────────────────────────────────
  const {
    data: userData,
    isLoading: isUsersLoading,
    isError: isUsersError,
  } = useQuery({
    ...userQueries.search(query, 20),
    enabled: query.length > 0 && isUsersOnly,
  })

  // ── Derived state (flat infinite mode) ────────────────────────────
  const items = data?.pages.flatMap((page) => page.items) ?? []
  const tracks = data?.pages[0]?.tracks ?? []
  const people = peopleData?.items ?? []
  const users = userData?.items ?? []
  const total = data?.pages[0]?.total ?? undefined

  // Backfill polling for newly discovered media items (infinite mode only)
  const knownIds = useMemo(() => new Set(items.map((i) => i.id)), [items])
  useSearchBackfill(query, knownIds, hasNextPage)

  // Auto-fetch next page when the sentinel enters the viewport
  useEffect(() => {
    if (isSentinelInView && hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage()
    }
  }, [isSentinelInView, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage])

  // ── Determine what to render ──────────────────────────────────────

  // Grouped view (type === 'all')
  if (isAllTypes) {
    const g = groupedData

    if (isGroupedLoading) return <SearchSkeleton />

    if (isGroupedError) return <SearchError />

    const hasResults = !!(
      g?.users?.length ||
      g?.people?.length ||
      g?.tracks?.length ||
      g?.movies?.length ||
      g?.shows?.length ||
      g?.games?.length ||
      g?.music?.length
    )

    if (!hasResults) return <SearchEmpty query={query} type={type} />

    return (
      <div>
        {/* Total count */}
        {g?.total !== undefined && g.total > 0 && (
          <p className="mb-6 px-4 text-sm text-muted-foreground/50 lg:px-8">
            {g.total.toLocaleString()} result{g.total !== 1 ? 's' : ''}
          </p>
        )}

        {/* Users */}
        {g?.users && g.users.length > 0 && (
          <section className="mb-10">
            <SectionHeader title="Users" count={g.users.length} />
            <Carousel minItemWidth={160} gap={12} showArrows>
              {g.users.map((user, i) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                >
                  <Link
                    to="/u/$username"
                    params={{ username: user.username }}
                    className="group relative flex w-full flex-col items-center rounded-xl bg-white/[0.03] p-4 text-center ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.06]"
                  >
                    {user.avatarUrl ? (
                      <Image
                        src={user.avatarUrl}
                        alt={user.username}
                        className="h-16 w-16 rounded-full"
                        fallback={
                          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
                            <UserRound className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
                          </div>
                        }
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
                        <UserRound className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
                      </div>
                    )}
                    <div className="mt-2">
                      {user.levelTitle && (
                        <p className="text-[10px] text-muted-foreground/40">{user.levelTitle}</p>
                      )}
                      <h3 className="max-w-[120px] truncate text-sm font-medium text-foreground/80">
                        {user.username}
                      </h3>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </Carousel>
          </section>
        )}

        {/* People / Artists */}
        {g?.people && g.people.length > 0 && (
          <section className="mb-10">
            <SectionHeader title="Artists" count={g.people.length} />
            <Carousel minItemWidth={140} gap={12} showArrows>
              {g.people.map((person, i) => (
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
                    className="!w-full"
                  />
                </motion.div>
              ))}
            </Carousel>
          </section>
        )}

        {/* Tracks */}
        {g?.tracks && g.tracks.length > 0 && (
          <section className="mb-10">
            <SectionHeader title="Tracks" count={g.tracks.length} />
            <div className="mx-auto max-w-[900px] space-y-1 px-4 lg:px-8">
              {g.tracks.map((track, i) => (
                <motion.div
                  key={track.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                >
                  <Link
                    to="/media/$mediaType/$mediaId"
                    params={{ mediaType: 'music', mediaId: track.albumId }}
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
                      <h3 className="truncate text-sm font-medium text-foreground/80">{track.title}</h3>
                      <p className="truncate text-xs text-muted-foreground/50">
                        {track.albumArtistName || 'Unknown Artist'} &mdash; {track.albumTitle}
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

        {/* Movies */}
        {g?.movies && g.movies.length > 0 && (
          <section className="mb-10">
            <SectionHeader title="Movies" count={g.movies.length} />
            <Carousel minItemWidth={180} gap={16} showArrows className="px-4 lg:px-8">
              {g.movies.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                >
                  <DiscoverMediaCard item={item} />
                </motion.div>
              ))}
            </Carousel>
          </section>
        )}

        {/* Shows */}
        {g?.shows && g.shows.length > 0 && (
          <section className="mb-10">
            <SectionHeader title="Shows" count={g.shows.length} />
            <Carousel minItemWidth={180} gap={16} showArrows className="px-4 lg:px-8">
              {g.shows.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                >
                  <DiscoverMediaCard item={item} />
                </motion.div>
              ))}
            </Carousel>
          </section>
        )}

        {/* Games */}
        {g?.games && g.games.length > 0 && (
          <section className="mb-10">
            <SectionHeader title="Games" count={g.games.length} />
            <Carousel minItemWidth={180} gap={16} showArrows className="px-4 lg:px-8">
              {g.games.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                >
                  <DiscoverMediaCard item={item} />
                </motion.div>
              ))}
            </Carousel>
          </section>
        )}

        {/* Music */}
        {g?.music && g.music.length > 0 && (
          <section className="mb-10">
            <SectionHeader title="Music" count={g.music.length} />
            <Carousel minItemWidth={180} gap={16} showArrows className="px-4 lg:px-8">
              {g.music.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                >
                  <DiscoverMediaCard item={item} />
                </motion.div>
              ))}
            </Carousel>
          </section>
        )}
      </div>
    )
  }

  // ── People-only view ──────────────────────────────────────────────
  if (isPeopleOnly) {
    if (isPeopleLoading) return <SearchSkeleton count={10} />
    if (isPeopleError) return <SearchError />
    if (!people.length) return <SearchEmpty query={query} type={type} />

    return (
      <div className="px-4 lg:px-8">
        <p className="mb-4 text-sm text-muted-foreground/50">
          {people.length.toLocaleString()} result{people.length !== 1 ? 's' : ''}
        </p>
        <MediaGrid>
          {people.map((person) => (
            <PersonCard
              key={person.id}
              id={person.id}
              name={person.name}
              imageUrl={person.photoUrl}
              role="Artist"
            />
          ))}
        </MediaGrid>
      </div>
    )
  }

  // ── Users-only view ───────────────────────────────────────────────
  if (isUsersOnly) {
    if (isUsersLoading) return <SearchSkeleton count={10} />
    if (isUsersError) return <SearchError />
    if (!users.length) return <SearchEmpty query={query} type={type} />

    return (
      <div className="px-4 lg:px-8">
        <p className="mb-4 text-sm text-muted-foreground/50">
          {users.length.toLocaleString()} result{users.length !== 1 ? 's' : ''}
        </p>
        <MediaGrid>
          {users.map((user) => (
            <Link
              key={user.id}
              to="/u/$username"
              params={{ username: user.username }}
              className="group relative flex w-full flex-col items-center rounded-xl bg-white/[0.03] p-4 text-center ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.06]"
            >
              {user.avatarUrl ? (
                <Image
                  src={user.avatarUrl}
                  alt={user.username}
                  className="h-16 w-16 rounded-full"
                  fallback={
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
                      <UserRound className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
                    </div>
                  }
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
                  <UserRound className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
                </div>
              )}
              <div className="mt-2">
                {user.levelTitle && (
                  <p className="text-[10px] text-muted-foreground/40">{user.levelTitle}</p>
                )}
                <h3 className="max-w-[120px] truncate text-sm font-medium text-foreground/80">
                  {user.username}
                </h3>
              </div>
            </Link>
          ))}
        </MediaGrid>
      </div>
    )
  }

  // ── Specific media type (infinite scroll) ─────────────────────────
  if (isLoading) return <SearchSkeleton />

  if (isError) return <SearchError />

  const hasInfiniteResults = items.length > 0

  if (!hasInfiniteResults) return <SearchEmpty query={query} type={type} />

  return (
    <div>
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
              transition={{ delay: Math.min(i * 0.03, 0.6), duration: 0.2 }}
            >
              <DiscoverMediaCard item={item} />
            </motion.div>
          ))}
        </MediaGrid>
      )}

      {/* Tracks (returned alongside paginated results) */}
      {tracks.length > 0 && (
        <section className="mb-8 mt-8">
          <SectionHeader title="Tracks" count={tracks.length} />
          <div className="mx-auto max-w-[900px] space-y-1 px-4 lg:px-8">
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
                  className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04]"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded">
                    {track.albumPosterUrl ? (
                      <Image src={track.albumPosterUrl} alt={track.albumTitle} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
                        <Music className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-foreground/80">{track.title}</h3>
                    <p className="truncate text-xs text-muted-foreground/50">
                      {track.albumArtistName || 'Unknown Artist'} &mdash; {track.albumTitle}
                    </p>
                  </div>
                  {track.durationMs != null && (
                    <span className="shrink-0 text-xs text-muted-foreground/40">{formatTrackDuration(track.durationMs)}</span>
                  )}
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Loading more */}
      {isFetchingNextPage && <SearchSkeleton count={12} />}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} />
    </div>
  )
}
