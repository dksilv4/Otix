import { useState, useEffect, useMemo, useRef } from 'react'
import { FolderPlus, Plus, Search, X, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@auth/hooks/use-auth'
import { useModal } from '@/lib/modals'
import { showToast } from '@ui/molecules/toast'
import {
  useUserLists,
  useListsForMedia,
  useAddToList,
  useRemoveFromList,
  useCreateList,
  type UserListOut,
} from '../../list-queries'
import { ListComposer } from './list-composer'

interface AddToListModalProps {
  mediaItemId: string
  mediaTitle?: string
  mediaType?: string
  onClose: () => void
  isExiting?: boolean
}

export const AddToListModal = ({
  mediaItemId,
  mediaTitle,
  mediaType,
  onClose,
  isExiting,
}: AddToListModalProps) => {
  const { isAuthenticated } = useAuth()
  const { data: lists, isLoading: isLoadingLists } = useUserLists()
  const { data: memberListIds, isLoading: isLoadingMember } = useListsForMedia(mediaItemId, {
    enabled: isAuthenticated && Boolean(mediaItemId),
  })
  const addToList = useAddToList()
  const removeFromList = useRemoveFromList()
  const createList = useCreateList()
  const { openModal } = useModal()

  const [search, setSearch] = useState('')
  const [animateIn, setAnimateIn] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)))
  }, [])

  const memberSet = useMemo(
    () => new Set((memberListIds || []).map(String)),
    [memberListIds],
  )

  const userLists: UserListOut[] = useMemo(() => {
    if (!Array.isArray(lists)) return []
    return lists
  }, [lists])

  const filteredLists = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return userLists
    return userLists.filter((l) => l.name.toLowerCase().includes(q))
  }, [userLists, search])

  const handleToggle = async (list: UserListOut) => {
    const isMember = memberSet.has(String(list.id))
    try {
      if (isMember) {
        await removeFromList.mutateAsync({ listId: list.id, mediaItemId })
        showToast({
          title: 'Removed from list',
          description: `Removed from "${list.name}"`,
          variant: 'info',
        })
      } else {
        await addToList.mutateAsync({ listId: list.id, mediaItemId, mediaType })
        showToast({
          title: 'Added to list',
          description: `Added to "${list.name}"`,
          variant: 'success',
        })
      }
    } catch {
      // Error is handled by query client mutation cache
    }
  }

  const handleOpenCreateList = () => {
    const close = openModal(
      <ListComposer
        onClose={() => close()}
        onSave={async (data) => {
          const newList = await createList.mutateAsync(data)
          if (newList?.id) {
            await addToList.mutateAsync({ listId: newList.id, mediaItemId, mediaType })
            showToast({
              title: 'List created',
              description: `Created "${newList.name}" and added title`,
              variant: 'success',
            })
          }
        }}
      />,
    )
  }

  const visible = animateIn && !isExiting

  return (
    <div
      className={cn(
        'fixed inset-0 z-[var(--dk-z-modal)] flex items-center justify-center p-4 transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative w-full max-w-md overflow-hidden rounded-3xl bg-[var(--dk-surface-base)] border border-[var(--dk-separator)] shadow-[var(--dk-shadow-dialog)] transition-all duration-200 ease-out flex flex-col p-6 space-y-4',
          visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FolderPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Add to List</h3>
              <p className="text-xs text-muted-foreground truncate max-w-[240px]">
                {mediaTitle ? `Choose lists for "${mediaTitle}"` : 'Choose which lists to include this in'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 transition-all text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search if multiple lists */}
        {userLists.length > 3 && (
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lists..."
              className="w-full bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] rounded-xl pl-9 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* List items container */}
        <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
          {isLoadingLists || isLoadingMember ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filteredLists.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {search ? 'No lists matching your search' : 'No custom lists yet'}
            </div>
          ) : (
            filteredLists.map((list) => {
              const isChecked = memberSet.has(String(list.id))
              return (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => handleToggle(list)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors',
                    isChecked
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
                  )}
                >
                  <span className="truncate flex-1">{list.name}</span>
                  <div
                    className={cn(
                      'ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border transition-colors',
                      isChecked
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-[var(--dk-separator)] bg-transparent',
                    )}
                  >
                    {isChecked && <Check className="h-3.5 w-3.5" />}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Footer with New List creation */}
        <div className="pt-2 border-t border-[var(--dk-separator)] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleOpenCreateList}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Create New List</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
};
