import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Crown,
  Loader2,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { apiClient } from '@/lib/api/client'
import type { Top5Item } from '../../types'

interface EditTop5ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentItems: Top5Item[]
  username: string
}

export const EditTop5Modal = ({
  open,
  onOpenChange,
  currentItems,
  username,
}: EditTop5ModalProps) => {
  const queryClient = useQueryClient()
  const [items, setItems] = useState<Top5Item[]>(currentItems)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Top5Item[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setItems(currentItems)
  }, [currentItems, open])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const { data } = await apiClient.get<any>('/search', {
          params: { q: query.trim() },
        })
        const rawItems = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
        const mapped: Top5Item[] = rawItems.slice(0, 8).map((m: any) => ({
          id: m.id,
          title: m.title || m.name || 'Untitled',
          mediaType: m.mediaType || m.media_type || 'movie',
          posterUrl: m.posterUrl || m.poster_url || null,
          backdropUrl: m.backdropUrl || m.backdrop_url || null,
          releaseYear: m.releaseDate ? new Date(m.releaseDate).getFullYear() : null,
          score: null,
        }))
        setSearchResults(mapped)
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  const handleAddItem = (item: Top5Item) => {
    if (items.length >= 5) return
    if (items.some((i) => String(i.id) === String(item.id))) return
    setItems([...items, item])
    setQuery('')
    setSearchResults([])
  }

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const next = [...items]
    const temp = next[index - 1]
    next[index - 1] = next[index]
    next[index] = temp
    setItems(next)
  }

  const handleMoveDown = (index: number) => {
    if (index === items.length - 1) return
    const next = [...items]
    const temp = next[index + 1]
    next[index + 1] = next[index]
    next[index] = temp
    setItems(next)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const top5Ids = items.map((i) => i.id)
      await apiClient.patch('/auth/me', {
        hallOfFameMediaIds: {
          top_5: top5Ids,
        },
      })
      queryClient.invalidateQueries({ queryKey: ['user', username, 'top-5'] })
      queryClient.invalidateQueries({ queryKey: ['user', username] })
      onOpenChange(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <DkDialog open={open} onOpenChange={onOpenChange} className="max-w-lg">
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center bg-[var(--dk-surface-ghost)] text-primary">
            <Crown className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">
              Curate Your Top 5 Favorites
            </h3>
            <p className="text-xs text-muted-foreground">
              Select and rank your all-time favorite titles.
            </p>
          </div>
        </div>

        {/* Current Top 5 Slots */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Ranked Slots ({items.length}/5)
          </span>

          {items.length === 0 ? (
            <div className="py-6 flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)]/30">
              <p className="text-xs text-muted-foreground">
                No items added yet. Search below to add your favorites!
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-2 rounded-xl bg-[var(--dk-surface-base)] border border-[var(--dk-separator)]"
                >
                  <span className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold bg-[var(--dk-surface-ghost)] text-primary shrink-0">
                    {index + 1}
                  </span>

                  <div className="h-10 w-7 rounded overflow-hidden bg-[var(--dk-surface-ghost)] shrink-0">
                    {item.posterUrl ? (
                      <img src={item.posterUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 text-[10px]">
                        ★
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-foreground truncate block">
                      {item.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {item.mediaType} {item.releaseYear ? `· ${item.releaseYear}` : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
                      title="Move Up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === items.length - 1}
                      className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
                      title="Move Down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Media Search */}
        {items.length < 5 && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Search to Add
            </span>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search movies, shows, games, music..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground animate-spin" />
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-base)] divide-y divide-[var(--dk-separator)]">
                {searchResults.map((result) => {
                  const alreadyAdded = items.some((i) => String(i.id) === String(result.id))
                  return (
                    <div
                      key={result.id}
                      className="flex items-center justify-between p-2 hover:bg-[var(--dk-surface-ghost)] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-6 rounded overflow-hidden bg-[var(--dk-surface-ghost)] shrink-0">
                          {result.posterUrl && (
                            <img src={result.posterUrl} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-foreground truncate block">
                            {result.title}
                          </span>
                          <span className="text-[10px] text-muted-foreground capitalize">
                            {result.mediaType}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => handleAddItem(result)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--dk-surface-ghost)] text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        {alreadyAdded ? 'Added' : <Plus className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--dk-separator)]">
          <DkButton
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </DkButton>
          <DkButton
            variant="default"
            size="sm"
            disabled={isSaving}
            onClick={handleSave}
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Save Favorites
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
}
