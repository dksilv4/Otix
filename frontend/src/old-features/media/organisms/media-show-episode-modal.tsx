import { useState, useRef, useLayoutEffect } from "react"
import { X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Image } from "@ui/atoms/image"
import type { EpisodeOut } from "../media-queries"

const flipTransition = { duration: 0.32, ease: [0.16, 1, 0.3, 1] } as const

function formatDate(dateStr?: string | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function formatRuntime(minutes?: number | null): string | null {
  if (!minutes) return null
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h ${m}m`
  }
  return `${minutes}m`
}

interface EpisodeModalProps {
  episode: EpisodeOut
  seasonPoster?: string | null
  sourceRect: DOMRect | null
  onClose: () => void
}

export function EpisodeModal({ episode, seasonPoster, sourceRect, onClose }: EpisodeModalProps) {
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
    <>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: showModal ? 1 : showClone ? 1 : 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0"
        style={{ zIndex: 50, background: 'hsl(var(--background) / 0.8)', backdropFilter: 'blur(4px)' }}
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
            transition={flipTransition}
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
            <span className="absolute bottom-2 left-2 rounded-md px-2 py-1 font-semibold text-[10px] tabular-nums" style={{ background: 'hsl(var(--background) / 0.8)', backdropFilter: 'blur(4px)' }}>
              E{episode.episodeNumber}
            </span>
            {runtime && (
              <span className="absolute bottom-2 right-2 rounded-md px-2 py-1 font-medium text-[10px] tabular-nums text-muted-foreground" style={{ background: 'hsl(var(--background) / 0.8)', backdropFilter: 'blur(4px)' }}>
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
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg overflow-y-auto rounded-3xl"
          style={{ maxHeight: '85vh', background: 'var(--dk-surface-base)', boxShadow: 'var(--dk-shadow-glass)' }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            style={{ background: 'var(--dk-surface-glass)', boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.06)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--dk-surface-glass-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--dk-surface-glass)'}
          >
            <X className="w-4 h-4" />
          </button>

          <div ref={thumbRef} className="relative rounded-t-3xl overflow-hidden aspect-video" style={{ background: 'var(--dk-surface-glass)' }}>
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
            <span className="absolute bottom-2 left-2 rounded-md px-2 py-1 font-semibold text-[10px] tabular-nums" style={{ background: 'hsl(var(--background) / 0.8)', backdropFilter: 'blur(4px)' }}>
              E{episode.episodeNumber}
            </span>
            {runtime && (
              <span className="absolute bottom-2 right-2 rounded-md px-2 py-1 font-medium text-[10px] tabular-nums text-muted-foreground" style={{ background: 'hsl(var(--background) / 0.8)', backdropFilter: 'blur(4px)' }}>
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
          </div>
        </motion.div>
      </div>
    </>
  )
}
