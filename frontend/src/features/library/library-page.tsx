import { useState, useRef, useMemo, useEffect } from "react"
import { useInView } from "framer-motion"
import { useParams, useNavigate, useSearch } from "@tanstack/react-router"
import { BookmarkIcon, HeartIcon, CheckCircle2Icon, Gamepad2Icon, ListIcon, MusicIcon, PlusIcon, RefreshCw, EyeOffIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import { useLibraryTab, useSteamLibraryScan, useUnmatchedSteamGames, useSteamStatus, useSteamWishlist, useSteamWishlistScan, usePlexLibraryScan, usePlexStatus, useSpotifyLibraryScan, useSpotifyStatus, useSpotifyPlaylists, useSpotifyPlaylistTracks, useSpotifyLikedTracks, useSaveSpotifyTrack, TAB_LABELS, LIBRARY_TABS, type LibraryTab, type UnmatchedGame, type SpotifyTrack } from "./library-queries"
import { useUserLists, useCreateList, type UserListCreate } from "@/features/list/list-queries"
import { ListCard } from "@/features/list/molecules/list-card"
import { ListComposer } from "@/features/list/organisms/list-composer"
import { useAuth } from "@/features/auth/auth-provider"
import { SteamIcon } from "@/features/dk-ui/atoms/steam-icon"
import { PlexIcon } from "@/features/dk-ui/atoms/plex-icon"
import { SpotifyIcon } from "@/features/dk-ui/atoms/spotify-icon"
import { useSpotifyPlayer } from "@/features/spotify/spotify-player-provider"
import { TrackInlineActions } from "@/features/media/molecules/track-inline-actions"
import { useRateTrack } from "@/features/media/media-queries"
import { useToast } from "@/features/dk-ui/molecules/toast"

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
  const { user, isLoading: authLoading } = useAuth()

  const isListsTab = activeTab === "lists"
  const isWishlistTab = activeTab === "wishlist"
  const isSpotifyTab = activeTab === "spotify"

  const visibleTabs = useMemo(
    () => {
      let filtered = [...TABS]
      if (authLoading) return filtered
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
    [user?.steamId, user?.plexId, user?.spotifyId, authLoading],
  )

  useEffect(() => {
    if (authLoading) return
    if ((activeTab === "steam" || activeTab === "wishlist") && !user?.steamId) {
      navigate({ to: "/library/$tab", params: { tab: "watchlist" }, search: {} as never, replace: true })
    }
    if (activeTab === "plex" && !user?.plexId) {
      navigate({ to: "/library/$tab", params: { tab: "watchlist" }, search: {} as never, replace: true })
    }
    if (activeTab === "spotify" && !user?.spotifyId) {
      navigate({ to: "/library/$tab", params: { tab: "watchlist" }, search: {} as never, replace: true })
    }
  }, [activeTab, user?.steamId, user?.plexId, user?.spotifyId, authLoading, navigate])

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
            onClick={() => navigate({ to: "/library/$tab", params: { tab }, search: {} as never, replace: true })}
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
      ) : isSpotifyTab ? (
        <SpotifyTabContent />
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

function formatMs(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '—'
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

type SpotifyView =
  | { type: 'overview' }
  | { type: 'playlist'; id: string }
  | { type: 'liked' }

type LibrarySearchParams = {
  view?: string
  playlist?: string
}

function parseSpotifyView(search: LibrarySearchParams): SpotifyView {
  if (search.view === 'liked') {
    return { type: 'liked' }
  }
  if (search.view === 'playlist' && search.playlist) {
    return { type: 'playlist', id: search.playlist }
  }
  return { type: 'overview' }
}

function spotifySearchForView(view: SpotifyView) {
  if (view.type === 'liked') {
    return { view: 'liked' }
  }
  if (view.type === 'playlist') {
    return { view: 'playlist', playlist: view.id }
  }
  return {}
}

function SpotifyTrackList({ tracks }: { tracks: SpotifyTrack[] }) {
  const { playWithQueue, currentTrack, isPlaying, togglePlay } = useSpotifyPlayer()
  const saveSpotifyTrack = useSaveSpotifyTrack()
  const rateTrack = useRateTrack()
  const { toast } = useToast()
  const [likedSpotifyIds, setLikedSpotifyIds] = useState<Set<string>>(new Set())
  const [savingSpotifyId, setSavingSpotifyId] = useState<string | null>(null)
  const [ratingTrackId, setRatingTrackId] = useState<string | null>(null)
  const [ratingsByTrack, setRatingsByTrack] = useState<
    Record<string, { myRating?: number | null; avgRating?: number | null; ratingCount: number }>
  >({})

  const handleSaveSpotify = (spotifyId: string) => {
    setSavingSpotifyId(spotifyId)
    saveSpotifyTrack.mutate(spotifyId, {
      onSuccess: () => {
        setLikedSpotifyIds((current) => new Set(current).add(spotifyId))
        toast({ title: 'Added to Spotify liked songs', variant: 'success' })
      },
      onError: () => {
        toast({
          title: 'Could not save to Spotify',
          description: 'Check your Spotify connection and try again.',
          variant: 'error',
        })
      },
      onSettled: () => setSavingSpotifyId(null),
    })
  }

  const handleRateTrack = (trackId: string, score: number) => {
    setRatingTrackId(trackId)
    rateTrack.mutate({ trackId, score }, {
      onSuccess: (result) => {
        setRatingsByTrack((current) => ({
          ...current,
          [trackId]: {
            myRating: result.score,
            avgRating: result.avgRating,
            ratingCount: result.ratingCount,
          },
        }))
      },
      onError: () => {
        toast({ title: 'Could not save track rating', variant: 'error' })
      },
      onSettled: () => setRatingTrackId(null),
    })
  }

  if (tracks.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No tracks found.</p>
  }

  return (
    <div className="space-y-0.5">
      {tracks.map((t, i) => {
        const isCurrent = currentTrack?.id === t.id
        const subsequentUris = tracks
          .slice(i)
          .filter((tr) => tr.uri)
          .map((tr) => tr.uri as string)
        return (
          <div
            key={`${t.id}-${i}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (t.uri) {
                if (isCurrent) {
                  togglePlay()
                } else {
                  playWithQueue(subsequentUris)
                }
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (t.uri) {
                  if (isCurrent) {
                    togglePlay()
                  } else {
                    playWithQueue(subsequentUris)
                  }
                }
              }
            }}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors cursor-pointer',
              isCurrent ? 'bg-[#1DB954]/10' : 'hover:bg-white/[0.03]',
            )}
          >
            <span className="w-6 text-right text-xs tabular-nums text-muted-foreground/50 shrink-0">
              {i + 1}
            </span>
            {t.albumArt ? (
              <img src={t.albumArt} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
            ) : (
              <div className="h-9 w-9 rounded bg-white/[0.04] shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{t.name}</p>
              <p className="text-xs text-muted-foreground truncate">{t.artist}</p>
            </div>
            <TrackInlineActions
              trackId={t.otixTrackId}
              spotifyId={t.id}
              spotifyLiked={Boolean(t.spotifyLiked || likedSpotifyIds.has(t.id))}
              savingSpotify={savingSpotifyId === t.id}
              myRating={t.otixTrackId ? ratingsByTrack[t.otixTrackId]?.myRating ?? null : null}
              ratingPending={ratingTrackId === t.otixTrackId}
              onSaveSpotify={handleSaveSpotify}
              onRate={handleRateTrack}
              className="pointer-events-none hidden shrink-0 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 lg:flex"
            />
            <span className="text-xs text-muted-foreground/50 tabular-nums shrink-0">
              {formatMs(t.durationMs)}
            </span>
            {t.uri && (
              <div
                className={cn(
                  'h-8 w-8 inline-flex items-center justify-center rounded-full shrink-0 transition-colors',
                  isCurrent
                    ? 'bg-[#1DB954] text-black'
                    : 'bg-[#1DB954]/15 text-[#1DB954]',
                )}
              >
                {isCurrent && isPlaying ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5.14v14.72a1 1 0 0 0 1.5.86l11-7.36a1 1 0 0 0 0-1.72l-11-7.36A1 1 0 0 0 8 5.14z" />
                  </svg>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SpotifyTabContent() {
  const likedLoadMoreRef = useRef<HTMLDivElement>(null)
  const likedInView = useInView(likedLoadMoreRef, { margin: '0px 0px 800px 0px' })
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as LibrarySearchParams
  const { playWithQueue } = useSpotifyPlayer()
  const view = parseSpotifyView(search)
  const setSpotifyView = (nextView: SpotifyView) => {
    navigate({
      to: '/library/$tab',
      params: { tab: 'spotify' },
      search: spotifySearchForView(nextView) as never,
    })
  }

  // Queries
  const albumsQuery = useLibraryTab('spotify')
  const playlistsQuery = useSpotifyPlaylists()
  const likedTracksQuery = useSpotifyLikedTracks()
  const spotifyStatusQuery = useSpotifyStatus()

  const likedTracks = useMemo(
    () => likedTracksQuery.data?.pages.flatMap((p) => p.tracks) ?? [],
    [likedTracksQuery.data],
  )
  const likedTotal = likedTracksQuery.data?.pages[0]?.total ?? 0
  const spotifyScan = useSpotifyLibraryScan()
  const playlistSummary = view.type === 'playlist'
    ? playlistsQuery.data?.find((playlist) => playlist.id === view.id)
    : null

  const playlistDetailQuery = useSpotifyPlaylistTracks(
    view.type === 'playlist' ? view.id : null,
  )
  const playlistName = playlistDetailQuery.data?.name ?? playlistSummary?.name ?? 'Playlist'
  const playlistImageUrl = playlistDetailQuery.data?.imageUrl ?? playlistSummary?.imageUrl ?? null

  // Auto-scan
  useEffect(() => {
    const status = spotifyStatusQuery.data
    if (status && status.trackCount === 0 && !spotifyScan.isPending && !spotifyScan.data) {
      spotifyScan.mutate()
    }
  }, [spotifyStatusQuery.data, spotifyScan.isPending, spotifyScan.data, spotifyScan.mutate])

  // Infinite scroll for liked tracks
  useEffect(() => {
    if (likedInView && likedTracksQuery.hasNextPage && !likedTracksQuery.isFetchingNextPage && !likedTracksQuery.isLoading) {
      likedTracksQuery.fetchNextPage()
    }
  }, [likedInView, likedTracksQuery.hasNextPage, likedTracksQuery.isFetchingNextPage, likedTracksQuery.isLoading, likedTracksQuery.fetchNextPage])

  // Overview view
  if (view.type === 'overview') {
    const playlists = playlistsQuery.data ?? []
    const albums = albumsQuery.data?.pages.flatMap((p) => p.items) ?? []

    return (
      <div className="space-y-8">
        {/* Playlists + Liked Songs row */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Playlists
            </h2>
            {spotifyStatusQuery.data && spotifyStatusQuery.data.trackCount > 0 && (
              <button
                onClick={() => spotifyScan.mutate()}
                disabled={spotifyScan.isPending}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className={cn('h-3 w-3', spotifyScan.isPending && 'animate-spin')} />
                Rescan
              </button>
            )}
          </div>

          {playlistsQuery.isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-[var(--dk-surface-glass)] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Liked Songs card */}
              <button
                type="button"
                onClick={() => setSpotifyView({ type: 'liked' })}
                className="group relative flex flex-col rounded-xl border border-white/[0.06] bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-elevated)] transition-all duration-200 overflow-hidden"
              >
                <div className="aspect-square w-full bg-gradient-to-br from-[#1DB954]/30 via-[#1DB954]/10 to-transparent flex items-center justify-center">
                  <HeartIcon className="h-12 w-12 text-[#1DB954] drop-shadow-sm group-hover:scale-110 transition-transform duration-300" />
                </div>
                <div className="p-3 text-left">
                  <p className="text-sm font-semibold truncate">Liked Songs</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{likedTotal} tracks</p>
                </div>
              </button>

              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() =>
                    setSpotifyView({ type: 'playlist', id: pl.id })
                  }
                  className="group relative flex flex-col rounded-xl border border-white/[0.06] bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-elevated)] transition-all duration-200 overflow-hidden"
                >
                  <div className="aspect-square w-full overflow-hidden">
                    {pl.imageUrl ? (
                      <img
                        src={pl.imageUrl}
                        alt={pl.name}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-white/[0.04]">
                        <ListIcon className="h-10 w-10 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div className="p-3 text-left">
                    <p className="text-sm font-semibold truncate">{pl.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {pl.trackCount} {pl.trackCount === 1 ? 'track' : 'tracks'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {playlistsQuery.isError && (
            <p className="text-sm text-destructive">Failed to load playlists.</p>
          )}
        </div>

        {/* Albums */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Albums
          </h2>
          {albumsQuery.isLoading ? (
            <SkeletonGrid />
          ) : albumsQuery.isError ? (
            <p className="text-muted-foreground">Failed to load albums.</p>
          ) : albums.length === 0 ? (
            <SpotifyEmptyState />
          ) : (
            <MediaGrid>
              {albums.map((item) => (
                <MediaCard
                  key={item.id}
                  id={item.id}
                  mediaType={item.mediaType as "movie" | "show" | "game" | "music"}
                  title={item.title}
                  posterUrl={item.posterUrl}
                  textlessPosterUrl={item.textlessPosterUrl}
                  logoUrl={item.logoUrl}
                  releaseDate={item.releaseDate}
                />
              ))}
            </MediaGrid>
          )}
        </div>
      </div>
    )
  }

  // Detail view (playlist or liked tracks)
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setSpotifyView({ type: 'overview' })}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <div className="flex items-center gap-3">
          {view.type === 'playlist' && playlistImageUrl ? (
            <img src={playlistImageUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
          ) : view.type === 'liked' ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#1DB954]/20 to-[#1DB954]/5">
              <HeartIcon className="h-5 w-5 text-[#1DB954]" />
            </div>
          ) : null}
          <div>
            <h2 className="text-lg font-bold">
              {view.type === 'playlist' ? playlistName : 'Liked Songs'}
            </h2>
            {view.type === 'playlist' && playlistDetailQuery.data && (
              <p className="text-xs text-muted-foreground">
                {playlistDetailQuery.data.tracks.length} tracks
              </p>
            )}
          </div>
        </div>
        {view.type === 'playlist' && (
          <button
            type="button"
            onClick={() => {
              const tracks = playlistDetailQuery.data?.tracks
              if (tracks && tracks.length > 0) {
                const uris = tracks.filter((t) => t.uri).map((t) => t.uri as string)
                if (uris.length > 0) playWithQueue(uris)
              }
            }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#1DB954] px-4 py-2 text-xs font-semibold text-black hover:bg-[#1DB954]/90 transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.14v14.72a1 1 0 0 0 1.5.86l11-7.36a1 1 0 0 0 0-1.72l-11-7.36A1 1 0 0 0 8 5.14z" />
            </svg>
            Play All
          </button>
        )}
      </div>

      {/* Track list */}
      {view.type === 'playlist' ? (
        playlistDetailQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-[var(--dk-surface-glass)] animate-pulse" />
            ))}
          </div>
        ) : playlistDetailQuery.isError ? (
          <p className="text-destructive">Failed to load playlist tracks.</p>
        ) : (
          <SpotifyTrackList tracks={playlistDetailQuery.data?.tracks ?? []} />
        )
      ) : (
        likedTracksQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-[var(--dk-surface-glass)] animate-pulse" />
            ))}
          </div>
        ) : likedTracksQuery.isError ? (
          <p className="text-destructive">Failed to load liked tracks.</p>
        ) : (
          <>
            <SpotifyTrackList tracks={likedTracks} />
            <div ref={likedLoadMoreRef} className="flex justify-center py-4">
              {likedTracksQuery.isFetchingNextPage && (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              )}
            </div>
          </>
        )
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
