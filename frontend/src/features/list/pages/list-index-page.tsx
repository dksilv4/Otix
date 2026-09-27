import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useAuth } from '@auth/hooks/use-auth'
import { useUserLists, useCreateList, useDeleteLists, ListCard, ListComposer, type UserListCreate } from '@list'
import { PlusIcon, LibraryIcon, Trash2, CheckSquare } from 'lucide-react'
import { useModal } from '@/lib/modals'

export function ListIndexPage() {
  const { user } = useAuth()
  const { data: lists, isLoading, isError, refetch } = useUserLists()
  const createList = useCreateList()
  const deleteLists = useDeleteLists()
  const { openModal } = useModal()

  const [isSelecting, setIsSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  const handleCreate = async (data: UserListCreate) => {
    await createList.mutateAsync(data)
  }

  const openComposer = () => {
    const close = openModal(
      <ListComposer
        onClose={() => close()}
        onSave={handleCreate}
      />
    )
  }

  const listItems = Array.isArray(lists) ? lists.filter(Boolean) : []

  const toggleSelectAll = () => {
    if (selectedIds.size === listItems.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(listItems.map((l) => l.id)))
    }
  }

  const handleSelect = (id: string, select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (select) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const cancelSelection = () => {
    setIsSelecting(false)
    setSelectedIds(new Set())
    setIsConfirmingDelete(false)
  }

  const handleConfirmDelete = async () => {
    if (selectedIds.size === 0) return
    try {
      await deleteLists.mutateAsync(Array.from(selectedIds))
      cancelSelection()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <div id="list-index-page" className="mx-auto w-full max-w-6xl px-6 py-8">
      <Helmet>
        <title>My Lists - Otix</title>
      </Helmet>

      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LibraryIcon className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">My Lists</h1>
        </div>
        {user && !isSelecting && (
          <div className="flex items-center gap-2">
            {listItems.length > 0 && (
              <button
                type="button"
                onClick={() => setIsSelecting(true)}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium bg-white/5 hover:bg-white/10 text-foreground border border-white/10 transition-all"
              >
                <CheckSquare className="h-4 w-4 text-muted-foreground" />
                Select
              </button>
            )}
            <button
              onClick={openComposer}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <PlusIcon className="h-4 w-4" />
              New List
            </button>
          </div>
        )}
      </div>

      {isSelecting && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[var(--dk-surface-glass)] p-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground">
              {selectedIds.size} of {listItems.length} selected
            </span>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs text-primary hover:underline font-medium"
            >
              {selectedIds.size === listItems.length ? "Deselect All" : "Select All"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isConfirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400 font-medium">
                  Delete {selectedIds.size} {selectedIds.size === 1 ? 'list' : 'lists'}?
                </span>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleteLists.isPending}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground px-3 py-1.5 text-xs font-bold transition-all shadow-sm"
                >
                  {deleteLists.isPending ? "Deleting..." : "Yes, Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  disabled={deleteLists.isPending}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold bg-white/5 hover:bg-white/10 text-foreground transition-all"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  disabled={selectedIds.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete ({selectedIds.size})
                </button>
                <button
                  type="button"
                  onClick={cancelSelection}
                  className="rounded-xl px-3 py-1.5 text-sm font-medium bg-white/5 hover:bg-white/10 text-foreground transition-all"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {!user ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <LibraryIcon className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-lg font-medium text-foreground">Sign in to create lists</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize your media into custom lists
          </p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-3xl" style={{ backgroundColor: 'var(--dk-surface-glass)' }} />
          ))}
        </div>
      ) : isError && !lists ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <LibraryIcon className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-lg font-medium text-foreground">Failed to load lists</p>
          <p className="mt-1 text-sm text-muted-foreground">Please try again.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Retry
          </button>
        </div>
      ) : listItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listItems.map((list) => (
            <ListCard
              key={list.id}
              list={list}
              selectable={isSelecting}
              selected={selectedIds.has(list.id)}
              onSelect={handleSelect}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <LibraryIcon className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-lg font-medium text-foreground">No lists yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first list to start organizing
          </p>
          <button
            onClick={openComposer}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <PlusIcon className="h-4 w-4" />
            Create List
          </button>
        </div>
      )}
    </div>
  )
}
