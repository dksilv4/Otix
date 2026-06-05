// TODO: Review this file
import { useState, useRef, useMemo, useEffect } from "react"
import { Helmet } from "react-helmet-async"
import { useInView } from "framer-motion"
import { useParams, useNavigate } from "@tanstack/react-router"
import { BookmarkIcon, HeartIcon, CheckCircle2Icon, Gamepad2Icon, LayoutDashboardIcon, ListIcon, MusicIcon, PlusIcon, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import { useLibraryTab, useSteamWishlist, useSteamWishlistScan, TAB_LABELS, LIBRARY_TABS, type LibraryTab } from "./library-queries"
import { useUserLists, useCreateList, type UserListCreate } from "@/features/list/list-queries"
import { ListCard } from "@/features/list/molecules/list-card"
import { ListComposer } from "@/features/list/organisms/list-composer"
import { useAuth } from "@/features/auth/auth-provider"
import { getPlatformTabs, getPlatform } from "./platforms"
import { GameCard } from "@/features/game-scanner/molecules/game-card"
import type { DetectedGame } from "@/features/game-scanner/types"
import { getScannedGames } from "@/features/game-scanner/storage"
import { GamesLauncher } from "./molecules/games-launcher"

// ── Tab definitions ──

const CORE_TABS: Array<{ id: LibraryTab; icon: React.ReactNode }> = [
  { id: "watchlist", icon: <BookmarkIcon className="h-4 w-4" /> },
  { id: "like", icon: <HeartIcon className="h-4 w-4" /> },
  { id: "watched", icon: <CheckCircle2Icon className="h-4 w-4" /> },
  { id: "played", icon: <Gamepad2Icon className="h-4 w-4" /> },
  { id: "listened", icon: <MusicIcon className="h-4 w-4" /> },
  { id: "owned", icon: <CheckCircle2Icon className="h-4 w-4" /> },
]

// ── Helpers ──

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

// ── Tab Bar (shared, non-sticky) ──

interface TabBarProps {
  tabs: Array<{ id: string; label: string; icon: React.ReactNode }>
  activeTab: string
  onTabClick: (id: string) => void
}

function TabBar({ tabs, activeTab, onTabClick }: TabBarProps) {
  return (
    <div className="-mx-4 px-4 flex gap-2 overflow-visible min-w-max pb-1 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabClick(tab.id)}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 whitespace-nowrap",
            activeTab === tab.id
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]"
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ── Core Media Tab Content (watchlist, like, watched, played, listened) ──

function MediaTabContent({ tab }: { tab: LibraryTab }) {
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

  if (isLoading) return <SkeletonGrid />
  if (isError) {
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
      <MediaGrid>
        {items.map((item) => (
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
}

// ── Wishlist Tab Content ──

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

  if (isLoading) return <SkeletonGrid />
  if (isError) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">Failed to load. Please try again.</p>
      </div>
    )
  }
  if (items.length === 0) return <WishlistEmptyState />

  return (
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
              isAdult={item.isAdult}
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

// ── Lists Tab Content ──

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

// ── Overview Tab Content ──

function LocalGamesOverviewSection() {
  const navigate = useNavigate()
  const [games, setGames] = useState<DetectedGame[]>(getScannedGames)

  // Re-read from cache on focus/mount
  useEffect(() => {
    const handleFocus = () => {
      setGames(getScannedGames())
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [])

  const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI
  if (!isElectron || games.length === 0) return null

  const preview = games.slice(0, 5)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Your Games
        </h2>
        <button
          onClick={() =>
            navigate({
              to: "/library/$tab",
              params: { tab: "local-games" },
            })
          }
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {preview.map((game, i) => (
          <GameCard key={game.id} game={game} index={i} />
        ))}
        {games.length > 5 && (
          <button
            type="button"
            onClick={() =>
              navigate({
                to: "/library/$tab",
                params: { tab: "local-games" },
              })
            }
            className="flex aspect-[16/10] items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-[var(--dk-surface-glass)]/50 hover:bg-[var(--dk-surface-elevated)] transition-all duration-200"
          >
            <span className="text-sm text-muted-foreground">
              +{games.length - 5} more
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

function ListsPreviewSection() {
  const navigate = useNavigate()
  const { data: lists, isLoading } = useUserLists()

  if (isLoading || !lists || lists.length === 0) return null

  const preview = lists.slice(0, 3)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Your Lists
        </h2>
        <button
          onClick={() => navigate({ to: "/library/$tab", params: { tab: "lists" } })}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {preview.map((list) => (
          <ListCard key={list.id} list={list} />
        ))}
        {lists.length > 3 && (
          <button
            type="button"
            onClick={() => navigate({ to: "/library/$tab", params: { tab: "lists" } })}
            className="flex items-center justify-center rounded-3xl border border-dashed border-white/[0.08] bg-[var(--dk-surface-glass)]/50 hover:bg-[var(--dk-surface-elevated)] transition-all duration-200 p-6"
          >
            <span className="text-sm text-muted-foreground">
              +{lists.length - 3} more lists
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

function OverviewTabContent() {
  const { user } = useAuth()
  const platforms = getPlatformTabs(user)

  return (
    <div className="space-y-8">
      <LocalGamesOverviewSection />
      <ListsPreviewSection />

      {platforms.map((platform) => {
        const def = getPlatform(platform.id)
        if (!def) return null
        const Section = def.DashboardSection
        return <Section key={platform.id} />
      })}

      {platforms.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
            <LayoutDashboardIcon className="h-6 w-6" />
          </div>
          <p className="text-lg font-semibold text-foreground">
            Your library overview
          </p>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Connect platforms like Steam, Plex, or Spotify to see your library stats here. Browse tabs above to explore your collection.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Games Tab ──────────────────────────────────────────────────────

function GamesTabContent() {
  return <GamesLauncher />
}

// ── Library Tab Page (/library/$tab) ──

export function LibraryPage() {
  const params = useParams({ from: "/library/$tab" })
  const navigate = useNavigate()
  const rawTab = params.tab as string
  const activeTab: LibraryTab = LIBRARY_TABS.includes(rawTab as LibraryTab) ? (rawTab as LibraryTab) : "overview"

  const [composerOpen, setComposerOpen] = useState(false)
  const createList = useCreateList()
  const { user, isLoading: authLoading } = useAuth()

  // Build visible tabs: overview + core + platforms + special
  const visibleTabs = useMemo(() => {
    const tabs: Array<{ id: string; label: string; icon: React.ReactNode }> = []

    // Overview tab (always first)
    tabs.push({ id: "overview", label: TAB_LABELS.overview, icon: <LayoutDashboardIcon className="h-4 w-4" /> })

    // Games tab (always second — game launcher)
    tabs.push({ id: "games", label: TAB_LABELS.games, icon: <Gamepad2Icon className="h-4 w-4" /> })

    // Core tabs
    for (const t of CORE_TABS) {
      tabs.push({ id: t.id, label: TAB_LABELS[t.id], icon: t.icon })
    }

    // Platform tabs from registry
    if (!authLoading) {
      for (const pt of getPlatformTabs(user)) {
        tabs.push(pt)
      }
    }

    // Wishlist (Steam-specific special tab)
    if (!authLoading && user?.steamId) {
      tabs.push({ id: "wishlist", label: TAB_LABELS.wishlist, icon: <BookmarkIcon className="h-4 w-4" /> })
    }

    // Lists
    tabs.push({ id: "lists", label: TAB_LABELS.lists, icon: <ListIcon className="h-4 w-4" /> })

    return tabs
  }, [user, authLoading])

  // Guard against unavailable tabs
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

  // Resolve content for the active tab
  const renderContent = () => {
    if (activeTab === "overview") {
      return <OverviewTabContent />
    }
    if (activeTab === "lists") {
      return <ListsTabContent onCreateClick={() => setComposerOpen(true)} />
    }
    if (activeTab === "wishlist") {
      return <WishlistTabContent />
    }
    // Check if it's a platform tab
    const platformDef = getPlatform(activeTab)
    if (platformDef) {
      const PlatformContent = platformDef.Content
      return <PlatformContent />
    }

    if (activeTab === "games") {
      return <GamesTabContent />
    }

    // Fallback to core media tab
    return <MediaTabContent tab={activeTab} />
  }

  return (
    <div className="space-y-8">
      <Helmet>
        <title>Library - Otix</title>
        <meta name="description" content="Your saved, liked, watched items, and lists on Otix." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your saved, liked, watched items, and lists.
        </p>
      </div>

      <TabBar
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabClick={(id) => navigate({ to: "/library/$tab", params: { tab: id }, search: {} as never, replace: true })}
      />

      {renderContent()}

      <ListComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onSave={handleCreate}
        isSaving={createList.isPending}
      />
    </div>
  )
}
