import { useRef, useMemo, useEffect } from "react"
import { useInView } from "framer-motion"
import { BookmarkIcon } from "lucide-react"
import { MediaCard } from "@ui/molecules/media-card"
import { MediaGrid } from "@ui/molecules/media-grid"
import { useLibraryTab, TAB_LABELS } from "../library-queries"
import type { LibraryTab } from "../library-queries"
import { SkeletonGrid } from "./skeleton-grid"

export function MediaTabContent({ tab }: { tab: LibraryTab }) {
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
