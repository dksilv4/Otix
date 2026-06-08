// TODO: Review this file
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

function SteamDashboardSection() {
  const navigate = useNavigate()
  const { data, isLoading } = useLibraryTab("steam")
  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items.slice(0, 5)) ?? [],
    [data]
  )

  if (isLoading || items.length === 0) return null

  return (
    <div className="dk-library-steam__section">
      <div className="dk-library-steam__section-header">
        <h2 className="dk-library-steam__section-title">
          Steam
        </h2>
        <button
          onClick={() => navigate({ to: "/library/$tab", params: { tab: "steam" } })}
          className="dk-library-steam__section-link"
        >
          View all
        </button>
      </div>
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
              <div className="dk-library-steam__dashboard-playtime">
                <span className="dk-library-steam__playtime-text">
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
  icon: <SteamIcon className="dk-library-steam__icon" />,
  requiresConnection: (user) => !!user?.steamId,
  EmptyState: (props) => <SteamEmptyState {...props} />,
  DashboardSection: SteamDashboardSection,
  Content: SteamTabContent,
}

registerPlatform(steamPlatform)
