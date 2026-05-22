import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Crown, Plus, Search, X } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-provider'
import { userQueries, useUpdateHallOfFame } from '../user-queries'
import type { MediaItemSummary } from '@/features/media/media-queries'
import { apiClient } from '@/lib/api-client'
import { Skeleton } from '@ui/atoms/skeleton'

const MEDIA_TYPE_COLORS: Record<string, string> = {
  movie: '#ef4444',
  show: '#3b82f6',
  game: '#a855f7',
  music: '#eab308',
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  movie: 'Movies',
  show: 'Shows',
  game: 'Games',
  music: 'Music',
}

const EMPTY_SLOTS = Array.from({ length: 5 })

export function HallOfFameSection({ username, mediaType }: { username: string; mediaType: string }) {
  const { user: currentUser } = useAuth()
  const isOwner = currentUser?.username === username

  const hallQuery = useQuery(userQueries.hallOfFame(username, mediaType))
  const updateHall = useUpdateHallOfFame(username)

  const [pickerOpen, setPickerOpen] = useState(false)

  if (hallQuery.isLoading) return <HallOfFameSkeleton />

  const items = hallQuery.data ?? []
  const hasItems = items.length > 0

  if (!hasItems && !isOwner) return null

  const currentHofDict = currentUser?.hall_of_fame_media_ids ?? {}

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Crown className="h-4 w-4 text-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {MEDIA_TYPE_LABELS[mediaType] ?? mediaType}
        </h2>
        {isOwner && hasItems && (
          <button
            onClick={() => setPickerOpen(true)}
            className="ml-auto text-xs text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {!hasItems && isOwner ? (
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full rounded-2xl border-2 border-dashed border-white/[0.08] bg-[var(--dk-surface-glass)] p-8 text-center hover:border-white/[0.15] transition-colors"
        >
          <Crown className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground/50">Curate your top 5 {MEDIA_TYPE_LABELS[mediaType]?.toLowerCase() ?? mediaType}</p>
        </button>
      ) : (
        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          {EMPTY_SLOTS.map((_, i) => {
            const item = items[i]
            if (!item) {
              return (
                <div
                  key={i}
                  className="aspect-[2/3] rounded-xl border-2 border-dashed border-white/[0.05] bg-[var(--dk-surface-glass)] flex items-center justify-center"
                >
                  {isOwner && i === items.length ? (
                    <button
                      onClick={() => setPickerOpen(true)}
                      className="p-1 rounded-full hover:bg-white/[0.06] transition-colors"
                    >
                      <Plus className="h-4 w-4 text-muted-foreground/30" />
                    </button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/15 font-medium">{i + 1}</span>
                  )}
                </div>
              )
            }

            const accent = MEDIA_TYPE_COLORS[item.mediaType] ?? '#6b7280'

            return (
              <div
                key={item.id}
                className="relative aspect-[2/3] rounded-xl overflow-hidden group shadow-[var(--dk-shadow-sm)]"
                style={{ borderBottom: `3px solid ${accent}66` }}
              >
                {item.posterUrl ? (
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-full w-full bg-[var(--dk-surface-raised)] flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground/40 text-center px-1 leading-tight">
                      {item.title}
                    </span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-2 pt-6">
                  <p className="text-[10px] font-medium text-white/90 leading-tight truncate">{item.title}</p>
                </div>
                <div
                  className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white/90"
                  style={{ backgroundColor: `${accent}cc` }}
                >
                  {i + 1}
                </div>
                {isOwner && (
                  <button
                    onClick={() => {
                      const newIds = items.filter((_, idx) => idx !== i).map((it) => it.id)
                      updateHall.mutate({ mediaType, mediaIds: newIds, current: currentHofDict })
                    }}
                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3 text-white/70" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {pickerOpen && (
        <HallOfFamePicker
          mediaType={mediaType}
          currentIds={items.map((i) => i.id)}
          onSave={(ids) => {
            updateHall.mutate({ mediaType, mediaIds: ids, current: currentHofDict })
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  )
}

function HallOfFamePicker({
  mediaType,
  currentIds,
  onSave,
  onClose,
}: {
  mediaType: string
  currentIds: string[]
  onSave: (ids: string[]) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MediaItemSummary[]>([])
  const [selected, setSelected] = useState<string[]>(currentIds)
  const [searching, setSearching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const doSearch = (q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)

    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const { data } = await apiClient.get<{ items: MediaItemSummary[] }>('/media/search', {
          params: { q, media_type: mediaType, page_size: '15' },
          signal: controller.signal,
        })
        if (!controller.signal.aborted) {
          setResults(data.items ?? [])
          setSearching(false)
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'CanceledError') return
        if (!controller.signal.aborted) {
          setResults([])
          setSearching(false)
        }
      }
    }, 200)
  }

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 5) return prev
      return [...prev, id]
    })
  }

  const placeholder = `Search ${MEDIA_TYPE_LABELS[mediaType]?.toLowerCase() ?? mediaType}...`

  return (
    <div className="fixed inset-0 z-[var(--dk-z-modal)] flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-[var(--dk-surface-overlay)] rounded-2xl shadow-[var(--dk-shadow-dialog)] overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-white/[0.06]">
          <Search className="h-4 w-4 text-muted-foreground/50 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              doSearch(e.target.value)
            }}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/30"
          />
          <span className="text-[10px] text-muted-foreground/40 tabular-nums">{selected.length}/5</span>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-3 space-y-1">
          {searching && (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          )}
          {!searching && query.length < 2 && (
            <p className="text-xs text-muted-foreground/40 text-center py-8">
              Type at least 2 characters to search
            </p>
          )}
          {!searching &&
            query.length >= 2 &&
            results.length === 0 && (
              <p className="text-xs text-muted-foreground/40 text-center py-8">No results</p>
            )}
          {!searching &&
            results.map((item) => {
              const isSel = selected.includes(item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors text-left ${
                    isSel
                      ? 'bg-[var(--dk-surface-glass-hover)] ring-1 ring-white/[0.08]'
                      : 'hover:bg-[var(--dk-surface-glass-hover)]'
                  }`}
                >
                  <div className="w-10 h-14 rounded-lg bg-[var(--dk-surface-raised)] shrink-0 overflow-hidden">
                    {item.posterUrl ? (
                      <img
                        src={item.posterUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <span className="text-[16px] text-muted-foreground/20">?</span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground/50">
                      {item.releaseDate && `${new Date(item.releaseDate).getFullYear()}`}
                    </p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                      isSel ? 'border-amber-400 bg-amber-400' : 'border-white/[0.15]'
                    }`}
                  >
                    {isSel && <span className="text-[9px] font-bold text-black">✓</span>}
                  </div>
                </button>
              )
            })}
        </div>

        <div className="flex gap-2 p-4 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(selected)}
            className="flex-1 py-2 text-xs font-medium bg-amber-400 text-black rounded-lg hover:bg-amber-300 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function HallOfFameSkeleton() {
  return (
    <section>
      <Skeleton className="h-4 w-28 mb-4" />
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {EMPTY_SLOTS.map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
        ))}
      </div>
    </section>
  )
}
