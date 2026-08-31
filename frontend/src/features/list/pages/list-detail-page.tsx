import { useState, useCallback } from "react"
import { Helmet } from "react-helmet-async"
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
import { apiClient } from "@/lib/api/client"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import { SearchField } from "@ui/molecules/search-field"
import { DkTabs, DkTabList, DkTab } from "@/old-features/ui/molecules/tabs"
import { useAuth } from "@/lib/providers/auth"
import { useModal } from "@/lib/modals"
import { type MediaListResponse } from "@media/queries/media-queries"
import {
  useListDetail,
  useUpdateList,
  useDeleteList,
  useRemoveFromList,
  useAddToList,
  useReorderList,
} from "../../../old-features/list/list-queries"
import { ListComposer } from "../../../old-features/list/organisms/list-composer"
import {
  ListLikeButton,
  ShareModal,
  CollaboratorsModal,
  RankHistoryTimeline,
} from "../../../old-features/list/molecules/list-actions"

const TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "show", label: "Shows" },
  { value: "game", label: "Games" },
]

export function ListDetailPage() {
  const { listId } = useParams({ from: "/library/$listId" })
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: list, isLoading, isError } = useListDetail(listId)
  const updateList = useUpdateList()
  const deleteList = useDeleteList()
  const removeItem = useRemoveFromList()
  const addToList = useAddToList()

  const reorderList = useReorderList(listId)
  const { openModal } = useModal()

  const [addingMode, setAddingMode] = useState(false)
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
      const { data } = await apiClient.get<MediaListResponse>('/search', { params })
      return data
    },
    enabled: addingMode && searchQuery.length > 0,
    staleTime: 1000 * 60 * 5,
  })

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

  if (isLoading) {
    return (
      <div className="animate-fade-in pb-20 pt-4 sm:pt-6 px-4 sm:px-8 max-w-7xl mx-auto space-y-8">
        <div className="glass-card px-6 py-6 sm:px-8 sm:py-7">
          <div className="h-8 w-48 rounded-lg bg-[var(--dk-surface-glass)] animate-pulse mb-6" />
          <div className="h-10 w-full max-w-md rounded-lg bg-[var(--dk-surface-glass)] animate-pulse" />
        </div>
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 mb-5">
             <div className="h-4 w-0.5 rounded-full bg-primary/30 shrink-0" />
             <div className="h-5 w-24 rounded-lg bg-[var(--dk-surface-glass)] animate-pulse" />
          </div>
          <MediaGrid>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[2/3] rounded-lg bg-[var(--dk-surface-glass)] animate-pulse"
              />
            ))}
          </MediaGrid>
        </div>
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
    navigate({ to: "/library/watchlist" })
  }

  async function handleRemoveItem(mediaItemId: string, mediaType: string) {
    await removeItem.mutateAsync({ listId, mediaItemId, mediaType })
  }

  return (
    <div className="animate-fade-in pb-20 pt-4 sm:pt-6 px-4 sm:px-8 max-w-7xl mx-auto space-y-8">
      <Helmet>
        <title>{`${list.name} - List - Otix`}</title>
        {list.description && <meta name="description" content={list.description.slice(0, 200)} />}
        <meta property="og:title" content={`${list.name} - List - Otix`} />
        {list.description && <meta property="og:description" content={list.description.slice(0, 200)} />}
        <meta name="twitter:card" content="summary" />
      </Helmet>

      {/* Header Card */}
      <div
        className={cn(
          "glass-card px-6 py-6 sm:px-8 sm:py-7 animate-section-in relative overflow-hidden transition-all duration-500",
          addingMode && "ring-1 ring-primary/30 shadow-2xl shadow-primary/10"
        )}
        style={{ '--section-delay': '60ms' } as React.CSSProperties}
      >
        <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
                background: 'radial-gradient(ellipse 60% 50% at 50% 0%, hsl(var(--primary)) 0%, transparent 100%)',
            }}
        />
        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white truncate">{list.name}</h1>
              {list.isPublic ? (
                <ShareIcon className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <LockIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <ListLikeButton list={list} />
            </div>
            {list.description && (
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground/80 max-w-2xl">
                {list.description}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => openModal(<ShareModal list={list} />)}
              className="glass-inset inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white/90 transition-all hover:bg-white/10 hover:text-white"
            >
              <ShareIcon className="h-4 w-4" />
              Share
            </button>

            {isOwner && (
              <>
                <button
                  onClick={() => setAddingMode(!addingMode)}
                  className={cn(
                    "glass-inset inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white/90 transition-all hover:bg-white/10 hover:text-white",
                    addingMode && "bg-white/10 text-white"
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
                  onClick={() => openModal(
                    <ListComposer
                      initial={list}
                      onSave={async (data) => {
                        await updateList.mutateAsync({ listId, ...data })
                      }}
                    />
                  )}
                  className="glass-inset inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white/90 transition-all hover:bg-white/10 hover:text-white"
                >
                  <PencilIcon className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={() => openModal(<CollaboratorsModal list={list} />)}
                  className="glass-inset inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white/90 transition-all hover:bg-white/10 hover:text-white"
                >
                  <UsersIcon className="h-4 w-4" />
                  Collab
                </button>
                <button
                  onClick={handleDelete}
                  className="glass-inset inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-red-400 transition-all hover:bg-red-500/20 hover:text-red-300 border-red-500/10"
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        {/* Embedded Search panel */}
        {addingMode && (
          <div className="relative z-10 mt-8 pt-8 border-t border-white/10 animate-fade-in space-y-6">
            <div className="flex flex-col gap-4 items-start lg:flex-row lg:items-center">
              <SearchField
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search movies, shows, or games..."
                className="flex-1 w-full max-w-xl"
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

            {/* Search Results */}
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
              <div className="max-h-[500px] overflow-y-auto pr-2 pb-4 scrollbar-none rounded-xl">
                <MediaGrid>
                  {searchItems.map((item) => {
                    const alreadyAdded = itemIds.has(item.id)
                    return (
                      <div key={item.id} className="relative group">
                        <MediaCard
                          id={item.id}
                          mediaType={item.mediaType as "movie" | "show" | "game" | "music"}
                          title={item.title}
                          posterUrl={item.posterUrl}
                          textlessPosterUrl={item.textlessPosterUrl}
                          logoUrl={item.logoUrl}
                          releaseDate={item.releaseDate}
                          isAdult={item.isAdult}
                          artistName={item.albumArtistName}
                          tmdbId={item.tmdbId}
                        />
                        {alreadyAdded ? (
                          <span className="absolute top-2 right-2 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase backdrop-blur-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                            Added
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              addToList.mutate({ listId, mediaItemId: item.id, mediaType: item.mediaType })
                            }}
                            className="absolute top-2 right-2 rounded-full p-2 backdrop-blur-md bg-black/60 text-white/70 opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-white transition-all duration-200"
                          >
                            <PlusIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </MediaGrid>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Items */}
      <div 
        className={cn(
          "animate-section-in space-y-4 transition-opacity duration-300",
          addingMode && "opacity-40 pointer-events-none"
        )} 
        style={{ '--section-delay': '140ms' } as React.CSSProperties}
      >
        {isOwner && list.items.length > 1 && (
          <div className="flex justify-end px-2">
            <p className="text-xs font-medium text-white/30 hidden sm:block uppercase tracking-wider">
              Drag to reorder
            </p>
          </div>
        )}
        
        {list.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-semibold text-white/90">
              This list is empty
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
              Find media you love and add it to this list.
            </p>
            {isOwner && (
              <button
                onClick={() => setAddingMode(true)}
                className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold bg-white text-black hover:bg-white/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <PlusIcon className="h-4 w-4" />
                Add Items
              </button>
            )}
          </div>
        ) : (
          <MediaGrid>
            {list.items.map((item, index) => (
              <div
                key={item.id}
                className={cn(
                  "relative group transition-all duration-200",
                  dragIndex === index && "opacity-50 scale-95",
                  dropIndex === index && dragIndex !== index && "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-xl scale-[1.02]",
                )}
                draggable={isOwner}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                onDragLeave={handleDragLeave}
              >
                {isOwner && (
                  <div className="absolute top-2 left-2 z-10 rounded-full p-1.5 backdrop-blur-md bg-black/50 text-white/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing hover:bg-black/70 hover:text-white">
                    <GripVerticalIcon className="h-4 w-4" />
                  </div>
                )}
                <MediaCard
                  id={item.id}
                  mediaType={item.mediaType as "movie" | "show" | "game" | "music"}
                  title={item.title}
                  posterUrl={item.posterUrl}
                  textlessPosterUrl={item.textlessPosterUrl}
                  logoUrl={item.logoUrl}
                  releaseDate={item.releaseDate}
                  isAdult={item.isAdult}
                  artistName={item.albumArtistName}
                  tmdbId={item.tmdbId}
                />
                {isOwner && (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      handleRemoveItem(item.id, item.mediaType)
                    }}
                    className="absolute top-2 right-2 rounded-full p-1.5 backdrop-blur-md bg-black/50 text-white/60 opacity-0 group-hover:opacity-100 hover:bg-red-500/80 hover:text-white transition-all duration-200"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </MediaGrid>
        )}
      </div>

      {/* Rank history */}
      <div className="animate-section-in" style={{ '--section-delay': '180ms' } as React.CSSProperties}>
        <RankHistoryTimeline listId={listId} />
      </div>
    </div>
  )
}
