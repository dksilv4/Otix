import { useState, useRef, useMemo, useEffect } from "react"
import { useInView } from "framer-motion"
import { useNavigate } from "@tanstack/react-router"
import { RefreshCw, EyeOffIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import {
  useLibraryTab,
  useSteamLibraryScan,
  useUnmatchedSteamGames,
  useSteamStatus,
  type UnmatchedGame,
} from "../library-queries"
import { SteamIcon } from "@/features/dk-ui/atoms/steam-icon"
import { registerPlatform } from "./registry"
import type { PlatformDefinition, PlatformEmptyStateProps } from "./types"

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

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  if (hours < 1) return `${Math.round(hours * 10) / 10}h`
  return `${Math.round(hours)}h`
}

function formatDaysAgo(unixTimestamp: number): string {
  const days = Math.floor((Date.now() / 1000 - unixTimestamp) / 86400)
  if (days <= 0) return "Today"
  if (days === 1) return "1d ago"
  if (days <= 14) return `${days}d ago`
  return ""
}

// ── Empty state ──

function SteamEmptyState({ onScan, isScanning, scanResult, scanError }: PlatformEmptyStateProps) {
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
        onClick={onScan}
        disabled={isScanning}
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
          "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
          isScanning && "opacity-60 pointer-events-none",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", isScanning && "animate-spin")} />
        {isScanning ? "Scanning..." : "Scan Library"}
      </button>
      {scanResult && (
        <p className="mt-2 text-xs text-muted-foreground">
          Found {scanResult.matchedInOtix} matches out of {scanResult.totalInSteam} Steam games.
        </p>
      )}
      {scanError && (
        <p className="mt-2 text-xs text-destructive">
          Scan failed. Please try again.
        </p>
      )}
    </div>
  )
}

// ── Unmatched Grid ──

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

// ── Main content ──

function SteamTabContent() {
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(loadMoreRef, { margin: "0px 0px 800px 0px" })
  const [showUnmatched, setShowUnmatched] = useState(false)

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLibraryTab("steam")

  const { data: status } = useSteamStatus()
  const scan = useSteamLibraryScan()

  const unmatchedQuery = useUnmatchedSteamGames()
  const unmatchedItems = useMemo(
    () => unmatchedQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [unmatchedQuery.data],
  )
  const unmatchedLoaded = unmatchedQuery.data != null

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data]
  )

  // Auto-scan if no games scanned yet
  useEffect(() => {
    if (status && status.gameCount === 0 && !scan.isPending && !scan.data) {
      scan.mutate()
    }
  }, [status, scan.isPending, scan.data, scan.mutate])

  // Infinite scroll
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
    return <SteamEmptyState onScan={() => scan.mutate()} isScanning={scan.isPending} scanResult={scan.data} scanError={scan.error} />
  }

  return (
    <>
      {status && status.gameCount > 0 && (
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
            {item.steamPlaytimeForever != null && item.steamPlaytimeForever > 0 && (
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
          </div>
        ))}
      </MediaGrid>

      {showUnmatched && (
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

      {scan.data && (
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

// ── Dashboard section ──

function SteamDashboardSection() {
  const navigate = useNavigate()
  const { data, isLoading } = useLibraryTab("steam")
  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items.slice(0, 5)) ?? [],
    [data]
  )

  if (isLoading || items.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Steam
        </h2>
        <button
          onClick={() => navigate({ to: "/library/$tab", params: { tab: "steam" } })}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
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
            {item.steamPlaytimeForever != null && item.steamPlaytimeForever > 0 && (
              <div className="mt-1.5">
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {formatPlaytime(item.steamPlaytimeForever)}
                </span>
              </div>
            )}
          </div>
        ))}
      </MediaGrid>
    </div>
  )
}

// ── Register ──

export const steamPlatform: PlatformDefinition = {
  id: "steam",
  label: "Steam",
  icon: <SteamIcon className="h-4 w-4" />,
  requiresConnection: (user) => !!user?.steamId,
  EmptyState: (props) => <SteamEmptyState {...props} />,
  DashboardSection: SteamDashboardSection,
  Content: SteamTabContent,
}

registerPlatform(steamPlatform)
