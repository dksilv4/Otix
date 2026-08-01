import { useState, useEffect, useRef } from 'react'
import { Search, Loader2, Gamepad2, Import } from 'lucide-react'
import { apiClient } from '@/lib/api/client'

interface ProviderResult {
  provider: string
  id: string
  title: string
  posterUrl: string | null
  slug?: string | null
}

interface ManualSearchProps {
  onSelect: (media: { id: string; title: string; posterUrl?: string | null }) => void
  defaultQuery?: string
  gameContext?: { title?: string; developer?: string; platform?: string }
}

export function ManualSearch({ onSelect, defaultQuery, gameContext }: ManualSearchProps) {
  const [query, setQuery] = useState(defaultQuery || '')
  const [results, setResults] = useState<ProviderResult[]>([])
  const [backfill, setBackfill] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (defaultQuery && !query) setQuery(defaultQuery)
  }, [defaultQuery])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 2) {
      setResults([])
      setBackfill(false)
      setSearched(false)
      return
    }
    setSearched(true)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await apiClient.post<{
          items: ProviderResult[]
          backfill_pending: boolean
        }>('/media/search-providers', { query, limit: 15 })
        setResults(data.items || [])
        setBackfill(data.backfill_pending || false)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  return (
    <div>
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Otix, IGDB, SteamGrid..."
          className="w-full h-9 rounded-xl bg-white/5 pl-9 pr-3 text-sm outline-none text-white/80 placeholder:text-white/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] transition-shadow"
        />
      </div>

      {/* Context */}
      {gameContext?.title && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] text-white/30">Matching:</span>
          <span className="text-[10px] text-white/60 bg-white/5 rounded-full px-2 py-0.5 truncate max-w-[200px]">
            {gameContext.title}
          </span>
          {gameContext.developer && (
            <span className="text-[10px] text-white/40 bg-white/5 rounded-full px-2 py-0.5 truncate max-w-[150px]">
              {gameContext.developer}
            </span>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-white/40" />
        </div>
      )}

      {/* Backfill notice */}
      {backfill && (
        <div className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded-lg bg-blue-500/10 text-[10px] text-blue-400">
          <Import className="h-3 w-3" />
          Importing games from IGDB — refresh in a moment
        </div>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
          {results.map((r) => {
            const providerLabel =
              r.provider === 'otix' ? 'Otix' :
              r.provider === 'igdb' ? 'IGDB' :
              'SteamGrid'
            const providerColor =
              r.provider === 'otix' ? 'text-green-400' :
              r.provider === 'igdb' ? 'text-blue-400' :
              'text-amber-400'

            return (
              <button
                key={`${r.provider}:${r.id}`}
                onClick={() => onSelect({
                  id: r.id,
                  title: r.title,
                  posterUrl: r.posterUrl || null,
                })}
                className="rounded-xl overflow-hidden bg-white/5 hover:bg-white/10 transition-colors text-left group relative"
              >
                <div className="w-full aspect-[2/3] bg-white/5 overflow-hidden">
                  {r.posterUrl ? (
                    <img
                      src={r.posterUrl}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Gamepad2 className="h-8 w-8 text-white/15" />
                    </div>
                  )}
                </div>
                <p className="text-[10px] font-medium truncate px-1.5 pt-1 text-white/70">
                  {r.title}
                </p>
                <span className={`text-[9px] px-1.5 pb-1 block ${providerColor}`}>
                  {providerLabel}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Empty */}
      {!loading && searched && results.length === 0 && query.length >= 2 && (
        <p className="mt-2 text-xs text-white/40 text-center py-2">No results found</p>
      )}

      {!searched && (
        <p className="mt-2 text-xs text-white/30 text-center">Type at least 2 characters to search</p>
      )}
    </div>
  )
}
