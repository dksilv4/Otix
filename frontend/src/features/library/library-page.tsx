import { useState, useRef, useMemo, useEffect } from "react"
import { useInView } from "framer-motion"
import { useParams, useNavigate } from "@tanstack/react-router"
import { BookmarkIcon, HeartIcon, CheckCircle2Icon, Gamepad2Icon, ListIcon, MusicIcon, PlusIcon, RefreshCw, EyeOffIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import { useLibraryTab, useSteamLibraryScan, useUnmatchedSteamGames, useSteamStatus, useSteamWishlist, useSteamWishlistScan, usePlexLibraryScan, usePlexStatus, useSpotifyLibraryScan, useSpotifyStatus, TAB_LABELS, LIBRARY_TABS, type LibraryTab, type UnmatchedGame } from "./library-queries"
import { useUserLists, useCreateList, type UserListCreate } from "@/features/list/list-queries"
import { ListCard } from "@/features/list/molecules/list-card"
import { ListComposer } from "@/features/list/organisms/list-composer"
import { useAuth } from "@/features/auth/auth-provider"
import { SteamIcon } from "@/features/dk-ui/atoms/steam-icon"
import { PlexIcon } from "@/features/dk-ui/atoms/plex-icon"
import { SpotifyIcon } from "@/features/dk-ui/atoms/spotify-icon"

const TAB_ICONS: Record<LibraryTab, React.ReactNode> = {
  watchlist: <BookmarkIcon className="h-4 w-4" />,
  like: <HeartIcon className="h-4 w-4" />,
  watched: <CheckCircle2Icon className="h-4 w-4" />,
  played: <Gamepad2Icon className="h-4 w-4" />,
  listened: <MusicIcon className="h-4 w-4" />,
  spotify: <SpotifyIcon className="h-4 w-4" />,
  steam: <SteamIcon className="h-4 w-4" />,
  plex: <PlexIcon className="h-4 w-4" />,
  wishlist: <BookmarkIcon className="h-4 w-4" />,
  lists: <ListIcon className="h-4 w-4" />,
}

const TABS: LibraryTab[] = ["watchlist", "like", "watched", "played", "listened", "spotify", "steam", "plex", "wishlist", "lists"]

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

function SteamEmptyState() {
  const scan = useSteamLibraryScan()

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)]">
        <SteamIcon className="h-8 w-8 opacity-40" />
      </div>
      <p className="text-lg font-semibold text-foreground">Steam library empty</p>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        Scan your Steam library to see your games here.
      </p>
      <button
        onClick={() => scan.mutate()}
        disabled={scan.isPending}
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
          "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
          scan.isPending && "opacity-60 pointer-events-none",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", scan.isPending && "animate-spin")} />
        {scan.isPending ? "Scanning..." : "Scan Library"}
      </button>
      {scan.data && (
        <p className="mt-2 text-xs text-muted-foreground">
          Found {scan.data.matchedInOtix} matches out of {scan.data.totalInSteam} Steam games.
        </p>
      )}
      {scan.error && (
        <p className="mt-2 text-xs text-destructive">
          Scan failed. Please try again.
        </p>
      )}
    </div>
  )
}

function PlexEmptyState() {
  const scan = usePlexLibraryScan()

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)]">
        <PlexIcon className="h-8 w-8 opacity-40" />
      </div>
      <p className="text-lg font-semibold text-foreground">Plex library empty</p>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        Sync your Plex servers to see your media here.
      </p>
      <button
        onClick={() => scan.mutate()}
        disabled={scan.isPending}
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
          "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
          scan.isPending && "opacity-60 pointer-events-none",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", scan.isPending && "animate-spin")} />
        {scan.isPending ? "Syncing..." : "Sync Plex"}
      </button>
      {scan.data && (
        <p className="mt-2 text-xs text-muted-foreground">
          Found {scan.data.matched} matches out of {scan.data.total} Plex items.
        </p>
      )}
      {scan.error && (
        <p className="mt-2 text-xs text-destructive">
          Sync failed. Please try again.
        </p>
      )}
    </div>
  )
}

function SpotifyEmptyState() {
  const scan = useSpotifyLibraryScan()

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)]">
        <SpotifyIcon className="h-8 w-8 opacity-40" />
      </div>
      <p className="text-lg font-semibold text-foreground">Spotify library empty</p>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        Sync your Spotify library to see your liked tracks and saved albums here.
      </p>
      <button
        onClick={() => scan.mutate()}
        disabled={scan.isPending}
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
          "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
          scan.isPending && "opacity-60 pointer-events-none",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", scan.isPending && "animate-spin")} />
        {scan.isPending ? "Syncing..." : "Sync Library"}
      </button>
      {scan.data && (
        <p className="mt-2 text-xs text-muted-foreground">
          Sync started. Track progress in Settings → Integrations.
        </p>
      )}
      {scan.error && (
        <p className="mt-2 text-xs text-destructive">
          Sync failed. Please try again.
        </p>
      )}
    </div>
  )
}

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  if (hours < 1) return `${Math.round(hours * 10) / 10}h`
  return `${Math.round(hours)}h`
}

