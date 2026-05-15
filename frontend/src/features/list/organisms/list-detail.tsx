import { useState, useCallback } from "react"
import { useParams, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  PencilIcon,
  TrashIcon,
  ShareIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
  UsersIcon,
  GripVerticalIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { apiClient } from "@/lib/api-client"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import { SearchField } from "@ui/molecules/search-field"
import { DkTabs, DkTabList, DkTab } from "@/features/dk-ui/molecules/tabs"
import { useAuth } from "@/features/auth/auth-provider"
import { type MediaListResponse } from "@/features/media/media-queries"
import {
  useListDetail,
  useUpdateList,
  useDeleteList,
  useRemoveFromList,
  useAddToList,
  useReorderList,
} from "../list-queries"
import { ListComposer } from "./list-composer"
import {
  ListLikeButton,
  ShareModal,
  CollaboratorsModal,
  RankHistoryTimeline,
} from "../molecules/list-actions"

const TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "show", label: "Shows" },
  { value: "game", label: "Games" },
]

export function ListDetail() {
  const { listId } = useParams({ from: "/list/$listId" })
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: list, isLoading, isError } = useListDetail(listId)
  const updateList = useUpdateList()
  const deleteList = useDeleteList()
  const removeItem = useRemoveFromList()
  const addToList = useAddToList()

  const reorderList = useReorderList(listId)

  const [composerOpen, setComposerOpen] = useState(false)
  const [addingMode, setAddingMode] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchType, setSearchType] = useState<string>("all")
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const itemIds = new Set(list?.items.map((i) => i.id) ?? [])

  const {
    data: searchData,
    isFetching: searchLoading,
  } = useQuery({
    queryKey: ['list', listId, 'search', searchQuery, searchType],
    queryFn: async () => {
      const params: Record<string, string> = { q: searchQuery, page_size: '24' }
      if (searchType !== 'all') params.media_type = searchType
      const { data } = await apiClient.get<MediaListResponse>('/media/search', { params })
      return data
    },
    enabled: addingMode && searchQuery.length > 0,
    staleTime: 1000 * 60 * 5,
  })

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="h-8 w-48 rounded-lg bg-[var(--dk-surface-glass)] animate-pulse" />
        <MediaGrid>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] rounded-lg bg-[var(--dk-surface-glass)] animate-pulse"
            />
          ))}
        </MediaGrid>
      </div>
    )
  }

  if (isError || !list) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">List not found.</p>
      </div>
    )
  }

  const isOwner = user?.id === list.userId
  const searchItems = searchData?.items ?? []

  async function handleDelete() {
    if (!confirm("Delete this list?")) return
    await deleteList.mutateAsync(listId)
    navigate({ to: "/library/$tab", params: { tab: "watchlist" } })
  }

  async function handleRemoveItem(mediaItemId: string) {
    await removeItem.mutateAsync({ listId, mediaItemId })
  }

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDropIndex(index)
  }, [])

  const handleDragEnd = useCallback(() => {
    if (dragIndex != null && dropIndex != null && dragIndex !== dropIndex && list) {
      const newItems = [...list.items]
      const [removed] = newItems.splice(dragIndex, 1)
      newItems.splice(dropIndex, 0, removed)
      reorderList.mutate(newItems.map((i) => i.id))
    }
    setDragIndex(null)
    setDropIndex(null)
  }, [dragIndex, dropIndex, list, reorderList])

  const handleDragLeave = useCallback(() => {
    setDropIndex(null)
  }, [])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{list.name}</h1>
            {list.isPublic ? (
              <ShareIcon className="h-4 w-4 text-emerald-400" />
            ) : (
              <LockIcon className="h-4 w-4 text-muted-foreground" />
            )}
            <ListLikeButton list={list} />
          </div>
          {list.description && (
            <p className="mt-2 text-sm text-muted-foreground max-w-xl">
              {list.description}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShareOpen(true)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium",
              "bg-[var(--dk-surface-base)]",
              "text-foreground hover:bg-[var(--dk-surface-glass)] transition-colors",
            )}
          >
            <ShareIcon className="h-4 w-4" />
            Share
          </button>

          {isOwner && (
            <>
              <button
                onClick={() => setAddingMode(!addingMode)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium",
                  "bg-[var(--dk-surface-base)]",
                  "text-foreground hover:bg-[var(--dk-surface-glass)] transition-colors",
                )}
              >
                {addingMode ? (
                  <>
                    <XIcon className="h-4 w-4" />
                    Done
                  </>
                ) : (
                  <>
                    <PlusIcon className="h-4 w-4" />
                    Add Items
                  </>
                )}
              </button>
              <button
                onClick={() => setComposerOpen(true)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium",
                  "bg-[var(--dk-surface-base)]",
                  "text-foreground hover:bg-[var(--dk-surface-glass)] transition-colors",
                )}
              >
                <PencilIcon className="h-4 w-4" />
                Edit
              </button>
              <button
                onClick={() => setCollaboratorsOpen(true)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium",
                  "bg-[var(--dk-surface-base)]",
                  "text-foreground hover:bg-[var(--dk-surface-glass)] transition-colors",
                )}
              >
                <UsersIcon className="h-4 w-4" />
                Collab
              </button>
              <button
                onClick={handleDelete}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium",
                  "border border-white/[0.06] bg-red-500/10 text-red-400",
                  "hover:bg-red-500/20 transition-colors",
                )}
              >
                <TrashIcon className="h-4 w-4" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search panel */}
      {addingMode && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <SearchField
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search movies, shows, or games..."
              className="flex-1 w-full"
            />

            <DkTabs
              defaultValue="all"
              value={searchType}
              onValueChange={setSearchType}
            >
              <DkTabList>
                {TYPE_TABS.map((tab) => (
                  <DkTab key={tab.value} value={tab.value}>
                    {tab.label}
                  </DkTab>
                ))}
              </DkTabList>
            </DkTabs>
          </div>

          {!searchQuery ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <SearchIcon className="h-8 w-8 mb-3 opacity-40" />
              <p className="text-sm">Search for titles to add</p>
            </div>
          ) : searchLoading ? (
            <MediaGrid>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[2/3] rounded-lg bg-[var(--dk-surface-glass)] animate-pulse"
                />
              ))}
            </MediaGrid>
          ) : searchItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p className="text-sm">No results found</p>
            </div>
          ) : (
            <MediaGrid>
              {searchItems.map((item) => {
                const alreadyAdded = itemIds.has(item.id)
                return (
                  <div key={item.id} className="relative group/item">
                    <MediaCard
                      id={item.id}
                      mediaType={item.mediaType as "movie" | "show" | "game"}
                      title={item.title}
                      posterUrl={item.posterUrl}
                      textlessPosterUrl={item.textlessPosterUrl}
                      logoUrl={item.logoUrl}
                      releaseDate={item.releaseDate}
                    />
                    {alreadyAdded ? (
                      <span
                        className={cn(
                          "absolute top-2 right-2 rounded-full px-2.5 py-1",
                          "bg-emerald-500/20 text-emerald-400 text-xs font-medium",
                          "backdrop-blur-sm",
                        )}
                      >
                        Added
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          addToList.mutate({ listId, mediaItemId: item.id })
                        }}
                        className={cn(
                          "absolute top-2 right-2 rounded-full p-2",
                          "bg-black/70 text-white/70 hover:text-white hover:bg-primary/80",
                          "opacity-0 group-hover/item:opacity-100 transition-opacity",
                          "backdrop-blur-sm",
                        )}
                      >
                        <PlusIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )
              })}
            </MediaGrid>
          )}
        </div>
      )}

      {/* Items */}
      {!addingMode && (
        <>
          {list.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <p className="text-lg font-semibold text-foreground">
                This list is empty
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Find media you love and add it to this list.
              </p>
              {isOwner && (
                <button
                  onClick={() => setAddingMode(true)}
                  className={cn(
                    "mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
                    "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
                  )}
                >
                  <PlusIcon className="h-4 w-4" />
                  Add Items
                </button>
              )}
            </div>
          ) : (
            <>
              {isOwner && list.items.length > 1 && (
                <p className="text-xs text-muted-foreground mb-2">
                  Drag items to reorder your list.
                </p>
              )}
              <MediaGrid>
                {list.items.map((item, index) => (
                  <div
                    key={item.id}
                    className={cn(
                      "relative group/item transition-opacity duration-150",
                      dragIndex === index && "opacity-50",
                      dropIndex === index && dragIndex !== index && "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-lg",
                    )}
                    draggable={isOwner}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragLeave={handleDragLeave}
                  >
                    {isOwner && (
                      <div className="absolute top-2 left-2 z-10 rounded-full p-1 bg-black/70 text-white/50 opacity-0 group-hover/item:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                        <GripVerticalIcon className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <MediaCard
                      id={item.id}
                      mediaType={item.mediaType as "movie" | "show" | "game"}
                      title={item.title}
                      posterUrl={item.posterUrl}
                      textlessPosterUrl={item.textlessPosterUrl}
                      logoUrl={item.logoUrl}
                      releaseDate={item.releaseDate}
                    />
                    {isOwner && (
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          handleRemoveItem(item.id)
                        }}
                        className={cn(
                          "absolute top-2 right-2 rounded-full p-1.5",
                          "bg-black/70 text-white/70 hover:text-red-400",
                          "opacity-0 group-hover/item:opacity-100 transition-opacity",
                        )}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </MediaGrid>
            </>
          )}
        </>
      )}

      {/* Rank history */}
      {!addingMode && <RankHistoryTimeline listId={listId} />}

      {/* Edit dialog */}
      <ListComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onSave={(data) => {
          updateList.mutate(
            { listId, ...data },
            { onSuccess: () => setComposerOpen(false) },
          )
        }}
        initial={list}
        isSaving={updateList.isPending}
      />

      {/* Share modal */}
      <ShareModal
        list={list}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />

      {/* Collaborators modal */}
      <CollaboratorsModal
        list={list}
        open={collaboratorsOpen}
        onClose={() => setCollaboratorsOpen(false)}
      />
    </div>
  )
}
