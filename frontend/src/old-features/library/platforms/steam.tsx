// TODO: Review this file
import { useState, useRef, useMemo, useEffect } from "react"
import { useInView, motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "@tanstack/react-router"
import { RefreshCw, EyeOffIcon, Play, ChevronDown } from "lucide-react"
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
import SteamIcon from "@/assets/provider-logos/steam.svg?react"
import { registerPlatform } from "./index"
import type { PlatformDefinition, PlatformEmptyStateProps } from "./types"
import "./steam.scss"

function SkeletonGrid() {
  return (
    <MediaGrid>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="dk-library-steam__skeleton"
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
    <div className="dk-library-steam__center-col">
      <div className="dk-library-steam__empty-icon">
        <SteamIcon className="dk-library-steam__icon--xl dk-library-steam__icon--faded" />
      </div>
      <p className="dk-library-steam__empty-title">Steam library empty</p>
      <p className="dk-library-steam__empty-desc">
        Scan your Steam library to see your games here.
      </p>
      <button
        onClick={onScan}
        disabled={isScanning}
        className={cn(
          "dk-library-steam__btn-primary",
          isScanning && "dk-library-steam__btn-primary--disabled",
        )}
      >
        <RefreshCw className={cn("dk-library-steam__icon", isScanning && "dk-library-steam__icon--spinning")} />
        {isScanning ? "Scanning..." : "Scan Library"}
      </button>
      {scanResult && (
        <p className="dk-library-steam__result-text">
          Found {scanResult.matchedInOtix} matches out of {scanResult.totalInSteam} Steam games.
        </p>
      )}
      {scanError && (
        <p className="dk-library-steam__error-text">
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
      <div className="dk-library-steam__unmatched-grid">
        {items.map((game) => {
          const iconUrl = game.steamImgIconUrl
            ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.steamAppId}/${game.steamImgIconUrl}.jpg`
            : null
          return (
            <div key={game.id} className="dk-library-steam__unmatched-item">
              <div className="dk-library-steam__unmatched-icon">
                {iconUrl ? (
                  <img src={iconUrl} alt="" className="dk-library-steam__unmatched-img" loading="lazy" />
                ) : (
                  <SteamIcon className="dk-library-steam__unmatched-steam-icon" />
                )}
              </div>
              <p className="dk-library-steam__unmatched-name">
                {game.steamName}
              </p>
              {game.steamPlaytimeForever > 0 && (
                <span className="dk-library-steam__unmatched-playtime">
                  {formatPlaytime(game.steamPlaytimeForever)}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {hasMore && (
        <div className="dk-library-steam__more-wrap--sm">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className={cn(
              "dk-library-steam__btn-link",
              loading && "dk-library-steam__btn-link--disabled",
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

  // Auto-scan if no game scanned yet
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
      <div className="dk-library-steam__center-wrap">
        <p className="dk-library-steam__center-text">Failed to load. Please try again.</p>
      </div>
    )
  }
  if (items.length === 0) {
    return <SteamEmptyState onScan={() => scan.mutate()} isScanning={scan.isPending} scanResult={scan.data} scanError={scan.error} />
  }

  return (
    <>
      {status && status.gameCount > 0 && (
        <div className="dk-library-steam__status-bar">
          <p className="dk-library-steam__status-text">
            {status.lastScannedAt
              ? `Last scanned ${formatDaysAgo(Math.floor(new Date(status.lastScannedAt).getTime() / 1000))}`
              : `${status.gameCount} games in library`}
          </p>
          <div className="dk-library-steam__actions">
            <button
              onClick={() => {
                if (!showUnmatched && !unmatchedLoaded) {
                  unmatchedQuery.refetch()
                }
                setShowUnmatched(!showUnmatched)
              }}
              className={cn(
                "dk-library-steam__btn-filter",
                showUnmatched && "dk-library-steam__btn-filter--active",
              )}
            >
              <EyeOffIcon className="dk-library-steam__icon--sm" />
              {showUnmatched ? "Hide unmatched" : "Show unmatched"}
            </button>
            <button
              onClick={() => scan.mutate()}
              disabled={scan.isPending}
              className={cn(
                "dk-library-steam__btn-ghost",
                scan.isPending && "dk-library-steam__btn-ghost--disabled",
              )}
            >
              <RefreshCw className={cn("dk-library-steam__icon--sm", scan.isPending && "dk-library-steam__icon--spinning")} />
              Rescan
            </button>
          </div>
        </div>
      )}

      <MediaGrid>
        {items.map((item) => (
          <div key={item.id} className="dk-library-steam__media-item">
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
            {item.steamPlaytimeForever != null && item.steamPlaytimeForever > 0 && (
              <div className="dk-library-steam__playtime-row">
                <SteamIcon className="dk-library-steam__playtime-icon" />
                <span className="dk-library-steam__playtime-text">
                  {formatPlaytime(item.steamPlaytimeForever)}
                </span>
                {item.steamPlaytime2weeks != null && item.steamPlaytime2weeks > 0 && (
                  <span className="dk-library-steam__playtime-recent">
                    +{formatPlaytime(item.steamPlaytime2weeks)} recent
                  </span>
                )}
                {item.steamRtimeLastPlayed != null && (() => {
                  const daysAgo = Math.floor((Date.now() / 1000 - item.steamRtimeLastPlayed) / 86400)
                  if (daysAgo <= 14) {
                    return <span className="dk-library-steam__recently-played">Recently played</span>
                  }
                  const ago = formatDaysAgo(item.steamRtimeLastPlayed)
                  if (ago) {
                    return <span className="dk-library-steam__last-played">Last played {ago}</span>
                  }
                  return null
                })()}
              </div>
            )}
          </div>
        ))}
      </MediaGrid>

      {showUnmatched && (
        <div className="dk-library-steam__unmatched-section">
          <h3 className="dk-library-steam__unmatched-title">
            Unmatched Steam Games
            {unmatchedQuery.data?.pages[0] && (
              <span className="dk-library-steam__unmatched-count">
                ({unmatchedQuery.data.pages.reduce((sum, p) => sum + p.items.length, 0)} games not yet in Otix)
              </span>
            )}
          </h3>
          {unmatchedQuery.isLoading ? (
            <SkeletonGrid />
          ) : unmatchedItems.length === 0 ? (
            <p className="dk-library-steam__unmatched-empty">All your Steam games have matches.</p>
          ) : (
            <UnmatchedGrid
              items={unmatchedItems}
              hasMore={unmatchedQuery.hasNextPage}
              onLoadMore={() => unmatchedQuery.fetchNextPage()}
              loading={unmatchedQuery.isFetchingNextPage}
            />
          )}
          {unmatchedQuery.isFetchingNextPage && (
            <div className="dk-library-steam__more-wrap--sm">
              <div className="dk-library-steam__spinner--sm" />
            </div>
          )}
        </div>
      )}

      {scan.data && (
        <p className="dk-library-steam__result-centered">
          Found {scan.data.matchedInOtix} matches out of {scan.data.totalInSteam} Steam games.
        </p>
      )}
      {scan.error && (
        <p className="dk-library-steam__error-centered">
          Scan failed. Please try again.
        </p>
      )}

      <div ref={loadMoreRef} className="dk-library-steam__more-wrap">
        {isFetchingNextPage && (
          <div className="dk-library-steam__spinner" />
        )}
        {!hasNextPage && items.length > 0 && (
          <p className="dk-library-steam__end-text">End of list</p>
        )}
      </div>
    </>
  )
}

// ── Dashboard section ──

function SteamOverviewModule({ expanded, onToggle }: { expanded?: boolean; onToggle?: () => void } = {}) {
  const navigate = useNavigate()
  const { data, isLoading } = useLibraryTab("steam")
  const { data: status } = useSteamStatus()

  const allItems = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data]
  )

  const recentlyPlayed = useMemo(
    () => [...allItems]
      .filter(item => item.steamRtimeLastPlayed)
      .sort((a, b) => (b.steamRtimeLastPlayed || 0) - (a.steamRtimeLastPlayed || 0))
      .slice(0, 8),
    [allItems]
  )

  const playedThisWeek = useMemo(
    () => allItems.filter(item => (item.steamPlaytime2weeks ?? 0) > 0).length,
    [allItems]
  )

  if (isLoading || allItems.length === 0) return null

  return (
    <div className="dk-library-steam__section">
      {/* Hero area - clickable to toggle */}
      <div className="dk-library-steam__hero" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle?.(); } }}>
        <div className="dk-library-steam__hero-bg" />
        <div className="dk-library-steam__hero-content">
          <div className="dk-library-steam__hero-top">
            <div className="flex items-center gap-2">
              <SteamIcon className="dk-library-steam__hero-brand-icon" />
              <span className="dk-library-steam__hero-brand-label">Steam</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); navigate({ to: "/library/steam" }); }}
                className="dk-library-steam__hero-link"
              >
                View all
              </button>
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} style={{ color: "rgba(255,255,255,0.5)" }} />
            </div>
          </div>
          <h2 className="dk-library-steam__hero-title">Game Library</h2>
          <p className="dk-library-steam__hero-stats">
            <span className="dk-library-steam__hero-stat">{status?.gameCount ?? allItems.length} games</span>
            <span className="dk-library-steam__hero-dot">&middot;</span>
            <span className="dk-library-steam__hero-stat">{recentlyPlayed.length} recently played</span>
            <span className="dk-library-steam__hero-dot">&middot;</span>
            <span className="dk-library-steam__hero-stat">{playedThisWeek} played this week</span>
          </p>
        </div>
      </div>

      <AnimatePresence initial={false}>
      {expanded && (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="overflow-hidden"
        style={{ paddingLeft: "1.25rem", paddingRight: "1.25rem" }}
      >
      {/* Quick links */}
      <div className="dk-library-steam__quick-links">
        <button
          type="button"
          onClick={() => navigate({ to: "/library/steam" })}
          className="dk-library-steam__quick-link dk-library-steam__quick-link--recent"
        >
          <Play className="dk-library-steam__quick-link-icon" />
          <div className="dk-library-steam__quick-link-text">
            <span className="dk-library-steam__quick-link-title">Recently played</span>
            <span className="dk-library-steam__quick-link-sub">{recentlyPlayed.length} games</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/library/steam" })}
          className="dk-library-steam__quick-link dk-library-steam__quick-link--library"
        >
          <SteamIcon className="dk-library-steam__quick-link-icon" />
          <div className="dk-library-steam__quick-link-text">
            <span className="dk-library-steam__quick-link-title">All Games</span>
            <span className="dk-library-steam__quick-link-sub">{status?.gameCount ?? allItems.length} games</span>
          </div>
        </button>
      </div>

      {/* Carousel */}
      {recentlyPlayed.length > 0 && (
        <div className="dk-library-steam__carousel">
          <div className="dk-library-steam__carousel-header">
            <h3 className="dk-library-steam__carousel-title">Recently played</h3>
            <button
              onClick={() => navigate({ to: "/library/steam" })}
              className="dk-library-steam__carousel-link"
            >
              Show all
            </button>
          </div>
          <div className="dk-library-steam__carousel-track">
            {recentlyPlayed.map((item) => (
              <div key={item.id} className="dk-library-steam__carousel-card">
                <div className="dk-library-steam__carousel-art">
                  {item.posterUrl ? (
                    <img src={item.posterUrl} alt={item.title} className="dk-library-steam__carousel-img" loading="lazy" />
                  ) : (
                    <div className="dk-library-steam__carousel-placeholder">
                      <SteamIcon className="h-8 w-8 text-[#66c0f4]/30" />
                    </div>
                  )}
                  <div className="dk-library-steam__carousel-overlay">
                    <div className="dk-library-steam__carousel-play">
                      <Play className="h-5 w-5 text-white ml-0.5" />
                    </div>
                  </div>
                </div>
                <p className="dk-library-steam__carousel-card-title">{item.title}</p>
                {item.steamPlaytimeForever != null && item.steamPlaytimeForever > 0 && (
                  <p className="dk-library-steam__carousel-card-sub">{formatPlaytime(item.steamPlaytimeForever)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}
// ── Register ──

export const steamPlatform: PlatformDefinition = {
  id: "steam",
  label: "Steam",
  icon: <SteamIcon className="dk-library-steam__icon" />,
  requiresConnection: (user) => !!user?.steamId,
  EmptyState: (props) => <SteamEmptyState {...props} />,
  OverviewModule: SteamOverviewModule,
  Content: SteamTabContent,
}

registerPlatform(steamPlatform)
