import { useMemo, useRef, useEffect, startTransition } from 'react'
import { useParams, useSearch, useNavigate, Link } from '@tanstack/react-router'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { RotateCcw } from 'lucide-react'
import { mediaQueries, type MediaItemSummary } from '@media/queries/media-queries'
import { DkDropdown, type DkDropdownOption } from '@ui/atoms/dropdown'
import { MediaGrid } from '@ui/molecules/media-grid'
import { Skeleton } from '@ui/atoms/skeleton'
import { DiscoverMediaCard } from '@discover/components/molecules/discover-media-card'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { cn } from '@/lib/utils'
import type { GenreMediaType, GenreOption, GenreSearchParams } from '../types'
import {
  LANGUAGE_ALL,
  animeFilterValue,
  buildLanguageOptions,
  formatTitleCase,
  genreLanguageDropdownValue,
  parseAnimeFilter,
  parseMediaType,
  resolveGenreLanguageFilter,
  resolveSelectedGenres,
  resolveUserLanguage,
  serializeGenreSlugs,
  toggleGenreSelection,
} from '../utils'

const MEDIA_TYPE_OPTIONS: readonly DkDropdownOption[] = [
  { value: '', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'Shows' },
  { value: 'game', label: 'Games' },
]

const SORT_OPTIONS: readonly DkDropdownOption[] = [
  { value: 'popularity', label: 'Most Popular' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'release_date', label: 'Release Date' },
  { value: 'title', label: 'Title (A–Z)' },
]

const ANIME_OPTIONS: readonly DkDropdownOption[] = [
  { value: '', label: 'With anime' },
  { value: 'false', label: 'Without anime' },
  { value: 'true', label: 'Anime only' },
]

const MEDIA_TYPE_LABELS: Record<GenreMediaType, string> = {
  movie: 'Movies',
  show: 'Shows',
  game: 'Games',
}

