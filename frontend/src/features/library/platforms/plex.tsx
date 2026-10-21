// TODO: Review this file
import { useRef, useMemo, useEffect, useState, useCallback } from "react"
import { useInView, motion, AnimatePresence } from "framer-motion"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { RefreshCw, Play, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import {
  useLibraryTab,
  usePlexStatus,
  streamPlexSync,
} from "../library-queries"
import { useQueryClient } from "@tanstack/react-query"
import { libraryKeys } from "../library-keys"
import { DkDropdown } from "@ui/atoms/dropdown"
import PlexIcon from "@/assets/provider-logos/plex.svg?react"
import { registerPlatform } from "./index"
import type { PlatformDefinition, PlatformEmptyStateProps } from "./types"
import { formatDaysAgo } from "../utils"
import "./plex.scss"

const SkeletonGrid = () => {
  return (
    <MediaGrid>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="dk-library-plex__skeleton"
        />
      ))}
    </MediaGrid>
  )
};

// ── Empty state ──

const PlexEmptyState = ({ onScan, isScanning, scanResult, scanError }: PlatformEmptyStateProps) => {
  return (
    <div className="dk-library-plex__center-col">
      <div className="dk-library-plex__empty-icon">
        <PlexIcon className="dk-library-plex__icon--xl dk-library-plex__icon--faded" />
      </div>
      <p className="dk-library-plex__empty-title">Plex library empty</p>
      <p className="dk-library-plex__empty-desc">
        Sync your Plex servers to see your media here.
      </p>
      <button
        type="button"
        onClick={onScan}
        disabled={isScanning}
        className={cn(
          "dk-library-plex__btn-primary",
          isScanning && "dk-library-plex__btn-primary--disabled",
        )}
      >
        <RefreshCw className={cn("dk-library-plex__icon", isScanning && "dk-library-plex__icon--spinning")} />
        {isScanning ? "Syncing..." : "Sync Plex"}
      </button>
      {scanResult && (
        <p className="dk-library-plex__result-text">
          Found {scanResult.matched} matches out of {scanResult.total} Plex items.
        </p>
      )}
      {scanError && (
        <p className="dk-library-plex__error-text">
          Sync failed. Please try again.
        </p>
      )}
    </div>
  )
};

// ── Main content ──

type SyncProgress = {
  phase: string
  itemsProcessed?: number
  itemsTotal?: number
}

