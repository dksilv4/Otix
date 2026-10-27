import { useMemo } from "react"
import { useLibraryTab } from "../library-queries"
import { Carousel } from "@ui/molecules/carousel"
import { MediaCard } from "@ui/molecules/media-card"

export const FavoritesReel = () => {
  const { data, isLoading } = useLibraryTab("like", { limit: "10" })

  const items = useMemo(() => {
    return data?.pages?.[0]?.items?.filter((item) => Boolean(item && item.id)) ?? []
  }, [data])

  if (isLoading || items.length === 0) return null

  return (
    <div className="space-y-4">
      <Carousel
        title="Favorites & Liked"
        subtitle="Your favorite movies, shows, and games"
        viewAllLink="/library/like"
        minItemWidth={160}
        gap={16}
        showArrows
      >
        {items.map((item) => (
          <div key={item.id} className="min-w-[160px] max-w-[200px]">
            <MediaCard
              id={item.id}
              mediaType={item.mediaType as any}
              title={item.title}
              posterUrl={item.posterUrl}
              textlessPosterUrl={item.textlessPosterUrl}
              logoUrl={item.logoUrl}
              releaseDate={item.releaseDate}
              isAdult={item.isAdult}
            />
          </div>
        ))}
      </Carousel>
    </div>
  )
}
