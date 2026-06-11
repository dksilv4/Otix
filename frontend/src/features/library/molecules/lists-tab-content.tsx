import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUserLists, useCreateList, type UserListCreate } from "@/features/list/list-queries"
import { ListComposer } from "@/features/list/organisms/list-composer"
import { ListCard } from "@/features/list/molecules/list-card"

export function ListsTabContent() {
  const { data: lists, isLoading } = useUserLists()
  const [composerOpen, setComposerOpen] = useState(false)
  const createList = useCreateList()

  function handleCreate(data: UserListCreate) {
    createList.mutate(data, { onSuccess: () => setComposerOpen(false) })
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-3xl bg-[var(--dk-surface-glass)] animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (!lists || lists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">No lists yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a list to start curating your favorite titles.
        </p>
        <button
          onClick={() => setComposerOpen(true)}
          className={cn(
            "mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
            "bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          )}
        >
          <PlusIcon className="h-4 w-4" />
          New List
        </button>

        <ListComposer open={composerOpen} onClose={() => setComposerOpen(false)} onSave={handleCreate} isSaving={createList.isPending} />
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map((list) => (
          <ListCard key={list.id} list={list} />
        ))}
      </div>

      <ListComposer open={composerOpen} onClose={() => setComposerOpen(false)} onSave={handleCreate} isSaving={createList.isPending} />
    </>)
}
