import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { Search } from 'lucide-react'
import { MediaGrid } from '@ui/molecules/media-grid'
import { Skeleton } from '@ui/atoms/skeleton'
import { DkDropdown, type DkDropdownOption } from '@ui/atoms/dropdown'
import { apiClient } from '@/lib/api/client'
import { GenreCard } from '../components/genre-card'
import type { GenreOption } from '../types'

const MEDIA_TYPE_OPTIONS: readonly DkDropdownOption[] = [
  { value: '', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'Shows' },
  { value: 'game', label: 'Games' },
]

import { parseMediaType } from '../utils'

export const GenresDirectoryPage = () => {
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
    <div id="genres-directory-page" className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <Helmet>
        <title>Genres — Otix</title>
        <meta
          name="description"
          content="Browse genres for movies, shows, and games on Otix."
        />
      </Helmet>

      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between border-b border-white/[0.08] pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Genres
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse the catalog by genre
            </p>
          </div>
          {filteredGenres.length > 0 && (
            <span className="text-xs font-medium text-muted-foreground">
              {filteredGenres.length} genres
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <DkDropdown
          variant="filter"
          label="Type"
          options={MEDIA_TYPE_OPTIONS}
          value={selectedType}
          onChange={setSelectedType}
        />

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter genres..."
            className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-primary/50 focus:bg-white/[0.07] rounded-full pl-9 pr-4 py-1.5 text-xs text-white placeholder-muted-foreground outline-none transition-all"
          />
        </div>
      </div>

      {isLoading ? (
        <MediaGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[16/10] rounded-2xl" />
          ))}
        </MediaGrid>
      ) : filteredGenres.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-base font-semibold text-muted-foreground">No genres found</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            {searchQuery
              ? `Nothing matches “${searchQuery}”.`
              : 'No genres available yet.'}
          </p>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-4 px-4 py-2 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors"
            >
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <MediaGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {filteredGenres.map((genre, idx) => (
            <GenreCard
              key={genre.slug}
              genre={genre}
              mediaType={parseMediaType(selectedType)}
              priority={idx < 8}
            />
          ))}
        </MediaGrid>
      )}
    </div>
  )
};
