import { useState, useEffect } from 'react'
import { Search, Gamepad2, Film, Tv, Loader2 } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { apiClient } from '@/lib/api'
import type { EntityEmbedMetadata } from '../../types'

interface ShareEntityModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectEntity: (entity: EntityEmbedMetadata) => void
}

interface SearchResultItem {
  id: number | string
  title: string
  mediaType?: string
  type?: string
  posterUrl?: string
  coverUrl?: string
  releaseDate?: string
  releaseYear?: string | number
  year?: string | number
}

export const ShareEntityModal = ({
  open,
  onOpenChange,
  onSelectEntity,
}: ShareEntityModalProps) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      return
    }
  }, [open])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed || trimmed.length < 2) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await apiClient.get<{ items?: SearchResultItem[] } | SearchResultItem[]>('/search', {
          params: { q: trimmed, limit: 10 },
        })
        const items = Array.isArray(data) ? data : data.items || []
        setResults(items)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  const handleSelect = (item: SearchResultItem) => {
    const rawType = item.mediaType || item.type || 'media'
    const entityType: 'game' | 'movie' | 'show' =
      rawType === 'game' ? 'game' : rawType === 'tv' || rawType === 'show' ? 'show' : 'movie'

    const embed: EntityEmbedMetadata = {
      entityType,
      entityId: item.id,
      title: item.title,
      coverUrl: item.coverUrl || item.posterUrl,
      posterUrl: item.posterUrl || item.coverUrl,
      releaseYear: item.releaseYear || item.year || (item.releaseDate ? item.releaseDate.slice(0, 4) : undefined),
    }

    onSelectEntity(embed)
    onOpenChange(false)
  }

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share Game or Media"
      description="Find a title from Otix to share with your friend"
      className="max-w-md"
    >
      <div className="mt-4 space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games, movies, shows..."
            className="w-full rounded-xl bg-[var(--dk-surface-ghost)] pl-9 pr-4 py-2 text-sm text-foreground outline-none border border-white/[0.04] focus:ring-1 focus:ring-primary/40"
            autoFocus
          />
          {loading && (
            <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-primary" />
          )}
        </div>

        {/* Results List */}
        <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
          {results.length > 0 ? (
            results.map((item) => {
              const rawType = item.mediaType || item.type || 'media'
              const isGame = rawType === 'game'
              const isShow = rawType === 'tv' || rawType === 'show'
              const image = item.coverUrl || item.posterUrl
              const year = item.releaseYear || item.year || (item.releaseDate ? item.releaseDate.slice(0, 4) : '')

              return (
                <button
                  key={`${rawType}-${item.id}`}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--dk-surface-ghost)] text-left transition group"
                >
                  {image ? (
                    <img
                      src={image}
                      alt={item.title}
                      className="w-10 h-14 rounded-md object-cover bg-muted shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-14 rounded-md bg-muted flex items-center justify-center shrink-0">
                      {isGame ? (
                        <Gamepad2 className="w-5 h-5 text-muted-foreground" />
                      ) : isShow ? (
                        <Tv className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <Film className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <h5 className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {item.title}
                    </h5>
                    <p className="text-xs text-muted-foreground capitalize">
                      {rawType} {year ? `• ${year}` : ''}
                    </p>
                  </div>
                </button>
              )
            })
          ) : query.trim().length >= 2 && !loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No results found for "{query}"
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Type to search games, movies, and shows
            </div>
          )}
        </div>
      </div>
    </DkDialog>
  )
};
