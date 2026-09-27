import { useState, useRef, useEffect, useMemo } from 'react'
import { ListIcon, PlusIcon, Check, Search, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@auth/hooks/use-auth'
import {
  useUserLists,
  useListsForMedia,
  useAddToList,
  useRemoveFromList,
  useCreateList,
} from '../../list-queries'
import { ListComposer } from '../organisms/list-composer'
import { useModal } from '@/lib/modals'

interface AddToListButtonProps {
  mediaItemId: string
  className?: string
  variant?: 'default' | 'pill' | 'icon'
}

export function AddToListButton({ mediaItemId, className, variant = 'default' }: AddToListButtonProps) {
  const { isAuthenticated } = useAuth()
  const { data: lists } = useUserLists()
  const { data: memberListIds } = useListsForMedia(mediaItemId, {
    enabled: isAuthenticated && Boolean(mediaItemId),
  })
  const addToList = useAddToList()
  const removeFromList = useRemoveFromList()
  const createList = useCreateList()
  const { openModal } = useModal()

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [placement, setPlacement] = useState<'top' | 'bottom'>('top')
  const ref = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const memberSet = useMemo(
    () => new Set((memberListIds || []).map(String)),
    [memberListIds]
  )

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKeyDown)

      // Calculate placement depending on available screen space
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect()
        const spaceAbove = rect.top
        const spaceBelow = window.innerHeight - rect.bottom
        if (spaceAbove < 320 && spaceBelow > spaceAbove) {
          setPlacement('bottom')
        } else {
          setPlacement('top')
        }
      }

      // Auto focus search input when opened
      const focusTimer = setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)

      return () => {
        document.removeEventListener('mousedown', handleClick)
        document.removeEventListener('keydown', handleKeyDown)
        clearTimeout(focusTimer)
      }
    } else {
      setSearch('')
    }
  }, [open])

  const userLists = useMemo(() => (Array.isArray(lists) ? lists.filter(Boolean) : []), [lists])

  const filteredLists = useMemo(() => {
    if (!search.trim()) return userLists
    const query = search.toLowerCase().trim()
    return userLists.filter((l) => l.name.toLowerCase().includes(query))
  }, [userLists, search])

  if (!isAuthenticated) return null

  return (
    <div ref={ref} className={cn('relative', className)}>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/[0.12] transition-all hover:scale-110 active:scale-95"
          title="Add to list"
          aria-label="Add to list"
        >
          <ListIcon className="h-4 w-4 text-white/75 hover:text-white transition-colors" />
        </button>
      ) : variant === 'pill' ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs sm:text-sm font-medium bg-white/[0.08] hover:bg-white/[0.14] text-white/90 border border-white/10 shadow-md backdrop-blur-md transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <ListIcon className="h-4 w-4 text-muted-foreground" />
          <span>List</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="dk-interaction__btn glass-inset flex flex-col items-center gap-1.5"
        >
          <ListIcon className="relative h-5 w-5 text-muted-foreground transition-all duration-200" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            List
          </span>
        </button>
      )}

      {open && (
        <div
          className={cn(
            'absolute left-1/2 -translate-x-1/2 z-50 w-64 sm:w-72 rounded-2xl bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl flex flex-col overflow-hidden',
            placement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
          )}
        >
          {/* Header with Search if there are several lists */}
          {userLists.length > 3 && (
            <div className="p-2 border-b border-border/30 bg-card/60">
              <div className="relative flex items-center">
                <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search lists..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 text-muted-foreground hover:text-foreground p-0.5 rounded"
                    aria-label="Clear search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Scrollable list items */}
          <div className="max-h-56 sm:max-h-64 overflow-y-auto p-1.5 space-y-0.5">
            {userLists.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No lists yet. Create one first.
              </div>
            ) : filteredLists.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No lists matching &quot;{search}&quot;
              </div>
            ) : (
              filteredLists.map((list) => {
                const isMember = memberSet.has(String(list.id))
                const isMutatingThis =
                  (addToList.isPending && addToList.variables?.listId === list.id) ||
                  (removeFromList.isPending && removeFromList.variables?.listId === list.id)

                return (
                  <button
                    key={list.id}
                    type="button"
                    title={list.name}
                    onClick={() => {
                      if (isMember) {
                        removeFromList.mutate({ listId: list.id, mediaItemId })
                      } else {
                        addToList.mutate({ listId: list.id, mediaItemId })
                      }
                    }}
                    disabled={isMutatingThis}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                      'hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none',
                      isMember ? 'text-emerald-400' : 'text-foreground/80',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                        isMember
                          ? 'border-emerald-400 bg-emerald-400/10'
                          : 'border-border/40',
                      )}
                    >
                      {isMutatingThis ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : isMember ? (
                        <Check className="h-3 w-3" />
                      ) : null}
                    </div>
                    <span className="truncate flex-1 text-xs sm:text-sm">{list.name}</span>
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                      {list.itemCount ?? 0}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          {/* Pinned footer for New List button */}
          <div className="border-t border-border/30 p-1.5 bg-card/60">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                const close = openModal(
                  <ListComposer
                    onClose={() => close()}
                    onSave={async (data) => {
                      const newList = await createList.mutateAsync(data)
                      if (newList?.id) {
                        addToList.mutate({ listId: newList.id, mediaItemId })
                      }
                    }}
                  />
                )
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              New List
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
