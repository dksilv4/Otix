// TODO: Review this file
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Crown, Plus, Search, X } from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import { userQueries, useUpdateHallOfFame } from '../user-queries'
import type { MediaItemSummary } from '@/old-features/media/media-queries'
import { apiClient } from '@/lib/api/client'
import { Skeleton } from '@ui/atoms/skeleton'
import { cn } from '@/lib/utils'
import './profile-hall-of-fame-section.scss'

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
      <div className="dk-user-hall-of-fame__header">
        <Crown className="h-4 w-4 text-amber-400" />
        <h2 className="dk-user-hall-of-fame__title">
          {MEDIA_TYPE_LABELS[mediaType] ?? mediaType}
        </h2>
        {isOwner && hasItems && (
          <button
            onClick={() => setPickerOpen(true)}
            className="dk-user-hall-of-fame__edit-btn"
          >
            Edit
          </button>
        )}
      </div>

      {!hasItems && isOwner ? (
        <button
          onClick={() => setPickerOpen(true)}
          className="dk-user-hall-of-fame__empty-state"
        >
          <Crown className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
          <p className="dk-user-hall-of-fame__empty-text">Curate your top 5 {MEDIA_TYPE_LABELS[mediaType]?.toLowerCase() ?? mediaType}</p>
        </button>
      ) : (
        <div className="dk-user-hall-of-fame__grid">
          {EMPTY_SLOTS.map((_, i) => {
            const item = items[i]
            if (!item) {
              return (
                <div
                  key={i}
                  className="dk-user-hall-of-fame__slot"
                >
                  {isOwner && i === items.length ? (
                    <button
                      onClick={() => setPickerOpen(true)}
                      className="dk-user-hall-of-fame__slot-add-btn"
                    >
                      <Plus className="h-4 w-4 text-muted-foreground/30" />
                    </button>
                  ) : (
                    <span className="dk-user-hall-of-fame__slot-index">{i + 1}</span>
                  )}
                </div>
              )
            }

            const accent = MEDIA_TYPE_COLORS[item.mediaType] ?? '#6b7280'

            return (
              <div
                key={item.id}
                className="dk-user-hall-of-fame__card"
                style={{ borderBottom: `3px solid ${accent}66` }}
              >
                {item.posterUrl ? (
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    className="dk-user-hall-of-fame__card-img"
                    loading="lazy"
                  />
                ) : (
                  <div className="dk-user-hall-of-fame__card-placeholder">
                    <span className="dk-user-hall-of-fame__card-placeholder-text">
                      {item.title}
                    </span>
                  </div>
                )}
                <div className="dk-user-hall-of-fame__card-gradient">
                  <p className="dk-user-hall-of-fame__card-title">{item.title}</p>
                </div>
                <div
                  className="dk-user-hall-of-fame__card-rank"
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
                    className="dk-user-hall-of-fame__card-remove-btn"
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
    <div className="dk-user-hall-of-fame__picker">
      <div className="dk-user-hall-of-fame__picker-backdrop" onClick={onClose} />
      <div className="dk-user-hall-of-fame__picker-panel">
        <div className="dk-user-hall-of-fame__picker-header">
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
            className="dk-user-hall-of-fame__picker-input"
          />
          <span className="dk-user-hall-of-fame__picker-counter">{selected.length}/5</span>
        </div>

        <div className="dk-user-hall-of-fame__picker-results">
          {searching && (
            <div className="dk-user-hall-of-fame__picker-skeleton">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          )}
          {!searching && query.length < 2 && (
            <p className="dk-user-hall-of-fame__picker-info">
              Type at least 2 characters to search
            </p>
          )}
          {!searching &&
            query.length >= 2 &&
            results.length === 0 && (
              <p className="dk-user-hall-of-fame__picker-info">No results</p>
            )}
          {!searching &&
            results.map((item) => {
              const isSel = selected.includes(item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={cn(
                    'dk-user-hall-of-fame__picker-item',
                    isSel && 'dk-user-hall-of-fame__picker-item--selected',
                  )}
                >
                  <div className="dk-user-hall-of-fame__picker-poster">
                    {item.posterUrl ? (
                      <img
                        src={item.posterUrl}
                        alt=""
                        className="dk-user-hall-of-fame__picker-poster-img"
                        loading="lazy"
                      />
                    ) : (
                      <div className="dk-user-hall-of-fame__picker-poster-empty">
                        <span className="dk-user-hall-of-fame__picker-poster-empty-icon">?</span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="dk-user-hall-of-fame__picker-item-title">{item.title}</p>
                    <p className="dk-user-hall-of-fame__picker-item-year">
                      {item.releaseDate && `${new Date(item.releaseDate).getFullYear()}`}
                    </p>
                  </div>
                  <div
                    className={cn(
                      'dk-user-hall-of-fame__picker-check',
                      isSel
                        ? 'dk-user-hall-of-fame__picker-check--selected'
                        : 'dk-user-hall-of-fame__picker-check--default',
                    )}
                  >
                    {isSel && <span className="dk-user-hall-of-fame__picker-check-mark">✓</span>}
                  </div>
                </button>
              )
            })}
        </div>

        <div className="dk-user-hall-of-fame__picker-footer">
          <button
            onClick={onClose}
            className="dk-user-hall-of-fame__picker-cancel-btn"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(selected)}
            className="dk-user-hall-of-fame__picker-save-btn"
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
      <div className="dk-user-hall-of-fame__grid">
        {EMPTY_SLOTS.map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
        ))}
      </div>
    </section>
  )
}
