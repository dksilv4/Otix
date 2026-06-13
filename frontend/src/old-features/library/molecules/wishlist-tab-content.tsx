import { useRef, useMemo, useEffect } from "react"
import { useInView } from "framer-motion"
import { RefreshCw } from "lucide-react"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import { cn } from "@/lib/utils"
import { useSteamWishlist, useSteamWishlistScan } from "../library-queries"
import { SkeletonGrid } from "./skeleton-grid"
import { WishlistEmptyState } from "./wishlist-empty-state"

export function WishlistTabContent() {
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
