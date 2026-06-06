// TODO: Review this file
import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from "react"
import { ChevronLeft, ChevronRight, X, Star, CheckCircle2, Circle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Image } from "@ui/atoms/image"
import { cn } from "@/lib/utils"
import { DkDialog } from "@dk-ui/molecules/dialog"
import type { ShowDetail, SeasonOut, EpisodeOut, ExternalRatingOut } from "../media-queries"
import type { EpisodeInteractionState } from "@/features/interaction/episode-interaction-queries"
import "./show-section.scss"

const flipTransition = { duration: 0.32, ease: [0.16, 1, 0.3, 1] } as const

interface ShowSectionProps {
 show: ShowDetail
 className?: string
 episodeInteractions?: Record<string, EpisodeInteractionState>
 onToggleEpisodeWatched?: (episodeId: string, active: boolean) => void
 onMarkSeasonWatched?: (seasonNumber: number, active: boolean) => void
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

function getTmdbRating(episode: EpisodeOut): ExternalRatingOut | undefined {
 return episode.externalRatings?.find((r) => r.provider === "tmdb" && r.score > 0)
}

function scoreToColor(score: number, maxScore: number = 10): string {
 const t = Math.max(0, Math.min(1, score / maxScore))
 if (t < 0.25) return "bg-blue-800/60"
 if (t < 0.45) return "bg-blue-600/60"
 if (t < 0.55) return "bg-emerald-600/60"
 if (t < 0.65) return "bg-emerald-500/60"
 if (t < 0.72) return "bg-lime-500/60"
 if (t < 0.78) return "bg-yellow-500/60"
 if (t < 0.84) return "bg-orange-500/60"
 if (t < 0.90) return "bg-orange-600/70"
 return "bg-red-500/70"
}

// ── Inline Episode Ratings Heatmap ──

function EpisodeHeatmap({ episodes }: { episodes: EpisodeOut[] }) {
 const sorted = [...episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)
 const hasRatings = sorted.some((e) => getTmdbRating(e) !== undefined)
 if (!hasRatings) return null

 return (
 <div className="dk-media-show-section__heatmap">
 {sorted.map((ep) => {
 const rating = getTmdbRating(ep)
 const color = rating ? scoreToColor(rating.score) : "bg-white/[0.03]"
 const tooltip = rating
 ? `E${ep.episodeNumber}: ${rating.score.toFixed(1)}/10${rating.voteCount ? ` (${rating.voteCount} votes)` : ""}`
 : `E${ep.episodeNumber}: no rating`
 return (
 <div
 key={ep.id}
 title={tooltip}
 className={cn(
 "dk-media-show-section__heatmap-square",
 color,
 rating && "dk-media-show-section__heatmap-square--rated",
 )}
 />
 )
 })}
 </div>
 )
}

// ── Progress Bar ──

function SeasonProgressBar({ watched, total }: { watched: number; total: number }) {
 const pct = total > 0 ? Math.round((watched / total) * 100) : 0
 return (
 <div className="dk-media-show-section__progress">
 <div className="dk-media-show-section__progress-track">
 <div
 className="dk-media-show-section__progress-fill"
 style={{ width: `${pct}%` }}
 />
 </div>
 <span className="dk-media-show-section__progress-text">
 {watched}/{total}
 </span>
 </div>
 )
}

export function ShowSection({
 show,
 className,
 episodeInteractions,
 onToggleEpisodeWatched,
 onMarkSeasonWatched,
}: ShowSectionProps) {
 const seasons = useMemo(() => {
 if (!show.seasons || show.seasons.length === 0) return []
 return [...show.seasons]
 .filter((s) => s.seasonNumber !== 0 || (s.episodes && s.episodes.length > 0) || s.episodeCount > 0)
 .sort((a, b) => a.seasonNumber - b.seasonNumber)
 }, [show.seasons])

 const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(() => getPreferredSeason(seasons))
 const [selectedEpisodeNum, setSelectedEpisodeNum] = useState<number | null>(null)
 const [confirmSeasonNum, setConfirmSeasonNum] = useState<number | null>(null)
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

 const getSeasonProgress = useCallback(
 (season: SeasonOut) => {
 const episodes = season.episodes || []
 let watched = 0
 for (const ep of episodes) {
 if (episodeInteractions?.[ep.id]?.watched) watched++
 }
 return { watched, total: episodes.length }
 },
 [episodeInteractions],
 )

 // Confirmation dialog for season mark-all
 const confirmSeason = seasons.find((s) => s.seasonNumber === confirmSeasonNum)
 const confirmProgress = confirmSeason ? getSeasonProgress(confirmSeason) : { watched: 0, total: 0 }
 const confirmUnwatched = confirmProgress.total - confirmProgress.watched

 if (seasons.length === 0) {
 return (
 <section className={cn("dk-media-show-section", className)}>
 <h2 className="dk-media-show-section__title">Seasons</h2>
 <div className="dk-media-show-section__empty">
 <p className="dk-media-show-section__empty-text">No season information available.</p>
 </div>
 </section>
 )
 }

 const currentSeason = seasons.find((s) => s.seasonNumber === selectedSeasonNum)
 const hasEpisodes = !!currentSeason?.episodes && currentSeason.episodes.length > 0
 const currentEpisode = currentSeason?.episodes?.find((e) => e.episodeNumber === selectedEpisodeNum)
 const seasonPoster = currentSeason?.posterUrl
 const seasonProgress = currentSeason ? getSeasonProgress(currentSeason) : { watched: 0, total: 0 }

 return (
 <section className={cn("dk-media-show-section", className)}>
 <h2 className="dk-media-show-section__title">Seasons</h2>

 {/* ── Season Tabs ── */}
 <div className="dk-media-show-section__tabs">
 <button
 onClick={() => scrollTabs("left")}
 className={cn(
 "dk-media-show-section__tabs-btn dk-media-show-section__tabs-btn--left",
 canScrollTabsLeft ? "dk-media-show-section__tabs-btn--visible" : "dk-media-show-section__tabs-btn--hidden",
 )}
 aria-label="Scroll left"
 >
 <ChevronLeft className="h-5 w-5" />
 </button>

 <div
 ref={tabsRef}
 onScroll={checkTabsScroll}
 className="dk-media-show-section__tabs-scroll"
 >
 {seasons.map((season) => {
 const isActive = selectedSeasonNum === season.seasonNumber
 return (
 <button
 key={season.id}
 onClick={() => setSelectedSeasonNum(season.seasonNumber)}
 className={cn(
 "dk-media-show-section__tab",
 isActive && "dk-media-show-section__tab--active",
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
 "dk-media-show-section__tabs-btn dk-media-show-section__tabs-btn--right",
 canScrollTabsRight ? "dk-media-show-section__tabs-btn--visible" : "dk-media-show-section__tabs-btn--hidden",
 )}
 aria-label="Scroll right"
 >
 <ChevronRight className="h-5 w-5" />
 </button>
 </div>

 {/* ── Season Content ── */}
 {currentSeason && (
 <div className="dk-media-show-section__season">
 {/* Season header */}
 <div className="dk-media-show-section__season-header">
 <div className="dk-media-show-section__poster">
 <div className="dk-media-show-section__poster-frame">
 <Image
 src={seasonPoster || undefined}
 alt={currentSeason.name || `Season ${currentSeason.seasonNumber}`}
 className="h-full w-full"
 fallback={`S${currentSeason.seasonNumber}`}
 />
 </div>
 </div>

 <div className="dk-media-show-section__season-info">
 <h3 className="dk-media-show-section__season-name">
 {currentSeason.name || `Season ${currentSeason.seasonNumber}`}
 </h3>

 <div className="dk-media-show-section__season-meta">
 {currentSeason.episodeCount > 0 && (
 <span>{currentSeason.episodeCount} episode{currentSeason.episodeCount !== 1 ? "s" : ""}</span>
 )}
 </div>

 {/* Episode ratings heatmap */}
 {hasEpisodes && (
 <EpisodeHeatmap episodes={currentSeason.episodes} />
 )}

 {/* Watch progress */}
 {hasEpisodes && currentSeason.seasonNumber !== 0 && (
 <SeasonProgressBar watched={seasonProgress.watched} total={seasonProgress.total} />
 )}

 {/* Mark season as watched */}
 {hasEpisodes && onMarkSeasonWatched && confirmUnwatched > 0 && currentSeason.seasonNumber !== 0 && (
 <button
 onClick={() => setConfirmSeasonNum(currentSeason.seasonNumber)}
 className="dk-media-show-section__mark-btn"
 >
 Mark all as watched
 </button>
 )}
 {hasEpisodes && onMarkSeasonWatched && seasonProgress.watched === seasonProgress.total && seasonProgress.total > 0 && currentSeason.seasonNumber !== 0 && (
 <button
 onClick={() => onMarkSeasonWatched(currentSeason.seasonNumber, false)}
 className="dk-media-show-section__mark-btn dk-media-show-section__mark-btn--unwatch"
 >
 Mark all as unwatched
 </button>
 )}

 {currentSeason.overview && (
 <p className="dk-media-show-section__season-desc">
 {currentSeason.overview}
 </p>
 )}
 </div>
 </div>

 {/* ── Episodes ── */}
 {hasEpisodes && (
 <div className="dk-media-show-section__episodes">
 <button
 onClick={() => scrollEpisodes("left")}
 className={cn(
 "dk-media-show-section__episodes-btn dk-media-show-section__episodes-btn--left",
 canScrollEpLeft ? "dk-media-show-section__episodes-btn--visible" : "dk-media-show-section__episodes-btn--hidden",
 )}
 aria-label="Scroll left"
 >
 <ChevronLeft className="h-5 w-5" />
 </button>

 <div
 ref={episodesRef}
 onScroll={checkEpScroll}
 className="dk-media-show-section__episodes-scroll"
 >
 {currentSeason.episodes
 .sort((a, b) => a.episodeNumber - b.episodeNumber)
 .map((episode) => {
 const isActive = selectedEpisodeNum === episode.episodeNumber
 const thumb = episode.stillUrl || seasonPoster
 const runtime = formatRuntime(episode.runtime)
 const isWatched = episodeInteractions?.[episode.id]?.watched ?? false

 return (
 <button
 key={episode.id}
 onClick={(e) => {
 // Don't open modal if clicking the watch toggle
 if ((e.target as HTMLElement).closest("[data-watch-toggle]")) return
 const thumbEl = e.currentTarget.querySelector("[data-thumb]")
 flipSourceRef.current = thumbEl?.getBoundingClientRect() ?? null
 setSelectedEpisodeNum(episode.episodeNumber)
 }}
 className={cn(
 "dk-media-show-section__episode-card",
 isActive && "dk-media-show-section__episode-card--active",
 )}
 >
 <div data-thumb className="dk-media-show-section__episode-thumb">
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
 <span className="dk-media-show-section__episode-badge">
 E{episode.episodeNumber}
 </span>
 {getTmdbRating(episode) && (
 <span className="dk-media-show-section__episode-rating">
 <Star className="h-2.5 w-2.5 fill-amber-400 stroke-amber-400" />
 {getTmdbRating(episode)!.score.toFixed(1)}
 </span>
 )}
 {runtime && (
 <span className="dk-media-show-section__episode-runtime">
 {runtime}
 </span>
 )}

 {/* Watch toggle */}
 {onToggleEpisodeWatched && (
 <span
 data-watch-toggle
 onClick={(e) => {
 e.stopPropagation()
 onToggleEpisodeWatched(episode.id, !isWatched)
 }}
 className={cn(
 "dk-media-show-section__watch-toggle",
 isWatched && "dk-media-show-section__watch-toggle--watched",
 )}
 >
 {isWatched ? (
 <CheckCircle2 className="h-3.5 w-3.5" />
 ) : (
 <Circle className="h-3.5 w-3.5" />
 )}
 </span>
 )}
 </div>
 <div className="dk-media-show-section__episode-info">
 <p className="dk-media-show-section__episode-title">
 {episode.name || `Episode ${episode.episodeNumber}`}
 </p>
 {episode.airDate && (
 <p className="dk-media-show-section__episode-date">
 {formatDate(episode.airDate)}
 </p>
 )}
 </div>
 </button>
 )
 })}
 </div>

 <button
 onClick={() => scrollEpisodes("right")}
 className={cn(
 "dk-media-show-section__episodes-btn dk-media-show-section__episodes-btn--right",
 canScrollEpRight ? "dk-media-show-section__episodes-btn--visible" : "dk-media-show-section__episodes-btn--hidden",
 )}
 aria-label="Scroll right"
 >
 <ChevronRight className="h-5 w-5" />
 </button>
 </div>
 )}

 {!hasEpisodes && (
 <div className="dk-media-show-section__no-episodes">
 <p className="dk-media-show-section__no-episodes-text">No episode details available for this season.</p>
 </div>
 )}
 </div>
 )}

 {/* ── Mark Season Confirmation Dialog ── */}
 <DkDialog
 open={confirmSeasonNum !== null}
 onOpenChange={(open) => { if (!open) setConfirmSeasonNum(null) }}
 title={`Mark season as watched?`}
 description={
 confirmUnwatched > 0
 ? `This will mark all ${confirmUnwatched} remaining episodes in ${confirmSeason?.name || `Season ${confirmSeasonNum}`} as watched.`
 : `All episodes are already watched.`
 }
 >
 <div className="dk-media-show-section__dialog-actions">
 <button
 onClick={() => setConfirmSeasonNum(null)}
 className="dk-media-show-section__dialog-btn dk-media-show-section__dialog-btn--cancel"
 >
 Cancel
 </button>
 <button
 onClick={() => {
 if (confirmSeasonNum !== null && onMarkSeasonWatched) {
 onMarkSeasonWatched(confirmSeasonNum, true)
 }
 setConfirmSeasonNum(null)
 }}
 className="dk-media-show-section__dialog-btn dk-media-show-section__dialog-btn--confirm"
 >
 Mark {confirmUnwatched} as Watched
 </button>
 </div>
 </DkDialog>

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
 className="dk-media-episode-modal__backdrop"
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
 className="dk-media-episode-modal__clone"
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
 <span className="dk-media-episode-modal__badge">
 E{episode.episodeNumber}
 </span>
 {runtime && (
 <span className="dk-media-episode-modal__runtime-badge">
 {runtime}
 </span>
 )}
 </motion.div>
 )}
 </AnimatePresence>

 {/* Modal container — clicking the dark area dismisses */}
 <div
 className="dk-media-episode-modal__container"
 style={{ zIndex: 50, visibility: showModal ? "visible" : "hidden" }}
 onClick={onClose}
 >
 <motion.div
 initial={!sourceRect ? { opacity: 0, scale: 0.94, y: 24 } : { opacity: 0 }}
 animate={showModal ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0 }}
 transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
 onClick={(e) => e.stopPropagation()}
 className="dk-media-episode-modal__card"
 >
 <button
 onClick={onClose}
 className="dk-media-episode-modal__close"
 >
 <X className="w-4 h-4" />
 </button>

 <div ref={thumbRef} className="dk-media-episode-modal__thumb">
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
 <span className="dk-media-episode-modal__badge">
 E{episode.episodeNumber}
 </span>
 {runtime && (
 <span className="dk-media-episode-modal__runtime-badge">
 {runtime}
 </span>
 )}
 </div>

 <div className="dk-media-episode-modal__content">
 <div>
 <span className="dk-media-episode-modal__episode-label">
 Episode {episode.episodeNumber}
 </span>
 <h3 className="dk-media-episode-modal__title">
 {episode.name || `Episode ${episode.episodeNumber}`}
 </h3>
 </div>

 <div className="dk-media-episode-modal__meta">
 {formatDate(episode.airDate) && <span>{formatDate(episode.airDate)}</span>}
 {runtime && <span>{runtime}</span>}
 </div>

 {episode.overview && (
 <p className="dk-media-episode-modal__overview">
 {episode.overview}
 </p>
 )}
 </div>
 </motion.div>
 </div>
 </>
 )
}
