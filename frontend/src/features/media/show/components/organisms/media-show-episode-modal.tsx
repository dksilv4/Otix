import { useState, useRef, useLayoutEffect } from "react"
import { Play, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Image } from "@ui/atoms/image"
import type { EpisodeOut } from "@media/queries/media-queries"
import { formatDate, formatRuntime } from '@media'
import { FLIP_TRANSITION } from '@media'
import { useStreamEpisode } from "@/features/media/hooks/use-stream-episode"

interface EpisodeModalProps {
  episode: EpisodeOut
  seasonPoster?: string | null
  sourceRect: DOMRect | null
  onClose: () => void
  isExiting?: boolean
  showId?: string
  showTitle?: string
  seasonNumber?: number
}

export const EpisodeModal = ({
  episode,
  seasonPoster,
  sourceRect,
  onClose,
  isExiting,
  showId,
  showTitle,
  seasonNumber,
}: EpisodeModalProps) => {
  const { streamEpisode } = useStreamEpisode()
  const thumbRef = useRef<HTMLDivElement>(null)
  const [targetRect, setTargetRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const [animDone, setAnimDone] = useState(false)

  useLayoutEffect(() => {
    if (!sourceRect || targetRect) return
    if (thumbRef.current) {
      setTargetRect(thumbRef.current.getBoundingClientRect())
    }
  }, [sourceRect, targetRect])

  const showClone = !!(sourceRect && targetRect && !animDone)
  const showModal = animDone || !sourceRect

  const thumbSrc = episode.stillUrl || seasonPoster || undefined
  const runtime = formatRuntime(episode.runtime)

  return (
    <AnimatePresence>
      {!isExiting && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: showModal ? 1 : showClone ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0" style={{ zIndex: 50, background: 'hsl(var(--background) / 0.8)', backdropFilter: 'blur(4px)' }}
          />

          <AnimatePresence>
            {showClone && (
              <motion.div
                key="clone"
                initial={{
                  position: "fixed",
                  zIndex: 60,
                  top: sourceRect.top,
                  left: sourceRect.left,
                  width: sourceRect.width,
                  height: sourceRect.height,
                  borderRadius: 12,
                }}
                animate={{
                  top: targetRect.top,
                  left: targetRect.left,
                  width: targetRect.width,
                  height: targetRect.height,
                  borderRadius: 24,
                }}
                exit={{ opacity: 0 }}
                transition={FLIP_TRANSITION}
                onAnimationComplete={() => setAnimDone(true)}
              >
                <Image
                  src={thumbSrc}
                  alt={episode.name || `Episode ${episode.episodeNumber}`}
                  className="h-full w-full"
                  fallback={
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/20 text-sm font-semibold">
                      E{episode.episodeNumber}
                    </div>
                  }
                />
                <span className="absolute bottom-2 left-2 rounded-md px-2 py-1 font-semibold text-[10px] tabular-nums glass-badge">
                  E{episode.episodeNumber}
                </span>
                {runtime && (
                  <span className="absolute bottom-2 right-2 rounded-md px-2 py-1 font-medium text-[10px] tabular-nums text-muted-foreground glass-badge">
                    {runtime}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div
            className="fixed inset-0 flex items-center justify-center p-4 sm:p-8"
            style={{ zIndex: 50, visibility: showModal ? "visible" : "hidden" }}
            onClick={onClose}
          >
            <motion.div
              initial={!sourceRect ? { opacity: 0, scale: 0.94, y: 24 } : { opacity: 0 }}
              animate={showModal ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0 }}
              exit={!sourceRect ? { opacity: 0, scale: 0.94, y: 24 } : { opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}

              className="glass-card relative w-full max-w-lg overflow-y-auto" style={{ maxHeight: '85vh' }}
            >
              <button
                onClick={onClose}
                className="glass-inset absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div ref={thumbRef} className="relative rounded-t-3xl overflow-hidden aspect-video glass-episode-card">
                <Image
                  src={thumbSrc}
                  alt={episode.name || `Episode ${episode.episodeNumber}`}
                  className="h-full w-full"
                  fallback={
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/20 text-sm font-semibold">
                      E{episode.episodeNumber}
                    </div>
                  }
                />
                <span className="absolute bottom-2 left-2 rounded-md px-2 py-1 font-semibold text-[10px] tabular-nums glass-badge">
                  E{episode.episodeNumber}
                </span>
                {runtime && (
                  <span className="absolute bottom-2 right-2 rounded-md px-2 py-1 font-medium text-[10px] tabular-nums text-muted-foreground glass-badge">
                    {runtime}
                  </span>
                )}
              </div>

              <div className="p-5 space-y-4 sm:p-6">
                <div>
                  <span className="font-semibold uppercase text-[11px] text-muted-foreground tracking-wider">
                    Episode {episode.episodeNumber}
                  </span>
                  <h3 className="text-lg font-semibold mt-1">
                    {episode.name || `Episode ${episode.episodeNumber}`}
                  </h3>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {formatDate(episode.airDate) && <span>{formatDate(episode.airDate)}</span>}
                  {runtime && <span>{runtime}</span>}
                </div>

                {episode.overview && (
                  <p className="text-sm leading-relaxed text-muted-foreground/80">
                    {episode.overview}
                  </p>
                )}

                {showId && seasonNumber != null && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose()
                        void streamEpisode({
                          showId,
                          showTitle,
                          seasonNumber,
                          episodeNumber: episode.episodeNumber,
                          episodeTitle: episode.name || undefined,
                        })
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/50 hover:bg-amber-500/30 hover:ring-amber-400/70 font-semibold text-xs sm:text-sm transition-all shadow-lg active:scale-98"
                    >
                      <Play className="h-4 w-4 fill-current text-current" />
                      <span>Stream Episode {episode.episodeNumber}</span>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
};