export function LibraryPage() {
  const params = useParams({ from: "/library/$tab" })
  const navigate = useNavigate()
  const rawTab = params.tab as string
  const activeTab: LibraryTab = LIBRARY_TABS.includes(rawTab as LibraryTab) ? (rawTab as LibraryTab) : "watchlist"

  const [composerOpen, setComposerOpen] = useState(false)
  const createList = useCreateList()
  const { user } = useAuth()

  const isListsTab = activeTab === "lists"
  const isWishlistTab = activeTab === "wishlist"

  const visibleTabs = useMemo(
    () => {
      let filtered = [...TABS]
      if (!user?.steamId) {
        filtered = filtered.filter((t) => t !== "steam" && t !== "wishlist")
      }
      if (!user?.plexId) {
        filtered = filtered.filter((t) => t !== "plex")
      }
      if (!user?.spotifyId) {
        filtered = filtered.filter((t) => t !== "spotify")
      }
      return filtered
    },
    [user?.steamId, user?.plexId, user?.spotifyId],
  )

  useEffect(() => {
    if ((activeTab === "steam" || activeTab === "wishlist") && !user?.steamId) {
      navigate({ to: "/library/$tab", params: { tab: "watchlist" }, replace: true })
    }
    if (activeTab === "plex" && !user?.plexId) {
      navigate({ to: "/library/$tab", params: { tab: "watchlist" }, replace: true })
    }
    if (activeTab === "spotify" && !user?.spotifyId) {
      navigate({ to: "/library/$tab", params: { tab: "watchlist" }, replace: true })
    }
  }, [activeTab, user?.steamId, user?.plexId, user?.spotifyId, navigate])

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
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => navigate({ to: "/library/$tab", params: { tab }, replace: true })}
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
      ) : isWishlistTab ? (
        <WishlistTabContent />
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

function formatDaysAgo(unixTimestamp: number): string {
  const days = Math.floor((Date.now() / 1000 - unixTimestamp) / 86400)
  if (days <= 0) return "Today"
  if (days === 1) return "1d ago"
  if (days <= 14) return `${days}d ago`
  return ""
}

function MediaTabContent({ tab }: { tab: Exclude<LibraryTab, "lists" | "wishlist"> }) {
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(loadMoreRef, { margin: "0px 0px 800px 0px" })
  const [showUnmatched, setShowUnmatched] = useState(false)

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLibraryTab(tab)

  const { data: status } = useSteamStatus()

  const unmatchedQuery = useUnmatchedSteamGames()
  const unmatchedItems = useMemo(
    () => unmatchedQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [unmatchedQuery.data],
  )

  const scan = useSteamLibraryScan()

  const isPlexTab = tab === "plex"
  const plexStatusQuery = usePlexStatus()
  const plexStatus = isPlexTab ? plexStatusQuery.data : null
  const plexScan = usePlexLibraryScan()

  const isSpotifyTab = tab === "spotify"
  const spotifyStatusQuery = useSpotifyStatus()
  const spotifyStatus = isSpotifyTab ? spotifyStatusQuery.data : null
  const spotifyScan = useSpotifyLibraryScan()

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data]
  )

  const isSteamTab = tab === "steam"

  // Auto-scan if steam tab is shown and no games have been scanned
  useEffect(() => {
    if (isSteamTab && status && status.gameCount === 0 && !scan.isPending && !scan.data) {
      scan.mutate()
    }
  }, [isSteamTab, status, scan.isPending, scan.data, scan.mutate])

  // Auto-scan if plex tab is shown and no items have been scanned
  useEffect(() => {
    if (isPlexTab && plexStatus && plexStatus.itemCount === 0 && !plexScan.isPending && !plexScan.data) {
      plexScan.mutate()
    }
  }, [isPlexTab, plexStatus, plexScan.isPending, plexScan.data, plexScan.mutate])

  // Auto-scan if spotify tab is shown and no tracks have been synced
  useEffect(() => {
    if (isSpotifyTab && spotifyStatus && spotifyStatus.trackCount === 0 && !spotifyScan.isPending && !spotifyScan.data) {
      spotifyScan.mutate()
    }
  }, [isSpotifyTab, spotifyStatus, spotifyScan.isPending, spotifyScan.data, spotifyScan.mutate])

  useEffect(() => {
    if (isInView && hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage()
    }
  }, [isInView, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage])

  const unmatchedLoaded = unmatchedQuery.data != null

  return (
    <>
      {isLoading ? (
        <SkeletonGrid />
      ) : isError ? (
        <div className="flex items-center justify-center py-24">
          <p className="text-muted-foreground">Failed to load. Please try again.</p>
        </div>
      ) : items.length === 0 ? (
        isSteamTab ? <SteamEmptyState /> : isPlexTab ? <PlexEmptyState /> : isSpotifyTab ? <SpotifyEmptyState /> : <EmptyState tab={tab} />
      ) : (
        <>
          {isSteamTab && status && status.gameCount > 0 && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted-foreground">
                {status.lastScannedAt
                  ? `Last scanned ${formatDaysAgo(Math.floor(new Date(status.lastScannedAt).getTime() / 1000))}`
                  : `${status.gameCount} games in library`}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (!showUnmatched && !unmatchedLoaded) {
                      unmatchedQuery.refetch()
                    }
                    setShowUnmatched(!showUnmatched)
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-medium transition-colors",
                    showUnmatched ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <EyeOffIcon className="h-3.5 w-3.5" />
                  {showUnmatched ? "Hide unmatched" : "Show unmatched"}
                </button>
                <button
                  onClick={() => scan.mutate()}
                  disabled={scan.isPending}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors",
                    scan.isPending && "opacity-60 pointer-events-none",
                  )}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", scan.isPending && "animate-spin")} />
                  Rescan
                </button>
              </div>
            </div>
          )}

          {isPlexTab && plexStatus && plexStatus.itemCount > 0 && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted-foreground">
                {plexStatus.lastScannedAt
                  ? `Last synced ${formatDaysAgo(Math.floor(new Date(plexStatus.lastScannedAt).getTime() / 1000))}`
                  : `${plexStatus.itemCount} items in library`}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => plexScan.mutate()}
                  disabled={plexScan.isPending}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors",
                    plexScan.isPending && "opacity-60 pointer-events-none",
                  )}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", plexScan.isPending && "animate-spin")} />
                  Resync
                </button>
              </div>
            </div>
          )}

          <MediaGrid>
            {items.map((item) => (
              <div key={item.id} className="relative">
                <MediaCard
                  id={item.id}
                  mediaType={item.mediaType as "movie" | "show" | "game"}
                  title={item.title}
                  posterUrl={item.posterUrl}
                  textlessPosterUrl={item.textlessPosterUrl}
                  logoUrl={item.logoUrl}
                  releaseDate={item.releaseDate}
                />
                {isSteamTab && item.steamPlaytimeForever != null && item.steamPlaytimeForever > 0 && (
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <SteamIcon className="h-3 w-3 opacity-50 shrink-0" />
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {formatPlaytime(item.steamPlaytimeForever)}
                    </span>
                    {item.steamPlaytime2weeks != null && item.steamPlaytime2weeks > 0 && (
                      <span className="text-[10px] text-primary/70 tabular-nums">
                        +{formatPlaytime(item.steamPlaytime2weeks)} recent
                      </span>
                    )}
                    {item.steamRtimeLastPlayed != null && (() => {
                      const daysAgo = Math.floor((Date.now() / 1000 - item.steamRtimeLastPlayed) / 86400)
                      if (daysAgo <= 14) {
                        return <span className="text-[10px] text-green-500 font-medium">Recently played</span>
                      }
                      const ago = formatDaysAgo(item.steamRtimeLastPlayed)
                      if (ago) {
                        return <span className="text-[10px] text-muted-foreground">Last played {ago}</span>
                      }
                      return null
                    })()}
                  </div>
                )}
                {isPlexTab && item.plexViewCount != null && item.plexViewCount > 0 && (
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <PlexIcon className="h-3 w-3 opacity-50 shrink-0" />
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      Viewed {item.plexViewCount} times
                    </span>
                    {item.plexLastViewedAt != null && (() => {
                      const ts = Math.floor(new Date(item.plexLastViewedAt).getTime() / 1000)
                      const daysAgo = Math.floor((Date.now() / 1000 - ts) / 86400)
                      if (daysAgo <= 14) {
                        return <span className="text-[10px] text-green-500 font-medium">Recently viewed</span>
                      }
                      const ago = formatDaysAgo(ts)
                      if (ago) {
                        return <span className="text-[10px] text-muted-foreground">Last viewed {ago}</span>
                      }
                      return null
                    })()}
                  </div>
                )}
              </div>
            ))}
          </MediaGrid>

          {/* Unmatched games section */}
          {isSteamTab && showUnmatched && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                Unmatched Steam Games
                {unmatchedQuery.data?.pages[0] && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({unmatchedQuery.data.pages.reduce((sum, p) => sum + p.items.length, 0)} games not yet in Otix)
                  </span>
                )}
              </h3>
              {unmatchedQuery.isLoading ? (
                <SkeletonGrid />
              ) : unmatchedItems.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">All your Steam games have matches.</p>
              ) : (
                <UnmatchedGrid
                  items={unmatchedItems}
                  hasMore={unmatchedQuery.hasNextPage}
                  onLoadMore={() => unmatchedQuery.fetchNextPage()}
                  loading={unmatchedQuery.isFetchingNextPage}
                />
              )}
              {unmatchedQuery.isFetchingNextPage && (
                <div className="flex justify-center py-4">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {isSteamTab && scan.data && (
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Found {scan.data.matchedInOtix} matches out of {scan.data.totalInSteam} Steam games.
        </p>
      )}
      {scan.error && (
        <p className="mt-2 text-xs text-destructive text-center">
          Scan failed. Please try again.
        </p>
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

function UnmatchedGrid({ items, hasMore, onLoadMore, loading }: { items: UnmatchedGame[]; hasMore: boolean; onLoadMore: () => void; loading: boolean }) {
  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
        {items.map((game) => {
          const iconUrl = game.steamImgIconUrl
            ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.steamAppId}/${game.steamImgIconUrl}.jpg`
            : null
          return (
            <div key={game.id} className="flex flex-col items-center gap-1.5">
              <div className="aspect-square w-full rounded-xl bg-[var(--dk-surface-glass)] overflow-hidden flex items-center justify-center">
                {iconUrl ? (
                  <img src={iconUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <SteamIcon className="h-8 w-8 opacity-30" />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2">
                {game.steamName}
              </p>
              {game.steamPlaytimeForever > 0 && (
                <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                  {formatPlaytime(game.steamPlaytimeForever)}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className={cn(
              "text-xs font-medium text-muted-foreground hover:text-foreground transition-colors",
              loading && "opacity-60 pointer-events-none",
            )}
          >
            {loading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </>
  )
}

function WishlistEmptyState() {
  const scan = useSteamWishlistScan()

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)]">
        <BookmarkIcon className="h-8 w-8 opacity-40" />
      </div>
      <p className="text-lg font-semibold text-foreground">Wishlist empty</p>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        Scan your Steam wishlist to see your wishlisted games here.
      </p>
      <button
        onClick={() => scan.mutate()}
        disabled={scan.isPending}
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
          "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
          scan.isPending && "opacity-60 pointer-events-none",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", scan.isPending && "animate-spin")} />
        {scan.isPending ? "Scanning..." : "Scan Wishlist"}
      </button>
      {scan.data && scan.data.private && (
        <p className="mt-2 text-xs text-amber-500">
          Your Steam wishlist is private. Set your Steam profile privacy to Public to import your wishlist.
        </p>
      )}
      {scan.data && !scan.data.private && (
        <p className="mt-2 text-xs text-muted-foreground">
          Found {scan.data.matched} matches out of {scan.data.total} wishlist items.
        </p>
      )}
      {scan.error && (
        <p className="mt-2 text-xs text-destructive">
          Scan failed. Please try again.
        </p>
      )}
    </div>
  )
}

function WishlistTabContent() {
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(loadMoreRef, { margin: "0px 0px 800px 0px" })

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSteamWishlist()

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data]
  )

  useEffect(() => {
    if (isInView && hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage()
    }
  }, [isInView, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage])

  const scan = useSteamWishlistScan()

  return (
    <>
      {isLoading ? (
        <SkeletonGrid />
      ) : isError ? (
        <div className="flex items-center justify-center py-24">
          <p className="text-muted-foreground">Failed to load. Please try again.</p>
        </div>
      ) : items.length === 0 ? (
        <WishlistEmptyState />
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-muted-foreground">
              {items.length} wishlisted games in Otix
            </p>
            <button
              onClick={() => scan.mutate()}
              disabled={scan.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors",
                scan.isPending && "opacity-60 pointer-events-none",
              )}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", scan.isPending && "animate-spin")} />
              Rescan
            </button>
          </div>
          <MediaGrid>
            {items.map((item) => (
              <div key={item.id} className="relative">
                <MediaCard
                  id={item.id}
                  mediaType={item.mediaType as "movie" | "show" | "game"}
                  title={item.title}
                  posterUrl={item.posterUrl}
                  textlessPosterUrl={item.textlessPosterUrl}
                  logoUrl={item.logoUrl}
                  releaseDate={item.releaseDate}
                />
                {item.steamPriority > 0 && (
                  <div className="mt-1.5">
                    <span className="text-[10px] text-muted-foreground">
                      Priority {item.steamPriority}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </MediaGrid>
        </>
      )}

      {scan.data && (
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Found {scan.data.matched} matches out of {scan.data.total} wishlist items.
        </p>
      )}
      {scan.error && (
        <p className="mt-2 text-xs text-destructive text-center">
          Scan failed. Please try again.
        </p>
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
