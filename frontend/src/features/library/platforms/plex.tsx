import { useRef, useMemo, useEffect, useState } from "react"
import { useInView } from "framer-motion"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import {
  useLibraryTab,
  usePlexLibraryScan,
  usePlexStatus,
} from "../library-queries"
import { DkDropdown } from "@/features/dk-ui/atoms/dropdown"
import { PlexIcon } from "@/features/dk-ui/atoms/plex-icon"
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

function formatDaysAgo(unixTimestamp: number): string {
  const days = Math.floor((Date.now() / 1000 - unixTimestamp) / 86400)
  if (days <= 0) return "Today"
  if (days === 1) return "1d ago"
  if (days <= 14) return `${days}d ago`
  return ""
}

// ── Empty state ──

function PlexEmptyState({ onScan, isScanning, scanResult, scanError }: PlatformEmptyStateProps) {
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
        onClick={onScan}
        disabled={isScanning}
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
          "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
          isScanning && "opacity-60 pointer-events-none",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", isScanning && "animate-spin")} />
        {isScanning ? "Syncing..." : "Sync Plex"}
      </button>
      {scanResult && (
        <p className="mt-2 text-xs text-muted-foreground">
          Found {scanResult.matched} matches out of {scanResult.total} Plex items.
        </p>
      )}
      {scanError && (
        <p className="mt-2 text-xs text-destructive">
          Sync failed. Please try again.
        </p>
      )}
    </div>
  )
}

// ── Main content ──

function PlexTabContent() {
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(loadMoreRef, { margin: "0px 0px 800px 0px" })
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { mediaType?: string }
  const [mediaType, setMediaType] = useState(search.mediaType || "")

  const handleMediaTypeChange = (value: string) => {
    setMediaType(value)
    navigate({
      to: "/library/$tab",
      params: { tab: "plex" },
      search: value ? { mediaType: value } : {},
      replace: true,
    })
  }

  const extraParams = mediaType ? { media_type: mediaType } : undefined

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLibraryTab("plex", extraParams)

  const { data: status } = usePlexStatus()
  const scan = usePlexLibraryScan()

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data]
  )

  // Auto-scan if no items scanned yet
  useEffect(() => {
    if (status && status.itemCount === 0 && !scan.isPending && !scan.data) {
      scan.mutate()
    }
  }, [status, scan.isPending, scan.data, scan.mutate])

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
    return <PlexEmptyState onScan={() => scan.mutate()} isScanning={scan.isPending} scanResult={scan.data} scanError={scan.error} />
  }

  return (
    <>
      {status && status.itemCount > 0 && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
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
            <p className="text-xs text-muted-foreground">
              {status.lastScannedAt
                ? `Last synced ${formatDaysAgo(Math.floor(new Date(status.lastScannedAt).getTime() / 1000))}`
                : `${status.itemCount} items in library`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => scan.mutate()}
              disabled={scan.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors",
                scan.isPending && "opacity-60 pointer-events-none",
              )}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", scan.isPending && "animate-spin")} />
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
              mediaType={item.mediaType as "movie" | "show" | "game" | "music"}
              title={item.title}
              posterUrl={item.posterUrl}
              textlessPosterUrl={item.textlessPosterUrl}
              logoUrl={item.logoUrl}
              releaseDate={item.releaseDate}
              isAdult={item.isAdult}
            />
            {item.mediaType === "music" && item.albumArtistName && (
              <p className="mt-1 text-[11px] text-muted-foreground leading-tight truncate">
                {item.albumArtistName}
              </p>
            )}
            {item.mediaType === "music" && item.albumTrackCount != null && item.albumTrackCount > 0 && (
              <p className="text-[10px] text-muted-foreground/60 leading-tight">
                {item.albumTrackCount} track{item.albumTrackCount !== 1 ? "s" : ""}
              </p>
            )}
            {item.plexViewCount != null && item.plexViewCount > 0 && (() => {
              const isMusic = item.mediaType === "music"
              const verb = isMusic ? "Played" : "Viewed"
              const recentLabel = isMusic ? "Recently played" : "Recently viewed"
              const lastLabel = isMusic ? "Last played" : "Last viewed"
              return (
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  <PlexIcon className="h-3 w-3 opacity-50 shrink-0" />
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {verb} {item.plexViewCount} times
                  </span>
                  {item.plexLastViewedAt != null && (() => {
                    const ts = Math.floor(new Date(item.plexLastViewedAt).getTime() / 1000)
                    const daysAgo = Math.floor((Date.now() / 1000 - ts) / 86400)
                    if (daysAgo <= 14) {
                      return <span className="text-[10px] text-green-500 font-medium">{recentLabel}</span>
                    }
                    const ago = formatDaysAgo(ts)
                    if (ago) {
                      return <span className="text-[10px] text-muted-foreground">{lastLabel} {ago}</span>
                    }
                    return null
                  })()}
                </div>
              )
            })()}
          </div>
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

// ── Dashboard section ──

function PlexDashboardSection() {
  const navigate = useNavigate()
  const { data, isLoading } = useLibraryTab("plex")
  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items.slice(0, 5)) ?? [],
    [data]
  )

  if (isLoading || items.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Plex
        </h2>
        <button
          onClick={() => navigate({ to: "/library/$tab", params: { tab: "plex" } })}
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
              mediaType={item.mediaType as "movie" | "show" | "game" | "music"}
              title={item.title}
              posterUrl={item.posterUrl}
              textlessPosterUrl={item.textlessPosterUrl}
              logoUrl={item.logoUrl}
              releaseDate={item.releaseDate}
              isAdult={item.isAdult}
            />
            {item.mediaType === "music" && item.albumArtistName && (
              <p className="mt-1 text-[11px] text-muted-foreground leading-tight truncate">
                {item.albumArtistName}
              </p>
            )}
            {item.plexViewCount != null && item.plexViewCount > 0 && (
              <div className="mt-1.5">
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {item.mediaType === "music" ? "Played" : "Viewed"} {item.plexViewCount} times
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

export const plexPlatform: PlatformDefinition = {
  id: "plex",
  label: "Plex",
  icon: <PlexIcon className="h-4 w-4" />,
  requiresConnection: (user) => !!user?.plexId,
  EmptyState: (props) => <PlexEmptyState {...props} />,
  DashboardSection: PlexDashboardSection,
  Content: PlexTabContent,
}

registerPlatform(plexPlatform)
