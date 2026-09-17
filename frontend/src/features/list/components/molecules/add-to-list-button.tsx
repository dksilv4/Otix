// TODO: Review this file
import { useState, useRef, useEffect } from 'react'
import { ListIcon, PlusIcon, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@auth/hooks/use-auth'
import { useUserLists, useAddToList, useCreateList } from '../../list-queries'
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
  const addToList = useAddToList()
  const createList = useCreateList()
  const { openModal } = useModal()

  const [open, setOpen] = useState(false)
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  const userLists = Array.isArray(lists) ? lists.filter(Boolean) : []
  if (!isAuthenticated || (!lists && !userLists.length)) return null

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
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 rounded-xl bg-card border border-border/40 shadow-xl p-1.5 space-y-0.5">
          {userLists.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No lists yet. Create one first.
            </div>
          ) : (
            userLists.map((list) => {
              const added = justAdded === list.id
              return (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => {
                    setJustAdded(list.id)
                    addToList.mutate(
                      { listId: list.id, mediaItemId },
                      {
                        onSuccess: () => {
                          setTimeout(() => { setJustAdded(null); setOpen(false) }, 600)
                        },
                        onError: () => setJustAdded(null),
                      },
                    )
                  }}
                  disabled={addToList.isPending}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    'hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none',
                    added ? 'text-emerald-400' : 'text-foreground/80',
                  )}
                >
                  <div className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                    added
                      ? 'border-emerald-400 bg-emerald-400/10'
                      : 'border-border/40',
                  )}>
                    {added ? <Check className="h-3 w-3" /> : null}
                  </div>
                  <span className="truncate flex-1">{list.name}</span>
                  <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                    {(list as any).itemCount ?? 0}
                  </span>
                </button>
              )
            })
          )}

          <hr className="border-border/20 mx-2" />

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              openModal(<ListComposer onSave={async (data) => { await createList.mutateAsync(data) }} />)
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
            New List
          </button>
        </div>
      )}
    </div>
  )
}