export const PlexTabContent = () => {
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(loadMoreRef, { margin: "0px 0px 800px 0px" })
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { mediaType?: string; sortBy?: string }
  const [mediaType, setMediaType] = useState(search.mediaType || "")
  const [sortBy, setSortBy] = useState(search.sortBy || "")
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ total: number; matched: number } | null>(null)
  const [scanError, setScanError] = useState<Error | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const hasAutoScanned = useRef(false)
  const queryClient = useQueryClient()

  const handleMediaTypeChange = (value: string) => {
    setMediaType(value)
    const s: Record<string, string> = {}
    if (value) s.mediaType = value
    if (sortBy) s.sortBy = sortBy
    navigate({
      to: "/library/plex",
      replace: true,
    })
  }

  const handleSortChange = (value: string) => {
    setSortBy(value)
    const s: Record<string, string> = {}
    if (mediaType) s.mediaType = mediaType
    if (value) s.sortBy = value
    navigate({
      to: "/library/plex",
      replace: true,
    })
  }

  const extraParams: Record<string, string> | undefined =
    mediaType || sortBy
      ? { ...(mediaType ? { media_type: mediaType } : {}), ...(sortBy ? { sort_by: sortBy } : {}) }
      : undefined

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLibraryTab("plex", extraParams)

  const { data: status } = usePlexStatus()

  const handleScan = useCallback(async () => {
    if (isScanning) return
    setIsScanning(true)
    setScanError(null)
    setScanResult(null)
    setSyncProgress({ phase: "Starting sync..." })
    try {
      const result = await streamPlexSync((event) => {
        const ev = event as { type: string; serverName?: string; libraryName?: string; itemsProcessed?: number; itemsTotal?: number; total?: number; matched?: number; seeded?: number }
        switch (ev.type) {
          case "server_found":
            setSyncProgress({ phase: `Found server: ${ev.serverName}` })
            break
          case "library_found":
            setSyncProgress({ phase: `Found library: ${ev.libraryName}` })
            break
          case "syncing_library":
            setSyncProgress({ phase: `Syncing ${ev.libraryName}...`, itemsTotal: ev.itemsTotal, itemsProcessed: 0 })
            break
          case "library_progress":
            setSyncProgress((prev) => prev ? { ...prev, itemsProcessed: ev.itemsProcessed, itemsTotal: ev.itemsTotal } : null)
            break
          case "library_complete":
            setSyncProgress({ phase: `Synced ${ev.libraryName}: ${ev.total} items` })
            break
        }
      })
      setScanResult({ total: result.total, matched: result.matched })
      setSyncProgress(null)
      queryClient.invalidateQueries({ queryKey: libraryKeys.tab("plex") })
      queryClient.invalidateQueries({ queryKey: [...libraryKeys.tab("plex"), "status"] })
      queryClient.invalidateQueries({ queryKey: [...libraryKeys.tab("plex"), "libraries"] })
    } catch (err) {
      setScanError(err instanceof Error ? err : new Error("Sync failed"))
      setSyncProgress(null)
    } finally {
      setIsScanning(false)
    }
  }, [isScanning, queryClient])

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data]
  )

  // Auto-scan once per mount only if the library has never been scanned and is empty
  useEffect(() => {
    if (hasAutoScanned.current) return
    if (status && !status.lastScannedAt && status.itemCount === 0 && !isScanning) {
      hasAutoScanned.current = true
      handleScan()
    }
  }, [status, isScanning, handleScan])

  useEffect(() => {
    if (isInView && hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage()
    }
  }, [isInView, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage])

  if (isLoading) return <SkeletonGrid />
  if (isError) {
    return (
      <div className="dk-library-plex__center-wrap">
        <p className="dk-library-plex__center-text">Failed to load. Please try again.</p>
      </div>
    )
  }
  const isLibraryEmpty = !mediaType && !sortBy && status?.itemCount === 0

  if (items.length === 0 && isLibraryEmpty) {
    return <PlexEmptyState onScan={handleScan} isScanning={isScanning} scanResult={scanResult} scanError={scanError} />
  }

  return (
    <>
      <div className="dk-library-plex__top-bar">
        <div className="dk-library-plex__filters">
          <DkDropdown
            variant="filter"
            label="Type"
            options={[
              { value: "", label: "All" },
              { value: "movie", label: "Movies" },
              { value: "show", label: "Shows" },
              { value: "music", label: "Music" },
            ]}
            value={mediaType}
            onChange={handleMediaTypeChange}
          />
          <DkDropdown
            variant="filter"
            label="Sort"
            options={[
              { value: "", label: "Recent" },
              { value: "artist", label: "Artist" },
              { value: "title", label: "Title" },
              { value: "year", label: "Year" },
            ]}
            value={sortBy}
            onChange={handleSortChange}
          />
          <p className="dk-library-plex__status-text">
            {status?.lastScannedAt
              ? `Last synced ${formatDaysAgo(Math.floor(new Date(status.lastScannedAt).getTime() / 1000))}`
              : status ? `${status.itemCount} items in library` : ""}
          </p>
        </div>
        <div className="dk-library-plex__sync-area">
          {syncProgress && (
            <span className="dk-library-plex__sync-phase">{syncProgress.phase}</span>
          )}
          <button
            type="button"
            onClick={handleScan}
            disabled={isScanning}
            className={cn(
              "dk-library-plex__btn-ghost",
              isScanning && "dk-library-plex__btn-ghost--disabled",
            )}
          >
            <RefreshCw className={cn("dk-library-plex__icon--sm", isScanning && "dk-library-plex__icon--spinning")} />
            Resync
          </button>
        </div>
      </div>

      {syncProgress && syncProgress.itemsTotal !== undefined && syncProgress.itemsTotal > 0 && (
        <div className="dk-library-plex__progress-wrap">
          <div className="dk-library-plex__progress-info">
            <span>{syncProgress.itemsProcessed ?? 0} / {syncProgress.itemsTotal} items</span>
            <span>{syncProgress.itemsProcessed !== undefined && syncProgress.itemsTotal ? `${Math.round((syncProgress.itemsProcessed / syncProgress.itemsTotal) * 100)}%` : ""}</span>
          </div>
          <div className="dk-library-plex__progress-bar-bg">
            <div
              className="dk-library-plex__progress-bar-fill"
              style={{ width: `${syncProgress.itemsProcessed !== undefined && syncProgress.itemsTotal ? (syncProgress.itemsProcessed / syncProgress.itemsTotal) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="dk-library-plex__center-col">
          <p className="dk-library-plex__empty-title">No results found</p>
          <p className="dk-library-plex__empty-desc">
            No items match your current filters.
          </p>
        </div>
      )}

      <MediaGrid>
        {(Array.isArray(items) ? items.filter((item) => item && item.id) : []).map((item) => (
          <div key={item.id} className="dk-library-plex__media-item">
            <MediaCard
              id={item.id}
              mediaType={item.mediaType as "movie" | "show" | "game" | "music"}
              title={item.title}
              posterUrl={item.posterUrl}
              textlessPosterUrl={item.textlessPosterUrl}
              logoUrl={item.logoUrl}
              releaseDate={item.releaseDate}
              isAdult={item.isAdult}
              tmdbId={(item as any).tmdbId}
            />
            {item.mediaType === "music" && item.albumArtistName && (
              <p className="dk-library-plex__artist-name">
                {item.albumArtistName}
              </p>
            )}
            {item.mediaType === "music" && item.albumTrackCount != null && item.albumTrackCount > 0 && (
              <p className="dk-library-plex__track-count">
                {item.albumTrackCount} track{item.albumTrackCount !== 1 ? "s" : ""}
              </p>
            )}
            {item.plexViewCount != null && item.plexViewCount > 0 && (() => {
              const isMusic = item.mediaType === "music"
              const verb = isMusic ? "Played" : "Viewed"
              const recentLabel = isMusic ? "Recently played" : "Recently viewed"
              const lastLabel = isMusic ? "Last played" : "Last viewed"
              return (
                <div className="dk-library-plex__view-row">
                  <PlexIcon className="dk-library-plex__view-icon" />
                  <span className="dk-library-plex__view-count">
                    {verb} {item.plexViewCount} times
                  </span>
                  {item.plexLastViewedAt != null && (() => {
                    const ts = Math.floor(new Date(item.plexLastViewedAt).getTime() / 1000)
                    const daysAgo = Math.floor((Date.now() / 1000 - ts) / 86400)
                    if (daysAgo <= 14) {
                      return <span className="dk-library-plex__recent-badge">{recentLabel}</span>
                    }
                    const ago = formatDaysAgo(ts)
                    if (ago) {
                      return <span className="dk-library-plex__last-viewed">{lastLabel} {ago}</span>
                    }
                    return null
                  })()}
                </div>
              )
            })()}
          </div>
        ))}
      </MediaGrid>

      <div ref={loadMoreRef} className="dk-library-plex__more-wrap">
        {isFetchingNextPage && (
          <div className="dk-library-plex__spinner" />
        )}
        {!hasNextPage && items.length > 0 && (
          <p className="dk-library-plex__end-text">End of list</p>
        )}
      </div>
    </>
  )
};

// ── Dashboard section ──

const PlexOverviewModule = ({ expanded, onToggle }: { expanded?: boolean; onToggle?: () => void } = {}) => {
  const navigate = useNavigate()
  const { data, isLoading } = useLibraryTab("plex")
  const { data: status } = usePlexStatus()
  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data]
  )
  const recentlyViewed = useMemo(
    () => [...items]
      .filter(item => item.plexLastViewedAt)
      .sort((a, b) => {
        const aTime = a.plexLastViewedAt ? new Date(a.plexLastViewedAt).getTime() : 0
        const bTime = b.plexLastViewedAt ? new Date(b.plexLastViewedAt).getTime() : 0
        return bTime - aTime
      })
      .slice(0, 8),
    [items]
  )
  const movieCount = useMemo(() => items.filter(i => i.mediaType === "movie").length, [items])
  const showCount = useMemo(() => items.filter(i => i.mediaType === "show").length, [items])
  const musicCount = useMemo(() => items.filter(i => i.mediaType === "music").length, [items])

  if (isLoading || items.length === 0) return null

  return (
    <div className="dk-library-plex__section">
      {/* Hero area - clickable to toggle */}
      <div className="dk-library-plex__hero" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle?.(); } }}>
        <div className="dk-library-plex__hero-bg" />
        <div className="dk-library-plex__hero-content">
          <div className="dk-library-plex__hero-top">
            <div className="flex items-center gap-2">
              <PlexIcon className="dk-library-plex__hero-brand-icon" />
              <span className="dk-library-plex__hero-brand-label">Plex</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate({ to: "/library/plex" }); }}
                className="dk-library-plex__hero-link"
              >
                View all
              </button>
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""} text-muted-foreground`} />
            </div>
          </div>
          <h2 className="dk-library-plex__hero-title">Media Library</h2>
          <p className="dk-library-plex__hero-stats">
            <span className="dk-library-plex__hero-stat">{status?.itemCount ?? items.length} total</span>
            <span className="dk-library-plex__hero-dot">&middot;</span>
            <span className="dk-library-plex__hero-stat">{movieCount} movies</span>
            <span className="dk-library-plex__hero-dot">&middot;</span>
            <span className="dk-library-plex__hero-stat">{showCount} shows</span>
            <span className="dk-library-plex__hero-dot">&middot;</span>
            <span className="dk-library-plex__hero-stat">{musicCount} music</span>
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
      <div className="dk-library-plex__quick-links">
        <button
          type="button"
          onClick={() => navigate({ to: "/library/plex" })}
          className="dk-library-plex__quick-link dk-library-plex__quick-link--recent"
        >
          <Play className="dk-library-plex__quick-link-icon" />
          <div className="dk-library-plex__quick-link-text">
            <span className="dk-library-plex__quick-link-title">Recently viewed</span>
            <span className="dk-library-plex__quick-link-sub">{recentlyViewed.length} items</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/library/plex" })}
          className="dk-library-plex__quick-link dk-library-plex__quick-link--library"
        >
          <PlexIcon className="dk-library-plex__quick-link-icon" />
          <div className="dk-library-plex__quick-link-text">
            <span className="dk-library-plex__quick-link-title">All Media</span>
            <span className="dk-library-plex__quick-link-sub">{status?.itemCount ?? items.length} items</span>
          </div>
        </button>
      </div>

      {/* Carousel */}
      {recentlyViewed.length > 0 && (
        <div className="dk-library-plex__carousel">
          <div className="dk-library-plex__carousel-header">
            <h3 className="dk-library-plex__carousel-title">Recently viewed</h3>
            <button
              type="button"
              onClick={() => navigate({ to: "/library/plex" })}
              className="dk-library-plex__carousel-link"
            >
              Show all
            </button>
          </div>
          <div className="dk-library-plex__carousel-track">
            {(Array.isArray(recentlyViewed) ? recentlyViewed.filter((item) => item && item.id) : []).map((item) => (
              <div key={item.id} className="dk-library-plex__carousel-card">
                <div className="dk-library-plex__carousel-art">
                  {item.posterUrl ? (
                    <img src={item.posterUrl} alt={item.title} className="dk-library-plex__carousel-img" loading="lazy" />
                  ) : (
                    <div className="dk-library-plex__carousel-placeholder">
                      <PlexIcon className="h-8 w-8 text-primary/30" />
                    </div>
                  )}
                  <div className="dk-library-plex__carousel-overlay">
                    <div className="dk-library-plex__carousel-play">
                      <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
                    </div>
                  </div>
                </div>
                <p className="dk-library-plex__carousel-card-title">{item.title}</p>
                {item.plexViewCount != null && item.plexViewCount > 0 && (
                  <p className="dk-library-plex__carousel-card-sub">
                    {item.mediaType === "music" ? "Played" : "Viewed"} {item.plexViewCount} times
                  </p>
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
};
// ── Register ──

export const plexPlatform: PlatformDefinition = {
  id: "plex",
  label: "Plex",
  icon: <PlexIcon className="dk-library-plex__icon" />,
  requiresConnection: (user) => !!user?.plexId,
  EmptyState: (props) => <PlexEmptyState {...props} />,
  OverviewModule: PlexOverviewModule,
  Content: PlexTabContent,
}

registerPlatform(plexPlatform)
