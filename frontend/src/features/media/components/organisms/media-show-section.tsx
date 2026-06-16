import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import { ChevronLeft, ChevronRight, Star, CheckCircle2, Circle } from "lucide-react"
import { Image } from "@ui/atoms/image"
import { cn } from "@/lib/utils"
import { DkDialog } from "@dk-ui/molecules/dialog"
import { EpisodeHeatmap } from "./media-show-episode-heatmap"
import { SeasonProgressBar } from "./media-show-season-progress-bar"
import { EpisodeModal } from "./media-show-episode-modal"
import { useQuery } from '@tanstack/react-query'
import { mediaQueries, type SeasonOut, type EpisodeOut, type ExternalRatingOut } from "@media"
import { useEpisodeInteractions, useToggleEpisodeWatched, useMarkSeasonWatched } from "@/old-features/interaction/episode-interaction-queries"
import { useParams } from "@tanstack/react-router"

interface ShowSectionProps {
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

function getTmdbRating(episode: EpisodeOut): ExternalRatingOut | undefined {
 return episode.externalRatings?.find((r) => r.provider === "tmdb" && r.score > 0)
}


export function ShowSection({
  className,
}: ShowSectionProps = {}) {
  const params = useParams({ strict: false }) as { mediaId?: string }
  const mediaId = params.mediaId || ''

  const { data } = useQuery(mediaQueries.detail('show', mediaId))
  const show = data?.show

  const episodeInteractionsQuery = useEpisodeInteractions(mediaId, { enabled: !!show })
  const toggleEpisodeWatched = useToggleEpisodeWatched(mediaId)
  const markSeasonWatched = useMarkSeasonWatched(mediaId)

  if (!show) return null

  const episodeInteractions = episodeInteractionsQuery.data?.episodes
  const onToggleEpisodeWatched = (episodeId: string, active: boolean) =>
    toggleEpisodeWatched.mutate({ episodeId, active })
  const onMarkSeasonWatched = (seasonNumber: number, active: boolean) =>
    markSeasonWatched.mutate({ seasonNumber, active })
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
 <section className={cn("space-y-6", className)}>
 <h2 className="text-lg font-semibold">Seasons</h2>
 <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--dk-surface-base)' }}>
 <p className="text-sm text-muted-foreground">No season information available.</p>
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
 <section className={cn("space-y-6", className)}>
 <h2 className="text-lg font-semibold">Seasons</h2>

 {/* ── Season Tabs ── */}
 <div className="relative">
 <button
 onClick={() => scrollTabs("left")}
 className={cn(
 "absolute top-1/2 z-10 flex w-10 h-10 items-center justify-center rounded-full -translate-y-1/2 left-0 transition-opacity duration-fast",
 canScrollTabsLeft ? "opacity-100" : "opacity-0 pointer-events-none",
 )}
 style={{ background: 'var(--dk-surface-glass)', backdropFilter: 'blur(12px)', boxShadow: 'var(--dk-shadow-glass)', color: 'hsl(var(--foreground) / 0.7)' }}
 onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(var(--foreground))'}
 onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(var(--foreground) / 0.7)'}
 aria-label="Scroll left"
 >
 <ChevronLeft className="h-5 w-5" />
 </button>

