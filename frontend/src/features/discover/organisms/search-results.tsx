// TODO: Review this file
import './search-results.scss'
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
          className="dk-discover-search-results__skeleton"
        />
      ))}
    </MediaGrid>
  )
}

function SearchEmpty({ query, type }: { query: string; type: string }) {
  const typeLabel = type === 'all' ? '' : TYPE_OPTIONS.find((t) => t.value === type)?.label?.toLowerCase()
  return (
    <div className="dk-discover-search-results__empty">
      <p className="dk-discover-search-results__empty-heading">No results found</p>
      <p className="dk-discover-search-results__empty-text">
        Nothing matches &quot;{query}&quot;{typeLabel ? ` in ${typeLabel}` : ''}. Try a different search.
      </p>
    </div>
  )
}

function SearchError() {
  return (
    <div className="dk-discover-search-results__error">
      <p className="dk-discover-search-results__error-heading">Something went wrong</p>
      <p className="dk-discover-search-results__error-text">Please try again in a moment.</p>
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
    <div className="dk-discover-search-results">
      {isInitialLoading ? (
        <SearchSkeleton />
      ) : hasError ? (
        <SearchError />
      ) : !hasResults ? (
        <SearchEmpty query={query} type={type} />
      ) : (
        <>
          {includeUsers && users.length > 0 && (
            <section className="dk-discover-search-results__section">
              <div className="dk-discover-search-results__header">
                <h2 className="dk-discover-search-results__heading">Users</h2>
                <span className="dk-discover-search-results__count">
                  {users.length.toLocaleString()} result{users.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="dk-discover-search-results__scroll">
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
                      className="dk-discover-search-results__user-card"
                    >
                      {user.avatarUrl ? (
                        <Image
                          src={user.avatarUrl}
                          alt={user.username}
                          className="dk-discover-search-results__user-card-avatar"
                          fallback={
                            <div className="dk-discover-search-results__user-card-avatar-placeholder">
                              <UserRound className="h-10 w-10" aria-hidden="true" />
                            </div>
                          }
                        />
                      ) : (
                        <div className="dk-discover-search-results__user-card-avatar dk-discover-search-results__user-card-avatar-placeholder">
                          <UserRound className="h-10 w-10" aria-hidden="true" />
                        </div>
                      )}
                      <div className="dk-discover-search-results__user-card-overlay" />
                      <div className="dk-discover-search-results__user-card-info">
                        {user.levelTitle && (
                          <p className="dk-discover-search-results__user-card-level">
                            {user.levelTitle}
                          </p>
                        )}
                        <h3 className="dk-discover-search-results__user-card-name">
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
            <section className="dk-discover-search-results__section">
              <div className="dk-discover-search-results__header">
                <h2 className="dk-discover-search-results__heading">Artists</h2>
                <span className="dk-discover-search-results__count">
                  {people.length.toLocaleString()} result{people.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="dk-discover-search-results__scroll">
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
            <section className="dk-discover-search-results__section">
              <div className="dk-discover-search-results__header">
                <h2 className="dk-discover-search-results__heading">Tracks</h2>
                <span className="dk-discover-search-results__count">
                  {tracks.length.toLocaleString()} result{tracks.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="dk-discover-search-results__scroll">
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
                      className="dk-discover-search-results__track-card"
                    >
                      <div className="dk-discover-search-results__track-thumb">
                        {track.albumPosterUrl ? (
                          <Image
                            src={track.albumPosterUrl}
                            alt={track.albumTitle}
                            className="dk-discover-search-results__track-thumb-image"
                          />
                        ) : (
                          <div className="dk-discover-search-results__track-thumb-fallback">
                            <Music className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                      <div className="dk-discover-search-results__track-info">
                        <h3 className="dk-discover-search-results__track-title">{track.title}</h3>
                        <p className="dk-discover-search-results__track-artist">
                          {track.albumArtistName || 'Unknown Artist'} &mdash; {track.albumTitle}
                        </p>
                      </div>
                      {track.durationMs != null && (
                        <span className="dk-discover-search-results__track-duration">
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
            <p className="dk-discover-search-results__total">
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
      <div ref={sentinelRef} className="dk-discover-search-results__sentinel" />
    </div>
  )
}
