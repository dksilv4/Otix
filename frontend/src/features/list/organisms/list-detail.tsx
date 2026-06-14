// TODO: Review this file
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
import "./list-detail.scss"
import { cn } from "@/lib/utils"
import { apiClient } from "@/lib/api-client"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import { SearchField } from "@ui/molecules/search-field"
import { DkTabs, DkTabList, DkTab } from "@/features/dk-ui/molecules/tabs"
import { useAuth } from "@/lib/auth"
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
 <div className="dk-list-detail">
 <div className="dk-list-detail__skeleton-title" />
 <MediaGrid>
 {Array.from({ length: 6 }).map((_, i) => (
 <div
 key={i}
 className="dk-list-detail__skeleton-card"
 />
 ))}
 </MediaGrid>
 </div>
 )
 }

 if (isError || !list) {
 return (
 <div className="dk-list-detail__error-state">
 <p className="dk-list-detail__error-text">List not found.</p>
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

 async function handleRemoveItem(mediaItemId: string) {
 await removeItem.mutateAsync({ listId, mediaItemId })
 }

 return (
 <div className="dk-list-detail">
 <Helmet>
 <title>{`${list.name} - List - Otix`}</title>
 {list.description && <meta name="description" content={list.description.slice(0, 200)} />}
 <meta property="og:title" content={`${list.name} - List - Otix`} />
 {list.description && <meta property="og:description" content={list.description.slice(0, 200)} />}
 <meta name="twitter:card" content="summary" />
 </Helmet>
 {/* Header */}
 <div className="dk-list-detail__header">
 <div>
 <div className="dk-list-detail__title-row">
 <h1 className="dk-list-detail__title">{list.name}</h1>
 {list.isPublic ? (
 <ShareIcon className="h-4 w-4 text-emerald-400" />
 ) : (
 <LockIcon className="h-4 w-4 text-muted-foreground" />
 )}
 <ListLikeButton list={list} />
 </div>
 {list.description && (
 <p className="dk-list-detail__description">
 {list.description}
 </p>
 )}
 </div>

 <div className="dk-list-detail__actions">
 <button
 onClick={() => setShareOpen(true)}
 className="dk-list-detail__action-btn"
 >
 <ShareIcon className="h-4 w-4" />
 Share
 </button>

 {isOwner && (
 <>
 <button
 onClick={() => setAddingMode(!addingMode)}
 className="dk-list-detail__action-btn"
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
 className="dk-list-detail__action-btn"
 >
 <PencilIcon className="h-4 w-4" />
 Edit
 </button>
 <button
 onClick={() => setCollaboratorsOpen(true)}
 className="dk-list-detail__action-btn"
 >
 <UsersIcon className="h-4 w-4" />
 Collab
 </button>
 <button
 onClick={handleDelete}
 className="dk-list-detail__action-btn--delete"
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
 <div className="dk-list-detail__search-panel">
 <div className="dk-list-detail__search-bar">
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
 <div className="dk-list-detail__search-empty">
 <SearchIcon className="h-8 w-8 mb-3 opacity-40" />
 <p className="text-sm">Search for titles to add</p>
 </div>
 ) : searchLoading ? (
 <MediaGrid>
 {Array.from({ length: 6 }).map((_, i) => (
 <div
 key={i}
 className="dk-list-detail__skeleton-card"
 />
 ))}
 </MediaGrid>
 ) : searchItems.length === 0 ? (
 <div className="dk-list-detail__search-empty">
 <p className="text-sm">No results found</p>
 </div>
 ) : (
 <MediaGrid>
 {searchItems.map((item) => {
 const alreadyAdded = itemIds.has(item.id)
 return (
 <div key={item.id} className="dk-list-detail__search-item">
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
 />
 {alreadyAdded ? (
 <span className="dk-list-detail__added-badge">
 Added
 </span>
 ) : (
 <button
 onClick={(e) => {
 e.preventDefault()
 addToList.mutate({ listId, mediaItemId: item.id })
 }}
 className="dk-list-detail__add-button"
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
 <div className="dk-list-detail__empty">
 <p className="dk-list-detail__empty-title">
 This list is empty
 </p>
 <p className="dk-list-detail__empty-text">
 Find media you love and add it to this list.
 </p>
 {isOwner && (
 <button
 onClick={() => setAddingMode(true)}
 className="dk-list-detail__empty-add-btn"
 >
 <PlusIcon className="h-4 w-4" />
 Add Items
 </button>
 )}
 </div>
 ) : (
 <>
 {isOwner && list.items.length > 1 && (
 <p className="dk-list-detail__drag-hint">
 Drag items to reorder your list.
 </p>
 )}
 <MediaGrid>
 {list.items.map((item, index) => (
 <div
 key={item.id}
 className={cn(
 "dk-list-detail__item",
 dragIndex === index && "dk-list-detail__item--dragging",
 dropIndex === index && dragIndex !== index && "dk-list-detail__item--drop-target",
 )}
 draggable={isOwner}
 onDragStart={() => handleDragStart(index)}
 onDragOver={(e) => handleDragOver(e, index)}
 onDragEnd={handleDragEnd}
 onDragLeave={handleDragLeave}
 >
 {isOwner && (
 <div className="dk-list-detail__drag-handle">
 <GripVerticalIcon className="h-3.5 w-3.5" />
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
 />
 {isOwner && (
 <button
 onClick={(e) => {
 e.preventDefault()
 handleRemoveItem(item.id)
 }}
 className="dk-list-detail__remove-btn"
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
