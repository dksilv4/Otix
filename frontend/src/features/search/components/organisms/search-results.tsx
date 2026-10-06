import { useRef, useMemo, useEffect } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useInView } from 'framer-motion'
import { motion } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { UserRound } from 'lucide-react'
import { useSearchBackfill } from '@search/hooks/use-search-backfill'
import { MediaGrid } from '@ui/molecules/media-grid'
import { Carousel } from '@ui/molecules/carousel'
import { Image } from '@ui/atoms/image'
import { Skeleton } from '@ui/atoms/skeleton'
import { apiClient } from '@/lib/api/client'
import { mediaQueries } from '@media/queries/media-queries'
import type { MediaItemSummary } from '@media/queries/media-queries'
import { useCuratedSections, type CuratedSectionConfig } from '@search/hooks/use-curated-sections'
import { PeopleCard } from '@people/components/molecules/people-card'
import { peopleQueries } from '@people/queries/people-queries'
import { userQueries } from '@/features/user/user-queries'
import { DiscoverMediaCard } from '@discover/components/molecules/discover-media-card'
import { DiscoverSectionError } from '@discover/components/molecules/discover-section-error'
import { MediaSectionSkeleton } from '@discover/components/molecules/discover-media-section-skeleton'
import { TYPE_OPTIONS } from '@search/components/molecules/search-sort-bar'

const SearchSkeleton = ({ count = 12 }: { count?: number }) => {
  return (
    <MediaGrid>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
      ))}
    </MediaGrid>
  )
};

const SearchEmpty = ({ query, type }: { query: string; type: string }) => {
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
};

const SearchError = () => {
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
};

interface SearchResultsProps {
  query: string
  type: string
  sort: string
}

const BestResultItem = ({ item }: { item: any }) => {
  const mediaType = item.mediaType

  if (mediaType === 'user') {
    return (
      <Link
        to="/u/$username"
        params={{ username: item.username }}
        className="group relative flex w-full aspect-[2/3] flex-col items-center justify-center rounded-xl bg-white/[0.03] p-6 text-center ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.06]"
      >
        <div className="flex flex-col items-center justify-center">
          {item.avatarUrl ? (
            <Image
              src={item.avatarUrl}
              alt={item.username}
              className="h-24 w-24 rounded-full object-cover ring-2 ring-white/10"
              fallback={
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/[0.04]">
                  <UserRound className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
                </div>
              }
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/[0.04]">
              <UserRound className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
            </div>
          )}
          <div className="mt-4">
            {item.levelTitle && (
              <p className="text-[10px] tracking-wider text-muted-foreground/40 uppercase">{item.levelTitle}</p>
            )}
            <h3 className="mt-1 max-w-[180px] truncate text-base font-bold text-foreground/90">
              {item.username}
            </h3>
            <p className="text-[10px] text-muted-foreground/50 mt-1 uppercase font-semibold">User</p>
          </div>
        </div>
      </Link>
    )
  }

  if (mediaType === 'person') {
    return (
      <PeopleCard
        id={item.id}
        name={item.name}
        imageUrl={item.photoUrl}
        role="Artist"
        className="!w-full aspect-[2/3]"
      />
    )
  }

  return <DiscoverMediaCard item={item} />
};