export const GenrePage = () => {
  const params = useParams({ strict: false }) as { genreId?: string }
  const search = useSearch({ strict: false }) as GenreSearchParams
  const navigate = useNavigate()
  const { user } = useAuth()
  const countryCode = ((user as { country?: string })?.country || 'us').toLowerCase()

  const rawGenreId = params.genreId || 'action'
  const mediaType = parseMediaType(search.type)
  const isAnime = parseAnimeFilter(search.isAnime)
  const showAnimeFilter = mediaType !== 'game'
  const activeSort = search.sort || 'popularity'
  const activeDir = search.dir || (activeSort === 'title' ? 'asc' : 'desc')
  const selectedGenres = useMemo(
    () => resolveSelectedGenres(rawGenreId, search.genres),
    [rawGenreId, search.genres],
  )
  const selectedGenreSet = useMemo(() => new Set(selectedGenres), [selectedGenres])
  const genreFilterParam = selectedGenres.join(',')

  const userLanguage = useMemo(
    () =>
      resolveUserLanguage(
        user?.preferredLanguages,
        typeof navigator !== 'undefined' ? navigator.language : null,
      ),
    [user?.preferredLanguages],
  )

  const languageOptions = useMemo(
    () => buildLanguageOptions(user?.preferredLanguages),
    [user?.preferredLanguages],
  )

  const activeLanguage = resolveGenreLanguageFilter(search.language, userLanguage)
  const languageDropdownValue = genreLanguageDropdownValue(search.language, userLanguage)
  const hasCustomLanguage =
    search.language === LANGUAGE_ALL ||
    (Boolean(search.language) && search.language !== userLanguage)

  const { data: genres = [], isLoading: isLoadingGenres } = useQuery<GenreOption[]>({
    queryKey: ['genres', mediaType || 'all'],
    queryFn: async () => {
      const params = mediaType ? { media_type: mediaType } : undefined
      const { data } = await apiClient.get<GenreOption[]>('/media/genres', { params })
      return data
    },
    staleTime: 1000 * 60 * 60,
  })

  const genreNameBySlug = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of genres) {
      map.set(g.slug.toLowerCase(), g.name)
      map.set(String(g.id), g.name)
    }
    return map
  }, [genres])

  const pageTitle = useMemo(() => {
    if (selectedGenres.length === 0) return formatTitleCase(rawGenreId)
    return selectedGenres
      .map((slug) => genreNameBySlug.get(slug) || formatTitleCase(slug))
      .join(', ')
  }, [selectedGenres, genreNameBySlug, rawGenreId])

  const { data: certifications = [] } = useQuery<string[]>({
    queryKey: ['certifications', mediaType, countryCode],
    queryFn: async () => {
      const { data } = await apiClient.get<string[]>('/media/certifications', {
        params: { media_type: mediaType, country_code: countryCode },
      })
      return data
    },
    staleTime: 1000 * 60 * 60,
    enabled: Boolean(mediaType),
  })

  const certificationOptions: readonly DkDropdownOption[] = useMemo(() => [
    { value: '', label: 'All Ratings' },
    ...certifications.map((c) => ({ value: c, label: c })),
  ], [certifications])

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    ...mediaQueries.infiniteList({
      type: mediaType,
      genre: genreFilterParam,
      sortBy: activeSort,
      sortDir: activeDir,
      certification: search.certification || undefined,
      language: activeLanguage,
      isAnime: showAnimeFilter ? isAnime : undefined,
      limit: 48,
    }),
  })

  const items = useMemo(() => {
    const pages = data?.pages ?? []
    return pages.flatMap((p) => {
      const pageItems = (p as { items?: unknown } | undefined)?.items
      return Array.isArray(pageItems) ? (pageItems as MediaItemSummary[]) : []
    })
  }, [data])

  const total = data?.pages?.[0]?.total ?? items.length

  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Native IntersectionObserver — more reliable than framer useInView for
  // chaining pages while the sentinel stays near the viewport.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasNextPage || isLoading) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { root: null, rootMargin: '800px 0px', threshold: 0 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, isLoading, fetchNextPage, items.length])

  const typeLabel = mediaType ? MEDIA_TYPE_LABELS[mediaType] : 'Titles'
  const primaryGenreId = selectedGenres[0] || rawGenreId

  const navigateFilters = (nextSearch: GenreSearchParams, genreId = primaryGenreId) => {
    startTransition(() => {
      navigate({
        to: '/genre/$genreId',
        params: { genreId },
        search: nextSearch,
        replace: true,
      })
    })
  }

  const updateSearch = (updates: Partial<GenreSearchParams>) => {
    navigateFilters({ ...search, ...updates })
  }

  const clearFilters = () => {
    const nextSearch: GenreSearchParams = { ...search }
    delete nextSearch.sort
    delete nextSearch.dir
    delete nextSearch.certification
    delete nextSearch.isAnime
    delete nextSearch.language
    navigateFilters(nextSearch)
  }

  const handleMediaTypeChange = (value: string) => {
    const nextType = parseMediaType(value)
    const nextSearch: GenreSearchParams = { ...search }
    delete nextSearch.certification
    if (nextType) nextSearch.type = nextType
    else delete nextSearch.type
    if (nextType === 'game') delete nextSearch.isAnime
    navigateFilters(nextSearch)
  }

  const handleAnimeChange = (value: string) => {
    const next = parseAnimeFilter(value)
    const nextSearch: GenreSearchParams = { ...search }
    if (next === undefined) delete nextSearch.isAnime
    else nextSearch.isAnime = next
    navigateFilters(nextSearch)
  }

  const handleLanguageChange = (value: string) => {
    const nextSearch: GenreSearchParams = { ...search }
    if (value === LANGUAGE_ALL) {
      nextSearch.language = LANGUAGE_ALL
    } else if (value === userLanguage) {
      // Match the auto-selected default — keep the URL clean.
      delete nextSearch.language
    } else {
      nextSearch.language = value
    }
    navigateFilters(nextSearch)
  }

  const handleGenreSelect = (slug: string) => {
    const next = toggleGenreSelection(selectedGenres, slug)
    if (next.length === 0) {
      startTransition(() => {
        navigate({ to: '/genres' })
      })
      return
    }
    const nextSearch: GenreSearchParams = { ...search }
    const serialized = serializeGenreSlugs(next)
    if (serialized) nextSearch.genres = serialized
    else delete nextSearch.genres
    navigateFilters(nextSearch, next[0])
  }

  const handleSortChange = (value: string) => {
    const dir = value === 'title' ? 'asc' : 'desc'
    updateSearch({ sort: value, dir })
  }

  const handleCertificationChange = (value: string) => {
    updateSearch({ certification: value || undefined })
  }

  const hasActiveFilters = Boolean(
    search.certification ||
      search.sort ||
      isAnime !== undefined ||
      hasCustomLanguage,
  )

  return (
    <div id="genre-page" className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <Helmet>
        <title>{pageTitle} — Otix</title>
        <meta
          name="description"
          content={`Browse ${pageTitle} on Otix.`}
        />
      </Helmet>

      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between border-b border-white/[0.08] pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              {pageTitle}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mediaType
                ? `${MEDIA_TYPE_LABELS[mediaType]} in ${pageTitle}`
                : `All media in ${pageTitle}`}
            </p>
          </div>
          {(items.length > 0 || (!isLoading && total > 0)) && (
            <div className="shrink-0 text-right space-y-0.5">
              <p className="text-sm font-semibold text-white tabular-nums">
                {total.toLocaleString()} {typeLabel.toLowerCase()}
              </p>
              {items.length > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  Showing {items.length.toLocaleString()} of {total.toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
          <Link
            to="/genres"
            className="glass-inset px-3.5 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-white hover:bg-white/[0.08] transition-all shrink-0 inline-flex items-center gap-1.5 border border-white/[0.06]"
          >
            All
          </Link>
          {isLoadingGenres
            ? Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full shrink-0" />
              ))
            : genres.map((g) => {
                const isSelected = selectedGenreSet.has(g.slug.toLowerCase())
                return (
                  <button
                    key={g.slug}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleGenreSelect(g.slug)}
                    className={cn(
                      'inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 cursor-pointer',
                      isSelected
                        ? 'bg-white/20 text-white font-semibold shadow-inner border border-white/25'
                        : 'glass-inset text-muted-foreground hover:text-white hover:bg-white/[0.08]',
                    )}
                  >
                    {g.name}
                  </button>
                )
              })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <DkDropdown
          variant="filter"
          label="Type"
          options={MEDIA_TYPE_OPTIONS}
          value={mediaType || ''}
          onChange={handleMediaTypeChange}
        />

        <DkDropdown
          variant="filter"
          label="Language"
          options={languageOptions}
          value={languageDropdownValue}
          onChange={handleLanguageChange}
        />

        {showAnimeFilter && (
          <DkDropdown
            variant="filter"
            label="Anime"
            options={ANIME_OPTIONS}
            value={animeFilterValue(isAnime)}
            onChange={handleAnimeChange}
          />
        )}

        {mediaType && certifications.length > 0 && (
          <DkDropdown
            variant="filter"
            label="Rating"
            options={certificationOptions}
            value={search.certification || ''}
            onChange={handleCertificationChange}
          />
        )}

        <DkDropdown
          variant="filter"
          label="Sort"
          options={SORT_OPTIONS}
          value={activeSort}
          onChange={handleSortChange}
        />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors hover:bg-white/[0.06]"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>

      {isLoading ? (
        <MediaGrid>
          {Array.from({ length: 18 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
          ))}
        </MediaGrid>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-base font-semibold text-muted-foreground">Failed to load {pageTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Please try again in a few moments.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 px-4 py-2 rounded-full text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-base font-semibold text-muted-foreground">
            No titles found
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Nothing matches {pageTitle} with the current filters.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 px-4 py-2 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <MediaGrid>
            {items.map((item) => (
              <DiscoverMediaCard key={item.id} item={item} />
            ))}
          </MediaGrid>

          {isFetchingNextPage && (
            <MediaGrid>
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
              ))}
            </MediaGrid>
          )}

          {!hasNextPage && items.length > 0 && (
            <p className="text-xs text-muted-foreground/60 py-4 font-medium text-center tabular-nums">
              Showing {items.length.toLocaleString()} of {total.toLocaleString()}
            </p>
          )}

          {/* Infinite scroll sentinel — loads the next page as it nears the viewport */}
          <div ref={sentinelRef} className="h-8 w-full" aria-hidden />
        </div>
      )}
    </div>
  )
};
