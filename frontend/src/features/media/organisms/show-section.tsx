import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Image } from "@ui/atoms/image"
import { cn } from "@/lib/utils"
import type { ShowDetail, SeasonOut, EpisodeOut } from "../media-queries"

interface ShowSectionProps {
  show: ShowDetail
  className?: string
}

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

function getPreferredSeason(seasons: SeasonOut[]): number {
  if (seasons.length === 0) return 0
  return seasons[seasons.length - 1].seasonNumber
}

const flipTransition = { duration: 0.38, ease: [0.16, 1, 0.3, 1] }

export function ShowSection({ show, className }: ShowSectionProps) {
  const seasons = useMemo(() => {
    if (!show.seasons || show.seasons.length === 0) return []
    return [...show.seasons]
      .filter((s) => s.seasonNumber !== 0 || (s.episodes && s.episodes.length > 0) || s.episodeCount > 0)
      .sort((a, b) => a.seasonNumber - b.seasonNumber)
  }, [show.seasons])

  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(() => getPreferredSeason(seasons))
  const [selectedEpisodeNum, setSelectedEpisodeNum] = useState<number | null>(null)
  const flipSourceRef = useRef<DOMRect | null>(null)

  const tabsRef = useRef<HTMLDivElement>(null)
  const episodesRef = useRef<HTMLDivElement>(null)
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false)
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false)
  const [canScrollEpLeft, setCanScrollEpLeft] = useState(false)
  const [canScrollEpRight, setCanScrollEpRight] = useState(false)

  const checkTabsScroll = useCallback(() => {
    const el = tabsRef.current
    if (!el) return
    setCanScrollTabsLeft(el.scrollLeft > 0)
    setCanScrollTabsRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  const checkEpScroll = useCallback(() => {
    const el = episodesRef.current
    if (!el) return
    setCanScrollEpLeft(el.scrollLeft > 0)
    setCanScrollEpRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    checkTabsScroll()
    checkEpScroll()
    window.addEventListener("resize", checkTabsScroll)
    window.addEventListener("resize", checkEpScroll)
    return () => {
      window.removeEventListener("resize", checkTabsScroll)
      window.removeEventListener("resize", checkEpScroll)
    }
  }, [checkTabsScroll, checkEpScroll])

  useEffect(() => {
    if (seasons.length === 0) return
    if (seasons.some((s) => s.seasonNumber === selectedSeasonNum)) return
    setSelectedSeasonNum(getPreferredSeason(seasons))
  }, [seasons, selectedSeasonNum])

  const scrollTabs = (dir: "left" | "right") => {
    tabsRef.current?.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" })
  }

  const scrollEpisodes = (dir: "left" | "right") => {
    episodesRef.current?.scrollBy({ left: dir === "left" ? -520 : 520, behavior: "smooth" })
  }

  if (seasons.length === 0) {
    return (
      <section className={cn(className)}>
        <h2 className="text-lg font-semibold mb-3">Seasons</h2>
        <div className="rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-base)] p-8 text-center">
          <p className="text-sm text-muted-foreground">No season information available.</p>
        </div>
      </section>
    )
  }

  const currentSeason = seasons.find((s) => s.seasonNumber === selectedSeasonNum)
  const hasEpisodes = !!currentSeason?.episodes && currentSeason.episodes.length > 0
  const currentEpisode = currentSeason?.episodes?.find((e) => e.episodeNumber === selectedEpisodeNum)
  const seasonPoster = currentSeason?.posterUrl

  return (
    <section className={cn("space-y-6", className)}>
      <h2 className="text-lg font-semibold">Seasons</h2>

      {/* ── Season Tabs ── */}
      <div className="relative">
        <button
          onClick={() => scrollTabs("left")}
          className={cn(
            'absolute left-0 top-1/2 -translate-y-1/2 z-10',
            'flex w-10 h-10 items-center justify-center rounded-full',
            'bg-[var(--dk-surface-glass)] backdrop-blur-md',
            'shadow-[var(--dk-shadow-glass)]',
            'text-foreground/70 hover:text-foreground',
            'transition-opacity duration-[var(--dk-duration-fast)]',
            canScrollTabsLeft ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div
          ref={tabsRef}
          onScroll={checkTabsScroll}
          className="flex gap-2 overflow-x-auto scrollbar-none px-10"
        >
          {seasons.map((season) => {
            const isActive = selectedSeasonNum === season.seasonNumber
            return (
              <button
                key={season.id}
                onClick={() => setSelectedSeasonNum(season.seasonNumber)}
                className={cn(
                  "shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all",
                  isActive
                    ? "bg-foreground text-background"
                    : "bg-[var(--dk-surface-glass)] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass-hover)] ring-1 ring-white/[0.04]",
                )}
              >
                {season.seasonNumber === 0 ? "Specials" : `Season ${season.seasonNumber}`}
              </button>
            )
          })}
        </div>

        <button
          onClick={() => scrollTabs("right")}
          className={cn(
            'absolute right-0 top-1/2 -translate-y-1/2 z-10',
            'flex w-10 h-10 items-center justify-center rounded-full',
            'bg-[var(--dk-surface-glass)] backdrop-blur-md',
            'shadow-[var(--dk-shadow-glass)]',
            'text-foreground/70 hover:text-foreground',
            'transition-opacity duration-[var(--dk-duration-fast)]',
            canScrollTabsRight ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
          aria-label="Scroll right"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* ── Season Content ── */}
      {currentSeason && (
        <div className="space-y-5">
          {/* Season header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
            <div className="shrink-0 w-32 sm:w-40">
              <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.06] aspect-[2/3]">
                <Image
                  src={seasonPoster || undefined}
                  alt={currentSeason.name || `Season ${currentSeason.seasonNumber}`}
                  className="h-full w-full"
                  fallback={`S${currentSeason.seasonNumber}`}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 min-w-0">
              <h3 className="text-base font-semibold">
                {currentSeason.name || `Season ${currentSeason.seasonNumber}`}
              </h3>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {currentSeason.episodeCount > 0 && (
                  <span>{currentSeason.episodeCount} episode{currentSeason.episodeCount !== 1 ? "s" : ""}</span>
                )}
              </div>

              {currentSeason.overview && (
                <p className="text-sm text-muted-foreground/80 leading-relaxed line-clamp-3">
                  {currentSeason.overview}
                </p>
              )}
            </div>
          </div>

          {/* ── Episodes ── */}
          {hasEpisodes && (
            <div className="relative">
              <button
                onClick={() => scrollEpisodes("left")}
                className={cn(
                  'absolute left-0 top-1/2 -translate-y-1/2 z-10',
                  'flex w-10 h-10 items-center justify-center rounded-full',
                  'bg-[var(--dk-surface-glass)] backdrop-blur-md',
                  'shadow-[var(--dk-shadow-glass)]',
                  'text-foreground/70 hover:text-foreground',
                  'transition-opacity duration-[var(--dk-duration-fast)]',
                  canScrollEpLeft ? 'opacity-100' : 'opacity-0 pointer-events-none',
                )}
                aria-label="Scroll left"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div
                ref={episodesRef}
                onScroll={checkEpScroll}
                className="flex gap-3 overflow-x-auto scrollbar-none px-10 pb-1"
              >
                {currentSeason.episodes
                  .sort((a, b) => a.episodeNumber - b.episodeNumber)
                  .map((episode) => {
                    const isActive = selectedEpisodeNum === episode.episodeNumber
                    const thumb = episode.stillUrl || seasonPoster
                    const runtime = formatRuntime(episode.runtime)

                    return (
                      <button
                        key={episode.id}
                        onClick={(e) => {
                          const thumbEl = e.currentTarget.querySelector("[data-thumb]")
                          flipSourceRef.current = thumbEl?.getBoundingClientRect() ?? null
                          setSelectedEpisodeNum(episode.episodeNumber)
                        }}
                        className={cn(
                          "shrink-0 flex flex-col w-[260px] text-left rounded-2xl overflow-hidden transition-all",
                          "bg-[var(--dk-surface-glass)] ring-1 ring-white/[0.04] hover:ring-white/[0.08]",
                          isActive && "ring-foreground/20 ring-2",
                        )}
                      >
                        <div data-thumb className="relative aspect-video bg-[var(--dk-surface-glass)]">
                          <Image
                            src={thumb || undefined}
                            alt={episode.name || `Episode ${episode.episodeNumber}`}
                            className="h-full w-full"
                            fallback={
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground/20 text-xs font-semibold">
                                E{episode.episodeNumber}
                              </div>
                            }
                          />
                          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-background/80 backdrop-blur px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                            E{episode.episodeNumber}
                          </span>
                          {runtime && (
                            <span className="absolute bottom-1.5 right-1.5 rounded-md bg-background/80 backdrop-blur px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                              {runtime}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
              </div>

              <button
                onClick={() => scrollEpisodes("right")}
                className={cn(
                  'absolute right-0 top-1/2 -translate-y-1/2 z-10',
                  'flex w-10 h-10 items-center justify-center rounded-full',
                  'bg-[var(--dk-surface-glass)] backdrop-blur-md',
                  'shadow-[var(--dk-shadow-glass)]',
                  'text-foreground/70 hover:text-foreground',
                  'transition-opacity duration-[var(--dk-duration-fast)]',
                  canScrollEpRight ? 'opacity-100' : 'opacity-0 pointer-events-none',
                )}
                aria-label="Scroll right"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}

          {!hasEpisodes && (
            <div className="rounded-xl border border-white/[0.04] bg-[var(--dk-surface-glass)] px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">No episode details available for this season.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Episode Detail Modal ── */}
      <AnimatePresence>
        {currentEpisode && (
          <EpisodeModal
            episode={currentEpisode}
            seasonPoster={seasonPoster}
            sourceRect={flipSourceRef.current}
            onClose={() => setSelectedEpisodeNum(null)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

// ── EpisodeModal ──────────────────────────────────────────────────

interface EpisodeModalProps {
  episode: EpisodeOut
  seasonPoster?: string | null
  sourceRect: DOMRect | null
  onClose: () => void
}

function EpisodeModal({ episode, seasonPoster, sourceRect, onClose }: EpisodeModalProps) {
  const thumbRef = useRef<HTMLDivElement>(null)
  const [targetRect, setTargetRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const [animDone, setAnimDone] = useState(false)

  useLayoutEffect(() => {
    if (!sourceRect || targetRect) return
    if (thumbRef.current) {
      setTargetRect(thumbRef.current.getBoundingClientRect())
    }
  }, [sourceRect, targetRect])

  // If we have no source rect, skip the clone animation entirely
  const showClone = !!(sourceRect && targetRect && !animDone)
  const showModal = animDone || !sourceRect

  const thumbSrc = episode.stillUrl || seasonPoster || undefined
  const runtime = formatRuntime(episode.runtime)

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: showModal ? 1 : showClone ? 1 : 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        style={{ zIndex: 50 }}
      />

      {/* Clone overlay — animates from card position to modal thumbnail position */}
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
            className="overflow-hidden bg-[var(--dk-surface-glass)] shadow-[var(--dk-shadow-glass)]"
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
            <span className="absolute bottom-2 left-2 rounded-md bg-background/80 backdrop-blur px-2 py-1 text-[10px] font-semibold tabular-nums">
              E{episode.episodeNumber}
            </span>
            {runtime && (
              <span className="absolute bottom-2 right-2 rounded-md bg-background/80 backdrop-blur px-2 py-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                {runtime}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal container — clicking the dark area dismisses */}
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
          className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-white/[0.08] bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-glass)]"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--dk-surface-glass)] ring-1 ring-white/[0.06] hover:bg-[var(--dk-surface-glass-hover)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div ref={thumbRef} className="relative aspect-video bg-[var(--dk-surface-glass)] rounded-t-3xl overflow-hidden">
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
            <span className="absolute bottom-2 left-2 rounded-md bg-background/80 backdrop-blur px-2 py-1 text-[10px] font-semibold tabular-nums">
              E{episode.episodeNumber}
            </span>
            {runtime && (
              <span className="absolute bottom-2 right-2 rounded-md bg-background/80 backdrop-blur px-2 py-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                {runtime}
              </span>
            )}
          </div>

          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
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
              <p className="text-sm text-muted-foreground/80 leading-relaxed">
                {episode.overview}
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </>
  )
}
