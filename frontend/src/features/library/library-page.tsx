import { useState, useRef, useMemo, useEffect } from "react"
import { useInView } from "framer-motion"
import { BookmarkIcon, HeartIcon, CheckCircle2Icon, Gamepad2Icon, ListIcon, PlusIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import { useLibraryTab, TAB_LABELS, type LibraryTab } from "./library-queries"
import { useUserLists, useCreateList, type UserListCreate } from "@/features/list/list-queries"
import { ListCard } from "@/features/list/molecules/list-card"
import { ListComposer } from "@/features/list/organisms/list-composer"

const TAB_ICONS: Record<LibraryTab, React.ReactNode> = {
  watchlist: <BookmarkIcon className="h-4 w-4" />,
  like: <HeartIcon className="h-4 w-4" />,
  watched: <CheckCircle2Icon className="h-4 w-4" />,
  played: <Gamepad2Icon className="h-4 w-4" />,
  lists: <ListIcon className="h-4 w-4" />,
}

const TABS: LibraryTab[] = ["watchlist", "like", "watched", "played", "lists"]

function SkeletonGrid() {
  return (
    <MediaGrid>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[2/3] rounded-lg bg-[var(--dk-surface-glass)] animate-pulse"
        />
      ))}
    </MediaGrid>
  )
}

function EmptyState({ tab }: { tab: LibraryTab }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
        {TAB_ICONS[tab]}
      </div>
      <p className="text-lg font-semibold text-foreground">
        No {TAB_LABELS[tab]} items yet
      </p>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        Items you mark will appear here. Browse and start adding to your collection.
      </p>
    </div>
  )
}

export function LibraryPage() {
  const [activeTab, setActiveTab] = useState<LibraryTab>("watchlist")
  const [composerOpen, setComposerOpen] = useState(false)
  const createList = useCreateList()

  const isListsTab = activeTab === "lists"

  function handleCreate(data: UserListCreate) {
    createList.mutate(data, { onSuccess: () => setComposerOpen(false) })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your saved, liked, watched items, and lists.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 whitespace-nowrap",
              activeTab === tab
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]"
            )}
          >
            {TAB_ICONS[tab]}
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {isListsTab ? (
        <ListsTabContent onCreateClick={() => setComposerOpen(true)} />
      ) : (
        <MediaTabContent tab={activeTab} />
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

function MediaTabContent({ tab }: { tab: Exclude<LibraryTab, "lists"> }) {
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(loadMoreRef, { margin: "0px 0px 800px 0px" })

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLibraryTab(tab)

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data]
  )

  useEffect(() => {
    if (isInView && hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage()
    }
  }, [isInView, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage])

  return (
    <>
      {isLoading ? (
        <SkeletonGrid />
      ) : isError ? (
        <div className="flex items-center justify-center py-24">
          <p className="text-muted-foreground">Failed to load. Please try again.</p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <MediaGrid>
          {items.map((item) => (
            <MediaCard
              key={item.id}
              id={item.id}
              mediaType={item.mediaType as "movie" | "show" | "game"}
              title={item.title}
              posterUrl={item.posterUrl}
              textlessPosterUrl={item.textlessPosterUrl}
              logoUrl={item.logoUrl}
              releaseDate={item.releaseDate}
            />
          ))}
        </MediaGrid>
      )}

      <div ref={loadMoreRef} className="flex justify-center py-8">
        {isFetchingNextPage && (
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        )}
        {!hasNextPage && items.length > 0 && (
          <p className="text-xs text-muted-foreground">End of list</p>
        )}
      </div>
    </>
  )
}

function ListsTabContent({ onCreateClick }: { onCreateClick: () => void }) {
  const { data: lists, isLoading } = useUserLists()

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
          onClick={onCreateClick}
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
      {lists.map((list) => (
        <ListCard key={list.id} list={list} />
      ))}
    </div>
  )
}