/** Fetches and renders one curated section carousel. */
const CuratedSectionCarousel = ({ section }: { section: CuratedSectionConfig }) => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['curated-section', section.id],
    queryFn: () =>
      apiClient
        .get<{ items: MediaItemSummary[] }>(`/discover/${section.mediaType}/popular`, {
          params: {
            genre: section.genre || undefined,
            is_anime: section.isAnime || undefined,
            language: section.language || undefined,
            limit: 20,
          },
        })
        .then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const sectionItems = Array.isArray(data?.items) ? data.items.filter(Boolean) : []
  if (isLoading && sectionItems.length === 0) {
    return (
      <section className="mb-10">
        <MediaSectionSkeleton />
      </section>
    )
  }
  if (isError && sectionItems.length === 0) {
    return (
      <section className="mb-10">
        <DiscoverSectionError title={section.title} onRetry={() => void refetch()} />
      </section>
    )
  }
  if (sectionItems.length === 0) return null

  return (
    <section className="mb-10">
      <Carousel title={section.title} minItemWidth={250} gap={12} showArrows>
        {sectionItems.map((item, i) => (
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
  )
};

export const SearchResults = ({ query, type, sort }: SearchResultsProps) => {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const isSentinelInView = useInView(sentinelRef, { margin: '0px 0px 600px 0px' })

  const isAllTypes = type === 'all'
  const isPeopleOnly = type === 'person'
  const isUsersOnly = type === 'user'

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

  // ── People-only query ─────────────────────────────────────────────
  const {
    data: peopleData,
    isLoading: isPeopleLoading,
    isError: isPeopleError,
  } = useQuery({
    ...peopleQueries.search(query, 40),
    enabled: query.length > 0 && isPeopleOnly,
  })

  // ── Users-only query ──────────────────────────────────────────────
  const {
    data: userData,
    isLoading: isUsersLoading,
    isError: isUsersError,
  } = useQuery({
    ...userQueries.search(query, 20),
    enabled: query.length > 0 && isUsersOnly,
  })

  // ── Derived state (flat infinite mode) ────────────────────────────
  const items = useMemo(
    () => data?.pages?.flatMap((page) => (Array.isArray(page?.items) ? page.items.filter(Boolean) : [])) ?? [],
    [data]
  )
  const people = useMemo(() => (Array.isArray(peopleData?.items) ? peopleData.items.filter(Boolean) : []), [peopleData])
  const users = useMemo(() => (Array.isArray(userData?.items) ? userData.items.filter(Boolean) : []), [userData])
  const total = data?.pages?.[0]?.total ?? undefined

  // Backfill polling for newly discovered media items
  const groupedIds = useMemo(() => {
    if (!isAllTypes || !groupedData) return new Set<string>()
    const ids = new Set<string>()
    groupedData.movies?.forEach((m) => m?.id && ids.add(m.id))
    groupedData.shows?.forEach((s) => s?.id && ids.add(s.id))
    groupedData.games?.forEach((g) => g?.id && ids.add(g.id))
    return ids
  }, [isAllTypes, groupedData])

  const knownIds = useMemo(
    () => (isAllTypes ? groupedIds : new Set(items.map((i) => i?.id).filter(Boolean))),
    [isAllTypes, groupedIds, items]
  )
  const backfillPending = isAllTypes
    ? Boolean(groupedData?.backfillPending)
    : Boolean(data?.pages?.[0]?.backfillPending)
  useSearchBackfill(query, type, sort, knownIds, hasNextPage, backfillPending)

  // Auto-fetch next page when the sentinel enters the viewport
  useEffect(() => {
    if (isSentinelInView && hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage()
    }
  }, [isSentinelInView, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage])

  // ── Curated sections ─────────────────────────────────────────────
  const { sections: curatedSections } = useCuratedSections(isAllTypes ? query : '')

  // ── Determine what to render ──────────────────────────────────────

  // Grouped view (type === 'all')
  if (isAllTypes) {
    const g = groupedData

    if (isGroupedLoading) return <SearchSkeleton />

    if (isGroupedError) return <SearchError />

    const bestResults = Array.isArray(g?.bestResults) ? g.bestResults.filter(Boolean) : []
    const gUsers = Array.isArray(g?.users) ? g.users.filter(Boolean) : []
    const gPeople = Array.isArray(g?.people) ? g.people.filter(Boolean) : []
    const gMovies = Array.isArray(g?.movies) ? g.movies.filter(Boolean) : []
    const gShows = Array.isArray(g?.shows) ? g.shows.filter(Boolean) : []
    const gGames = Array.isArray(g?.games) ? g.games.filter(Boolean) : []

    const hasResults = !!(
      gUsers.length ||
      gPeople.length ||
      gMovies.length ||
      gShows.length ||
      gGames.length
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

        {/* Curated sections based on query */}
        {curatedSections.length > 0 && (
          <div className="mb-8">
            {curatedSections.map((section) => (
              <CuratedSectionCarousel key={section.id} section={section} />
            ))}
          </div>
        )}

        {/* Best Results */}
        {bestResults.length > 0 && (
          <section className="mb-10">
            <Carousel
              title="Best Results"
              minItemWidth={250}
              gap={12}
              showArrows
            >
              {bestResults.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                >
                  <BestResultItem item={item} />
                </motion.div>
              ))}
            </Carousel>
          </section>
        )}

        {/* Users */}
        {gUsers.length > 0 && (
          <section className="mb-10">
            <Carousel
              title="Users"
              subtitle={`· ${(g?.usersCount ?? gUsers.length).toLocaleString()} result${(g?.usersCount ?? gUsers.length) !== 1 ? 's' : ''}`}
              viewAllLink="/search"
              viewAllSearch={{ q: query, type: 'user', sort }}
              minItemWidth={160}
              gap={12}
              showArrows
            >
              {gUsers.map((user, i) => (
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
        {gPeople.length > 0 && (
          <section className="mb-10">
            <Carousel
              title="Artists"
              subtitle={`· ${(g?.peopleCount ?? gPeople.length).toLocaleString()} result${(g?.peopleCount ?? gPeople.length) !== 1 ? 's' : ''}`}
              viewAllLink="/search"
              viewAllSearch={{ q: query, type: 'person', sort }}
              minItemWidth={140}
              gap={12}
              showArrows
            >
              {gPeople.map((person, i) => (
                <motion.div
                  key={person.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                >
                  <PeopleCard
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

        {/* Movies */}
        {gMovies.length > 0 && (
          <section className="mb-10">
            <Carousel
              title="Movies"
              subtitle={`· ${(g?.moviesCount ?? gMovies.length).toLocaleString()} result${(g?.moviesCount ?? gMovies.length) !== 1 ? 's' : ''}`}
              viewAllLink="/search"
              viewAllSearch={{ q: query, type: 'movie', sort }}
              minItemWidth={250}
              gap={12}
              showArrows
            >
              {gMovies.map((item, i) => (
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
        {gShows.length > 0 && (
          <section className="mb-10">
            <Carousel
              title="Shows"
              subtitle={`· ${(g?.showsCount ?? gShows.length).toLocaleString()} result${(g?.showsCount ?? gShows.length) !== 1 ? 's' : ''}`}
              viewAllLink="/search"
              viewAllSearch={{ q: query, type: 'show', sort }}
              minItemWidth={250}
              gap={12}
              showArrows
            >
              {gShows.map((item, i) => (
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
        {gGames.length > 0 && (
          <section className="mb-10">
            <Carousel
              title="Games"
              subtitle={`· ${(g?.gamesCount ?? gGames.length).toLocaleString()} result${(g?.gamesCount ?? gGames.length) !== 1 ? 's' : ''}`}
              viewAllLink="/search"
              viewAllSearch={{ q: query, type: 'game', sort }}
              minItemWidth={250}
              gap={12}
              showArrows
            >
              {gGames.map((item, i) => (
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
          {people.filter((person) => person && person.id).map((person) => (
            <PeopleCard
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
          {users.filter((user) => user && user.id).map((user) => (
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
    <div id="search-results">
      {/* Total count */}
      {total !== undefined && (
        <p className="px-4 pb-2 text-sm text-muted-foreground/50 lg:px-8">
          {total.toLocaleString()} result{total !== 1 ? 's' : ''}
        </p>
      )}

      {/* Media items grid */}
      {items.length > 0 && (
        <MediaGrid className="px-4 lg:px-8">
          {items.filter((item) => item && item.id).map((item, i) => (
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


      {/* Loading more */}
      {isFetchingNextPage && <SearchSkeleton count={12} />}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} />
    </div>
  )
};
