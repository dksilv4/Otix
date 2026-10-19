import { useRef, useMemo, useEffect, useState } from "react"
import { useInView } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import { BookmarkIcon, CloudUpload, HardDrive, Loader2, WifiOff } from "lucide-react"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import { useLibraryTab, TAB_LABELS } from "../library-queries"
import type { LibraryTab } from "../library-queries"
import { libraryKeys } from "../library-keys"
import { useAuth } from "@auth/hooks/use-auth"
import { useOffline } from "@/lib/offline"
import { OfflineNotice } from "@/lib/offline-notice"
import { showToast } from "@ui/molecules/toast"
import {
  clearOfflineWatchlist,
  syncOfflineWatchlist,
  useOfflineWatchlistItems,
  type OfflineWatchlistItem,
} from "@/features/interaction/offline-watchlist"
import { SkeletonGrid } from "./skeleton-grid"

const OfflineWatchlistTab = ({ items }: { items: OfflineWatchlistItem[] }) => {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
          <BookmarkIcon className="h-6 w-6" />
        </div>
        <p className="text-lg font-semibold text-foreground">No watchlist items yet</p>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          Tap the bookmark on any title to save it here — even without an account.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <HardDrive className="h-3.5 w-3.5 shrink-0" />
          {items.length} {items.length === 1 ? "title" : "titles"} saved on this device
        </div>
        <button
          type="button"
          onClick={() => clearOfflineWatchlist()}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear
        </button>
      </div>
      <MediaGrid>
        {(Array.isArray(items) ? items.filter((item) => item && item.mediaId) : []).map((item) => (
          <MediaCard
            key={`${item.mediaType}-${item.mediaId}`}
            id={item.mediaId}
            mediaType={item.mediaType as "movie" | "show" | "game" | "music"}
            title={item.title ?? "Untitled"}
            posterUrl={item.posterUrl}
            textlessPosterUrl={item.textlessPosterUrl}
            backdropUrl={item.backdropUrl}
            logoUrl={item.logoUrl}
            releaseDate={item.releaseDate}
          />
        ))}
      </MediaGrid>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        These are stored locally. Sign in and choose "Sync watchlist" to move them to your
        account.
      </p>
    </>
  )
};

export const MediaTabContent = ({ tab }: { tab: LibraryTab }) => {
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(loadMoreRef, { margin: "0px 0px 800px 0px" })
  const offline = useOffline()
  const { isAuthenticated } = useAuth()
  const qc = useQueryClient()
  const offlineItems = useOfflineWatchlistItems()
  const [syncing, setSyncing] = useState(false)

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLibraryTab(tab)

  const items = useMemo(
    () => data?.pages?.flatMap((page) => (Array.isArray(page?.items) ? page.items.filter(Boolean) : [])) ?? [],
    [data]
  )

  useEffect(() => {
    if (isInView && hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage()
    }
  }, [isInView, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage])

  const handleSyncOffline = async () => {
    setSyncing(true)
    try {
      const { synced } = await syncOfflineWatchlist()
      clearOfflineWatchlist()
      qc.invalidateQueries({ queryKey: libraryKeys.all() })
      showToast({
        title: "Watchlist synced",
        description:
          synced === 0
            ? "Nothing could be synced — try again later."
            : synced === 1
              ? "1 title added to your account watchlist."
              : `${synced} titles added to your account watchlist.`,
        variant: synced === 0 ? "error" : "success",
      })
    } catch {
      showToast({
        title: "Sync failed",
        description: "Could not sync your watchlist. It stays saved on this device.",
        variant: "error",
      })
    } finally {
      setSyncing(false)
    }
  }

  // Signed-out users browse the watchlist tab from the local offline store.
  if (tab === "watchlist" && !isAuthenticated) {
    return <OfflineWatchlistTab items={offlineItems} />
  }

  if (isLoading) return <SkeletonGrid />
  if (isError) {
    if (offline) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
            <WifiOff className="h-6 w-6" />
          </div>
          <p className="text-lg font-semibold text-foreground">You're offline</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            No saved {TAB_LABELS[tab]} data is available yet. Connect to the internet to load your
            library.
          </p>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">Failed to load. Please try again.</p>
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
          <BookmarkIcon className="h-6 w-6" />
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

  return (
    <>
      {offline && <OfflineNotice className="mb-4" />}
      {isAuthenticated && tab === "watchlist" && offlineItems.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CloudUpload className="h-3.5 w-3.5 shrink-0" />
            {offlineItems.length}{" "}
            {offlineItems.length === 1 ? "title" : "titles"} saved on this device aren't in
            your account yet.
          </div>
          <button
            type="button"
            disabled={syncing}
            onClick={handleSyncOffline}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {syncing && <Loader2 className="h-3 w-3 animate-spin" />}
            Sync now
          </button>
        </div>
      )}
      <MediaGrid>
        {(Array.isArray(items) ? items.filter((item) => item && item.id) : []).map((item) => (
          <MediaCard
            key={item.id}
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
        ))}
      </MediaGrid>
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
};