 <div
 ref={tabsRef}
 onScroll={checkTabsScroll}
 className="flex gap-2 overflow-x-auto px-6 scrollbar-none"
 style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
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
 ? "text-background"
 : "text-muted-foreground hover:text-foreground",
 )}
 style={{
 background: isActive ? 'hsl(var(--foreground))' : 'var(--dk-surface-glass)',
 boxShadow: isActive ? 'none' : 'inset 0 0 0 1px rgb(255 255 255 / 0.04)',
 ...(isActive ? {} : { hoverBackground: 'var(--dk-surface-glass-hover)' }),
 }}
 onMouseEnter={(e) => {
 if (!isActive) e.currentTarget.style.background = 'var(--dk-surface-glass-hover)'
 }}
 onMouseLeave={(e) => {
 if (!isActive) e.currentTarget.style.background = 'var(--dk-surface-glass)'
 }}
 >
 {season.seasonNumber === 0 ? "Specials" : `Season ${season.seasonNumber}`}
 </button>
 )
 })}
 </div>

 <button
 onClick={() => scrollTabs("right")}
 className={cn(
 "absolute top-1/2 z-10 flex w-10 h-10 items-center justify-center rounded-full -translate-y-1/2 right-0 transition-opacity duration-fast",
 canScrollTabsRight ? "opacity-100" : "opacity-0 pointer-events-none",
 )}
 style={{ background: 'var(--dk-surface-glass)', backdropFilter: 'blur(12px)', boxShadow: 'var(--dk-shadow-glass)', color: 'hsl(var(--foreground) / 0.7)' }}
 onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(var(--foreground))'}
 onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(var(--foreground) / 0.7)'}
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
 <div className="overflow-hidden rounded-xl aspect-[2/3]" style={{ boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.06)' }}>
 <Image
 src={seasonPoster || undefined}
 alt={currentSeason.name || `Season ${currentSeason.seasonNumber}`}
 className="h-full w-full"
 fallback={`S${currentSeason.seasonNumber}`}
 />
 </div>
 </div>

 <div className="flex flex-col gap-2 min-w-0 flex-1">
 <h3 className="text-base font-semibold">
 {currentSeason.name || `Season ${currentSeason.seasonNumber}`}
 </h3>

 <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
 className="self-start text-xs transition-colors text-muted-foreground hover:text-emerald-400"
 >
 Mark all as watched
 </button>
 )}
 {hasEpisodes && onMarkSeasonWatched && seasonProgress.watched === seasonProgress.total && seasonProgress.total > 0 && currentSeason.seasonNumber !== 0 && (
 <button
 onClick={() => onMarkSeasonWatched(currentSeason.seasonNumber, false)}
 className="self-start text-xs transition-colors text-muted-foreground hover:text-red-400"
 >
 Mark all as unwatched
 </button>
 )}

 {currentSeason.overview && (
 <p
 className="text-sm leading-relaxed text-muted-foreground/80 line-clamp-3"
 >
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
 "absolute top-1/2 z-10 flex w-10 h-10 items-center justify-center rounded-full -translate-y-1/2 left-0 transition-opacity duration-fast",
 canScrollEpLeft ? "opacity-100" : "opacity-0 pointer-events-none",
 )}
 style={{ background: 'var(--dk-surface-glass)', backdropFilter: 'blur(12px)', boxShadow: 'var(--dk-shadow-glass)', color: 'hsl(var(--foreground) / 0.7)' }}
 onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(var(--foreground))'}
 onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(var(--foreground) / 0.7)'}
 aria-label="Scroll left"
 >
 <ChevronLeft className="h-5 w-5" />
 </button>

 <div
 ref={episodesRef}
 onScroll={checkEpScroll}
 className="flex gap-3 overflow-x-auto px-6 pb-1 scrollbar-none"
 style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
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
 "shrink-0 flex flex-col w-[260px] text-left rounded-2xl overflow-hidden relative transition-all",
 isActive && "ring-2 ring-foreground/20",
 )}
 style={{ background: 'var(--dk-surface-glass)', boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.04)' }}
 onMouseEnter={(e) => {
 e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgb(255 255 255 / 0.08)'
 }}
 onMouseLeave={(e) => {
 if (!isActive) e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgb(255 255 255 / 0.04)'
 }}
 >
 <div data-thumb className="relative aspect-video" style={{ background: 'var(--dk-surface-glass)' }}>
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
 <span className="absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 font-semibold text-[10px] tabular-nums" style={{ background: 'hsl(var(--background) / 0.8)', backdropFilter: 'blur(4px)' }}>
 E{episode.episodeNumber}
 </span>
 {getTmdbRating(episode) && (
 <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold text-[10px] tabular-nums text-amber-400" style={{ background: 'hsl(var(--background) / 0.8)', backdropFilter: 'blur(4px)' }}>
 <Star className="h-2.5 w-2.5 fill-amber-400 stroke-amber-400" />
 {getTmdbRating(episode)!.score.toFixed(1)}
 </span>
 )}
 {runtime && (
 <span className="absolute bottom-1.5 right-1.5 rounded-md px-1.5 py-0.5 font-medium text-[10px] tabular-nums text-muted-foreground" style={{ background: 'hsl(var(--background) / 0.8)', backdropFilter: 'blur(4px)' }}>
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
 "absolute top-1.5 left-1.5 rounded-full p-0.5 transition-colors cursor-pointer",
 isWatched
 ? "bg-emerald-500/20 text-emerald-400"
 : "text-muted-foreground/50 hover:text-muted-foreground",
 )}
 style={{ background: isWatched ? undefined : 'hsl(var(--background) / 0.5)', backdropFilter: 'blur(4px)' }}
 >
 {isWatched ? (
 <CheckCircle2 className="h-3.5 w-3.5" />
 ) : (
 <Circle className="h-3.5 w-3.5" />
 )}
 </span>
 )}
 </div>
 <div className="px-3 py-2">
 <p className="text-xs font-medium truncate">
 {episode.name || `Episode ${episode.episodeNumber}`}
 </p>
 {episode.airDate && (
 <p className="text-[10px] text-muted-foreground mt-0.5">
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
 "absolute top-1/2 z-10 flex w-10 h-10 items-center justify-center rounded-full -translate-y-1/2 right-0 transition-opacity duration-fast",
 canScrollEpRight ? "opacity-100" : "opacity-0 pointer-events-none",
 )}
 style={{ background: 'var(--dk-surface-glass)', backdropFilter: 'blur(12px)', boxShadow: 'var(--dk-shadow-glass)', color: 'hsl(var(--foreground) / 0.7)' }}
 onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(var(--foreground))'}
 onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(var(--foreground) / 0.7)'}
 aria-label="Scroll right"
 >
 <ChevronRight className="h-5 w-5" />
 </button>
 </div>
 )}

 {!hasEpisodes && (
 <div className="rounded-xl px-4 py-6 text-center" style={{ background: 'var(--dk-surface-glass)' }}>
 <p className="text-xs text-muted-foreground">No episode details available for this season.</p>
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
 <div className="flex justify-end gap-3 mt-6">
 <button
 onClick={() => setConfirmSeasonNum(null)}
 className="px-4 py-2 rounded-xl text-sm font-medium transition-colors text-foreground"
 style={{ background: 'var(--dk-surface-glass)' }}
 onMouseEnter={(e) => e.currentTarget.style.background = 'var(--dk-surface-glass-hover)'}
 onMouseLeave={(e) => e.currentTarget.style.background = 'var(--dk-surface-glass)'}
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
 className="px-4 py-2 rounded-xl text-sm font-medium transition-colors text-white bg-emerald-600 hover:bg-emerald-500"
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

