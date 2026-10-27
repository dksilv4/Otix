import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Play, Clock } from "lucide-react"
import { userQueries } from "@/features/user/user-queries"
import { useQuickStream } from "@/features/media/hooks/use-quick-stream"
import { Carousel } from "@ui/molecules/carousel"
import { DkImage } from "@ui/atoms/image"

export const ContinueWatchingReel = () => {
  const navigate = useNavigate()
  const { data: continueItems = [], isLoading } = useQuery(userQueries.continueWatching())
  const { quickStream, isStartingStream, activeMediaId } = useQuickStream()

  const items = useMemo(() => {
    return Array.isArray(continueItems) ? continueItems.filter((i) => i && i.id) : []
  }, [continueItems])

  if (isLoading || items.length === 0) return null

  return (
    <div className="space-y-4">
      <Carousel
        title="Continue Watching"
        subtitle="Pick up right where you left off"
        minItemWidth={260}
        gap={16}
        showArrows
      >
        {items.map((item) => {
          const isBusy = isStartingStream && activeMediaId === item.id
          const imageSrc = item.backdropUrl || item.posterUrl || undefined

          return (
            <div
              key={item.id}
              className="group relative flex flex-col min-w-[260px] rounded-2xl overflow-hidden bg-[var(--dk-surface-glass)]/60 hover:bg-[var(--dk-surface-elevated)] backdrop-blur-xl border border-white/[0.04] shadow-sm transition-all duration-300"
            >
              {/* Image banner */}
              <div
                className="relative aspect-video w-full overflow-hidden bg-black/20 cursor-pointer"
                onClick={() =>
                  navigate({
                    to: "/media/$mediaType/$mediaId",
                    params: { mediaType: item.mediaType as any, mediaId: item.id },
                  })
                }
              >
                {imageSrc && (
                  <DkImage
                    src={imageSrc}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />

                {/* Quick Stream Resume Button Overlay */}
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={(e) => {
                    e.stopPropagation()
                    void quickStream({
                      mediaId: item.id,
                      mediaType: item.mediaType,
                      title: item.title,
                    })
                  }}
                  className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-110 active:scale-95 transition-all"
                  aria-label={`Resume ${item.title}`}
                >
                  <Play className="h-4 w-4 fill-current ml-0.5" />
                </button>
              </div>

              {/* Details pod */}
              <div
                className="flex flex-col p-3.5 cursor-pointer"
                onClick={() =>
                  navigate({
                    to: "/media/$mediaType/$mediaId",
                    params: { mediaType: item.mediaType as any, mediaId: item.id },
                  })
                }
              >
                <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {item.title}
                </h3>
                {item.episodeContext ? (
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">
                    {item.episodeContext}
                  </p>
                ) : (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>In progress</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </Carousel>
    </div>
  )
}
