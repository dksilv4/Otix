import { PlusIcon, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { useOffline } from "@/lib/offline"
import { useUserLists, useCreateList, type UserListCreate, ListComposer, ListCard } from "@list"
import { useModal } from "@/lib/modals"

export function ListsTabContent() {
  const { data: lists, isLoading, isError } = useUserLists()
  const offline = useOffline()
  const createList = useCreateList()
  const { openModal } = useModal()

  const handleCreate = async (data: UserListCreate) => {
    await createList.mutateAsync(data)
  }

  const openComposer = () => openModal(<ListComposer onSave={handleCreate} />)

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

  if (isError && offline && !lists) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
          <WifiOff className="h-6 w-6" />
        </div>
        <p className="text-lg font-semibold text-foreground">You're offline</p>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          No saved lists are available yet. Connect to the internet to load them.
        </p>
      </div>
    )
  }

  const listItems = Array.isArray(lists) ? lists.filter(Boolean) : []

  if (!lists || listItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">No lists yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a list to start curating your favorite titles.
        </p>
        <button
          onClick={openComposer}
          className={cn(
            "mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
            "bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          )}
        >
          <PlusIcon className="h-4 w-4" />
          New List
        </button>
      </div>
    )
  }

  return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listItems.map((list) => (
          <ListCard key={list.id} list={list} />
        ))}
      </div>
  )
}
