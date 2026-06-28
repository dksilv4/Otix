import { Helmet } from 'react-helmet-async'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '@auth/hooks/use-auth'
import { useUserLists, useCreateList } from '@list/list-queries'
import { ListCard } from '@list/molecules/list-card'
import { ListComposer } from '@list/organisms/list-composer'
import { PlusIcon, LibraryIcon } from 'lucide-react'
import { useState } from 'react'
import type { UserListCreate } from '@list/list-queries'

export function ListIndexPage() {
  const { user } = useAuth()
  const { data: lists, isLoading } = useUserLists()
  const createList = useCreateList()
  const navigate = useNavigate()
  const [composerOpen, setComposerOpen] = useState(false)

  const handleCreate = async (data: UserListCreate) => {
    await createList.mutateAsync(data)
    setComposerOpen(false)
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
        {user && (
          <button
            onClick={() => setComposerOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <PlusIcon className="h-4 w-4" />
            New List
          </button>
        )}
      </div>

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
      ) : lists && lists.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <ListCard key={list.id} list={list} />
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
            onClick={() => setComposerOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <PlusIcon className="h-4 w-4" />
            Create List
          </button>
        </div>
      )}

      <ListComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onSave={handleCreate}
        isSaving={createList.isPending}
      />
    </div>
  )
}
