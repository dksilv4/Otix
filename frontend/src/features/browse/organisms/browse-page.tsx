import { useState } from 'react'
import { useParams, useSearch, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { Film, Tv, Gamepad2, Music, ChevronLeft, ChevronRight } from 'lucide-react'
import { mediaQueries, type MediaItemSummary } from '@/features/media/media-queries'
import { SORT_OPTIONS } from '@/features/discover/molecules/search-sort-bar'
import { DkDropdown } from '@/features/dk-ui/atoms/dropdown'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { MediaCard } from '@/features/ui/molecules/media-card'
import { MediaGrid } from '@/features/ui/molecules/media-grid'
import { Skeleton } from '@ui/atoms/skeleton'

const BROWSE_TYPES = [
  { value: 'movie', label: 'Movies', Icon: Film },
  { value: 'show', label: 'Shows', Icon: Tv },
  { value: 'game', label: 'Games', Icon: Gamepad2 },
  { value: 'music', label: 'Music', Icon: Music },
] as const

const BROWSE_SORT_OPTIONS = SORT_OPTIONS.filter((o) => o.value !== '') as readonly { value: string; label: string }[]

interface GenreOption {
  id: string
  name: string
  slug: string
}

function BrowseSkeleton() {
  return (
    <MediaGrid>
      {Array.from({ length: 24 }).map((_, i) => (
        <Skeleton key={i} className="aspect-[2/3] rounded-2xl" />
      ))}
    </MediaGrid>
  )
}

export function BrowsePage() {
  const params = useParams({ strict: false }) as { type?: string }
  const search = useSearch({ strict: false }) as { genre?: string; language?: string; isAnime?: string }
  const mediaType = params.type || 'movie'

  const initialGenre = search.genre || ''
  const initialLanguage = search.language || undefined
  const initialIsAnime = search.isAnime === 'true' ? true : search.isAnime === 'false' ? false : undefined

  const [sortBy, setSortBy] = useState('popularity')
  const [selectedGenre, setSelectedGenre] = useState(initialGenre)
  const [page, setPage] = useState(1)

  // Fetch genres for this media type
  const { data: genres } = useQuery({
    queryKey: ['genres', mediaType],
    queryFn: async () => {
      const { data } = await apiClient.get<GenreOption[]>('/media/genres', {
        params: { media_type: mediaType },
      })
      return data
    },
    staleTime: 1000 * 60 * 30,
  })

  const genreOptions = [
    { value: '', label: 'All Genres' },
    ...(genres ?? []).map((g) => ({ value: g.slug, label: g.name })),
  ]

  // Fetch media
  const { data, isLoading, isFetching } = useQuery({
    ...mediaQueries.list({
      type: mediaType,
      genre: selectedGenre || undefined,
      language: initialLanguage,
      isAnime: initialIsAnime,
      hasArtwork: !initialLanguage && initialIsAnime == null,
      sortBy,
      page,
      limit: 48,
    }),
    placeholderData: (prev) => prev,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const hasMore = data?.hasMore ?? false
  const totalPages = Math.ceil(total / 48)

  const handleSortChange = (value: string) => {
    setSortBy(value)
    setPage(1)
  }

  const handleGenreChange = (value: string) => {
    setSelectedGenre(value)
    setPage(1)
  }

  const typeLabel = BROWSE_TYPES.find((t) => t.value === mediaType)?.label ?? 'Movies'

  return (
    <div className="pb-16">
      <Helmet>
        <title>{`Browse ${typeLabel} - Otix`}</title>
      </Helmet>

      {/* Header */}
      <div className="mb-8 space-y-6">
        {/* Type tabs */}
        <div className="flex items-center gap-2">
          {BROWSE_TYPES.map(({ value, label, Icon }) => (
            <Link
              key={value}
              to={`/browse/$type`}
              params={{ type: value }}
              className={cn(
                'inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-200',
                mediaType === value
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'bg-[var(--dk-surface-glass)] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass-hover)]',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>

        {/* Filters bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DkDropdown
              variant="filter"
              label="Sort"
              options={BROWSE_SORT_OPTIONS}
              value={sortBy}
              onChange={handleSortChange}
            />
            {genres && genres.length > 0 && (
              <DkDropdown
                variant="filter"
                label="Genre"
                options={genreOptions}
                value={selectedGenre}
                onChange={handleGenreChange}
              />
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {total.toLocaleString()} {typeLabel.toLowerCase()}
          </span>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <BrowseSkeleton />
      ) : items.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No {typeLabel.toLowerCase()} found{selectedGenre ? ' for this genre' : ''}.
          </p>
        </div>
      ) : (
        <>
          <div className={cn('transition-opacity duration-200', isFetching && 'opacity-60')}>
            <MediaGrid>
              {items.map((item: MediaItemSummary) => (
                <MediaCard
                  key={item.id}
                  id={item.id}
                  mediaType={item.mediaType as 'movie' | 'show' | 'game' | 'music'}
                  title={item.title}
                  posterUrl={item.posterUrl}
                  textlessPosterUrl={item.textlessPosterUrl}
                  logoUrl={item.logoUrl}
                  releaseDate={item.releaseDate}
                  avgRating={item.avgRating}
                />
              ))}
            </MediaGrid>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-10">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--dk-surface-glass)] px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass-hover)] transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--dk-surface-glass)] px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass-hover)] transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
