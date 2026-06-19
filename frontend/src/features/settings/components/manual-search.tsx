import { useState, useEffect, useRef } from 'react'
import { Search, Loader2, Gamepad2 } from 'lucide-react'
import { apiClient } from '@/lib/api/client'

interface SearchResult {
  id: string
  title: string
  slug: string
  posterUrl: string | null
  releaseDate: string | null
}

interface ManualSearchProps {
  onSelect: (media: { id: string; title: string; posterUrl?: string | null }) => void
}

export function ManualSearch({ onSelect }: ManualSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    setSearched(true)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await apiClient.get<{ items: SearchResult[]; hasMore: boolean }>('/media/search', {
          params: { q: query, media_type: 'game', page_size: '12' },
        })
        setResults(data.items || [])
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
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search game catalog..."
          className="w-full h-9 rounded-xl bg-white/5 pl-9 pr-3 text-sm outline-none text-white/80 placeholder:text-white/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] transition-shadow"
        />
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-white/40" />
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect({ id: r.id, title: r.title, posterUrl: r.posterUrl })}
              className="rounded-xl overflow-hidden bg-white/5 hover:bg-white/10 transition-colors text-left group"
            >
              <div className="w-full aspect-[2/3] bg-white/5 overflow-hidden">
                {r.posterUrl ? (
                  <img src={r.posterUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Gamepad2 className="h-8 w-8 text-white/15" />
                  </div>
                )}
              </div>
              <p className="text-[10px] font-medium truncate px-1.5 py-1 text-white/70">{r.title}</p>
            </button>
          ))}
        </div>
      )}

      {!loading && searched && results.length === 0 && query.length >= 2 && (
        <p className="mt-2 text-xs text-white/40 text-center py-2">No results found</p>
      )}

      {!searched && (
        <p className="mt-2 text-xs text-white/30 text-center">Type at least 2 characters to search</p>
      )}
    </div>
  )
}
