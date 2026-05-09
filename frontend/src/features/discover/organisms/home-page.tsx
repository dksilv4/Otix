import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useInView } from 'framer-motion'
import { motion, AnimatePresence } from 'framer-motion'
import { MediaGrid } from '@ui/molecules/media-grid'
import { DkTabs, DkTabList, DkTab } from '@/features/dk-ui/molecules/tabs'
import { mediaQueries, type MediaListResponse } from '@media/media-queries'
import { mediaKeys } from '@media/media-keys'
import { ChatSearchInput } from '../molecules/chat-search-input'
import { DiscoverHero } from './discover-hero'
import { FilterDropdown, TYPE_OPTIONS, SORT_OPTIONS, type SortValue } from '../molecules/search-sort-bar'

const AnimatedShaderBackground = lazy(() => import('@/components/animated-shader-background'))
import { MediaSection } from './media-section'
import { DiscoverMediaCard } from '../molecules/discover-media-card'

const TYPE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'Shows' },
  { value: 'game', label: 'Games' },
] as const

const PLACEHOLDERS = [
  'Find your next obsession...',
  'Cue up a cozy night pick...',
  'Chase a new gaming rabbit hole...',
  'What vibe are we on today?',
]

const SECTIONS = [
  { title: 'Movies', mediaType: 'movie' as const, viewAllHref: '/search?type=movie' },
  { title: 'TV Shows', mediaType: 'show' as const, viewAllHref: '/search?type=show' },
  { title: 'Games', mediaType: 'game' as const, viewAllHref: '/search?type=game' },
]

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
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
  const typeLabel = type === 'all' ? '' : TYPE_TABS.find((t) => t.value === type)?.label?.toLowerCase()
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

function SearchResults({ query, type, sortBy, pageSize = 24 }: { query: string; type: string; sortBy: SortValue; pageSize?: number }) {
  const searchType = type === 'all' ? undefined : type
  const sentinelRef = useRef<HTMLDivElement>(null)
  const isSentinelInView = useInView(sentinelRef, { margin: '0px 0px 200px 0px' })

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...mediaQueries.search({ query, type: searchType, sortBy: sortBy || undefined }),
    enabled: query.length > 0,
  })

  const items = data?.pages.flatMap((page) => page.items) ?? []
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

  // Smart skeleton count: how many items remain to be loaded
  const loadedCount = items.length
  const remainingCount = total != null ? Math.min(total - loadedCount, pageSize) : pageSize

  return (
    <div className="space-y-6">
      {isLoading ? (
        <SearchSkeleton />
      ) : isError ? (
        <SearchError />
      ) : items.length === 0 ? (
        <SearchEmpty query={query} type={type} />
      ) : (
        <>
          {total !== undefined && (
            <p className="text-xs text-muted-foreground">
              {total.toLocaleString()} result{total !== 1 ? 's' : ''}
            </p>
          )}
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
          {isFetchingNextPage && <SearchSkeleton count={remainingCount} />}
        </>
      )}
      {/* Sentinel for infinite scroll — always in DOM so useInView can observe it */}
      <div ref={sentinelRef} className="h-1" />
    </div>
  )
}

export function HomePage() {
  const [query, setQuery] = useState('')
  const [activeType, setActiveType] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortValue>('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [greeting] = useState(() => getGreeting())
  const searchInputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Rotate placeholder text
  useEffect(() => {
    if (query) return
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [query])

  const isSearching = query.length > 0

  // Auto-scroll search input to top when search activates
  useEffect(() => {
    if (isSearching && searchInputRef.current) {
      searchInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [isSearching])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't capture when typing in another input
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Allow Escape to blur even when in the search input
      if (e.key === 'Escape' && target === inputRef.current) {
        setQuery('')
        ;(target as HTMLInputElement).blur()
      }
      return
    }

    if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault()
      inputRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="relative min-h-[calc(100vh-5rem)]">
      <Suspense fallback={null}>
        <AnimatedShaderBackground mode={isSearching ? 'active' : 'idle'} />
      </Suspense>

      <div className="relative z-10 flex flex-col items-center px-4 pb-16 w-full">
        {/* Top 3/4 empty → input at bottom 1/4 */}
        <div className="min-h-[75vh] flex flex-col justify-center items-center w-full gap-6">
          <div ref={searchInputRef} className="w-full max-w-3xl flex flex-col items-center">
            <p className="text-muted-foreground text-sm md:text-base font-medium mb-3">
              {greeting}
            </p>
            <ChatSearchInput
              ref={inputRef}
              value={query}
              onChange={setQuery}
              placeholder={query ? 'Search...' : PLACEHOLDERS[placeholderIndex]}
            />
            {/* Filter/sort pills — outside the glass card, 1rem below */}
            {isSearching && (
              <div className="flex items-center gap-2 mt-4">
                <FilterDropdown
                  label="Type"
                  options={TYPE_OPTIONS}
                  value={activeType === 'all' ? '' : activeType}
                  onChange={(v) => setActiveType(v || 'all')}
                />
                <FilterDropdown
                  label="Sort"
                  options={SORT_OPTIONS}
                  value={sortBy}
                  onChange={setSortBy}
                />
              </div>
            )}
          </div>
        </div>

        {/* DiscoverHero carousel — glassmorphism, tight to input */}
        {!isSearching && (
          <div className="w-full max-w-[1400px] mt-6 mb-12 rounded-[2rem] overflow-hidden bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] ring-1 ring-white/[0.04]">
            <DiscoverHero className="bg-transparent" />
          </div>
        )}

        {/* Content below hero */}
        <AnimatePresence mode="wait">
          {isSearching ? (
            <motion.div
              key={`search-${query}-${activeType}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -20 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="w-full"
            >
              <SearchResults query={query} type={activeType} sortBy={sortBy} />
            </motion.div>
          ) : (
            <motion.div
              key="discover"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98, y: -20 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="w-full space-y-8"
            >
              {/* Filter tabs — above the discover lists */}
              <div className="flex justify-center">
                <DkTabs defaultValue="all" value={activeType} onValueChange={setActiveType}>
                  <DkTabList>
                    {TYPE_TABS.map((tab) => (
                      <DkTab key={tab.value} value={tab.value}>
                        {tab.label}
                      </DkTab>
                    ))}
                  </DkTabList>
                </DkTabs>
              </div>

              {SECTIONS.filter(s => activeType === 'all' || s.mediaType === activeType).map((section) => (
                <MediaSection key={section.mediaType} {...section} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
