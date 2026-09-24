import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { ArrowLeft, Film, Tv, Gamepad2, Music, Search, Grid } from 'lucide-react'
import { MediaGrid } from '@ui/molecules/media-grid'
import { Skeleton } from '@ui/atoms/skeleton'
import { apiClient } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { GenreCard } from '../components/genre-card'
import type { GenreOption } from '../types'

const MEDIA_TYPES = [
  { value: '', label: 'All', icon: Grid },
  { value: 'movie', label: 'Movies', icon: Film },
  { value: 'show', label: 'Shows', icon: Tv },
  { value: 'game', label: 'Games', icon: Gamepad2 },
  { value: 'music', label: 'Music', icon: Music },
] as const

export function GenresDirectoryPage() {
  const [selectedType, setSelectedType] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: genres = [], isLoading } = useQuery<GenreOption[]>({
    queryKey: ['genres', selectedType || 'all'],
    queryFn: async () => {
      const params = selectedType ? { media_type: selectedType } : undefined
      const { data } = await apiClient.get<GenreOption[]>('/media/genres', { params })
      return data
    },
    staleTime: 1000 * 60 * 60,
  })

  // Filter genres by search query
  const filteredGenres = useMemo(() => {
    if (!Array.isArray(genres)) return []
    const q = searchQuery.toLowerCase().trim()
    const seen = new Set<string>()
    return genres.filter((g) => {
      const slug = g.slug?.toLowerCase()
      if (!slug || seen.has(slug)) return false
      seen.add(slug)
      if (!q) return true
      return (
        g.name.toLowerCase().includes(q) ||
        slug.includes(q)
      )
    })
  }, [genres, searchQuery])

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <Helmet>
        <title>Genres & Categories — Otix</title>
        <meta
          name="description"
          content="Explore all genres and categories for movies, shows, games, and music on Otix."
        />
      </Helmet>

      {/* ── Breadcrumb & Page Header ── */}
      <div className="flex flex-col gap-4">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full"
            style={{ background: 'var(--dk-surface-ghost-hover)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Discover
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Browse
              </span>
              <span className="text-white/30">•</span>
              <span className="text-xs text-muted-foreground">Directory</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Genres & Categories
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
              Browse movies, TV series, games, and music organized by genre. Select any category
              to dive into its full continuous catalog.
            </p>
          </div>

          {filteredGenres.length > 0 && (
            <div className="shrink-0 text-left sm:text-right">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-muted-foreground bg-white/[0.04] border border-white/[0.06]">
                {filteredGenres.length} categories
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Controls Strip: Media Type Switcher & Search Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Type Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {MEDIA_TYPES.map(({ value, label, icon: Icon }) => {
            const isActive = selectedType === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setSelectedType(value)}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'glass-card text-muted-foreground hover:text-white hover:bg-white/[0.08]',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            )
          })}
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter categories..."
            className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-primary/50 focus:bg-white/[0.07] rounded-full pl-9 pr-4 py-1.5 text-xs text-white placeholder-muted-foreground outline-none transition-all"
          />
        </div>
      </div>

      {/* ── All Genres Media Grid ── */}
      {isLoading ? (
        <MediaGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[16/10] rounded-2xl" />
          ))}
        </MediaGrid>
      ) : filteredGenres.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center glass-card rounded-2xl border border-white/[0.06]">
          <p className="text-base font-semibold text-white">No categories found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No genres match &ldquo;{searchQuery}&rdquo;. Try another search term.
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="mt-4 px-4 py-2 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors"
          >
            Clear Search
          </button>
        </div>
      ) : (
        <MediaGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {filteredGenres.map((genre, idx) => (
            <GenreCard
              key={genre.slug}
              genre={genre}
              mediaType={(selectedType as any) || undefined}
              priority={idx < 8}
            />
          ))}
        </MediaGrid>
      )}
    </div>
  )
}
