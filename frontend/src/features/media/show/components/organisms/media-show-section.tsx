import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Play, Loader2, Check } from "lucide-react"
import { Image } from "@ui/atoms/image"
import { DkDialog } from "@ui/molecules/dialog"
import { SeasonProgressBar } from "./media-show-season-progress-bar"
import { EpisodeModal } from "./media-show-episode-modal"
import { useQuery } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { useAuth } from '@auth/hooks/use-auth'
import { mediaQueries, formatDate, formatRuntime, getPreferredSeason, useMediaParams, type SeasonOut } from "@media"
import { useEpisodeInteractions, useToggleEpisodeWatched, useMarkSeasonWatched } from "@/features/interaction/episode-interaction-queries"
import { useModal } from "@/lib/modals"
import { useStreamEpisode } from "@/features/media/hooks/use-stream-episode"

interface ShowSectionProps {
  className?: string
}


export const ShowSection = ({
  className,
}: ShowSectionProps = {}) => {
  const { mediaType, mediaId } = useMediaParams()
  const { isAuthenticated } = useAuth()
  const { openModal } = useModal()
  const { streamEpisode, loadingKey } = useStreamEpisode()
  // ?season=N deep link (discover season rails) — parsed by the route's
  // validateSearch, so it survives hard refresh/share.
  const seasonSearch = useSearch({ strict: false }) as { season?: number }
  const requestedSeasonNum = typeof seasonSearch.season === 'number' ? seasonSearch.season : undefined

  const { data } = useQuery(mediaQueries.detail('show', mediaId))
  const show = data?.show

  const episodeInteractionsQuery = useEpisodeInteractions(mediaType, mediaId, {
    enabled: !!show && isAuthenticated,
  })
  const toggleEpisodeWatched = useToggleEpisodeWatched(mediaType, mediaId)
  const markSeasonWatched = useMarkSeasonWatched(mediaType, mediaId)

  const episodeInteractions = episodeInteractionsQuery.data?.episodes
  const onToggleEpisodeWatched = (episodeId: string, active: boolean) =>
    toggleEpisodeWatched.mutate({ episodeId, active })
  const onMarkSeasonWatched = (seasonNumber: number, active: boolean) =>
    markSeasonWatched.mutate({ seasonNumber, active })
  const seasons = useMemo(() => {
    if (!Array.isArray(show?.seasons) || show.seasons.length === 0) return []
    return [...show.seasons]
      .filter((s) => {
        if (!s) return false
        const episodeCount = Array.isArray(s.episodes) ? s.episodes.length : (s.episodeCount ?? 0)
        return episodeCount > 0
      })
      .sort((a, b) => a.seasonNumber - b.seasonNumber)
  }, [show])

 const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(() =>
   seasons.some((s) => s.seasonNumber === requestedSeasonNum)
     ? (requestedSeasonNum as number)
     : getPreferredSeason(seasons),
 )
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
 if (requestedSeasonNum != null && seasons.some((s) => s.seasonNumber === requestedSeasonNum)) {
   setSelectedSeasonNum(requestedSeasonNum)
   return
 }
 setSelectedSeasonNum(getPreferredSeason(seasons))
 }, [seasons, selectedSeasonNum, requestedSeasonNum])

 const scrollTabs = (dir: "left" | "right") => {
 tabsRef.current?.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" })
 }

 const scrollEpisodes = (dir: "left" | "right") => {
 episodesRef.current?.scrollBy({ left: dir === "left" ? -520 : 520, behavior: "smooth" })
 }

 const getSeasonProgress = useCallback(
 (season: SeasonOut) => {
 const episodes = Array.isArray(season?.episodes) ? season.episodes : []
 let watched = 0
 for (const ep of episodes) {
 if (ep && episodeInteractions?.[ep.id]?.watched) watched++
 }
 return { watched, total: episodes.length }
 },
 [episodeInteractions],
 )

  if (!show) return null

  if (seasons.length === 0) {
    return (
      <section className={`space-y-6 ${className || ''}`}>
        <h2 className="text-lg font-semibold">Seasons</h2>
        <div className="rounded-2xl p-8 text-center glass-inset">
          <p className="text-sm text-muted-foreground">No season information available.</p>
        </div>
      </section>
    )
  }

  const currentSeason = seasons.find((s) => s.seasonNumber === selectedSeasonNum)
  const currentEpisodes = Array.isArray(currentSeason?.episodes)
    ? [...currentSeason.episodes].filter(Boolean).sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0))
    : []
  const hasEpisodes = currentEpisodes.length > 0
  const seasonPoster = currentSeason?.posterUrl
  const seasonProgress = currentSeason ? getSeasonProgress(currentSeason) : { watched: 0, total: 0 }
  const currentUnwatched = seasonProgress.total - seasonProgress.watched

  const firstPlayableEpisode =
    hasEpisodes
      ? currentEpisodes.find((ep) => !episodeInteractions?.[ep.id]?.watched) || currentEpisodes[0]
      : null

  const handleMarkSeasonWatchedConfirm = () => {
    if (!currentSeason) return
    const close = openModal(
      <DkDialog
        open={true}
        onOpenChange={() => close()}
        title="Mark season as watched?"
        description={
          currentUnwatched > 0
            ? `This will mark all ${currentUnwatched} remaining episodes in ${currentSeason.name || `Season ${currentSeason.seasonNumber}`} as watched.`
            : `All episodes are already watched.`
        }
      >
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => close()}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors text-foreground glass-inset"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onMarkSeasonWatched(currentSeason.seasonNumber, true)
              close()
            }}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors text-primary-foreground bg-primary hover:bg-primary/90"
          >
            Mark {currentUnwatched} as Watched
          </button>
        </div>
      </DkDialog>
    )
  }

 return (
 <section className={`space-y-5 ${className || ''}`}>
 <div className="flex items-center justify-between px-1">
 <h2 className="text-xl font-bold tracking-tight">Seasons</h2>
 </div>

 {/* ── Season Tabs ── */}
 <div className="relative group/tabs -mx-2 px-2">
 <button
 onClick={() => scrollTabs("left")}
 className={`glass-scroll-btn absolute top-1/2 z-20 flex w-8 h-8 items-center justify-center rounded-full -translate-y-1/2 left-0 transition-all duration-300 shadow-md ${canScrollTabsLeft ? "opacity-0 group-hover/tabs:opacity-100 translate-x-2" : "opacity-0 pointer-events-none -translate-x-2"}`}
 aria-label="Scroll left"
 >
 <ChevronLeft className="h-4 w-4" />
 </button>

 <div
 ref={tabsRef}
 onScroll={checkTabsScroll}
 className="flex gap-2 overflow-x-auto px-4 py-2 scrollbar-none snap-x snap-mandatory"
 style={{
   maskImage: (canScrollTabsLeft || canScrollTabsRight) ? `linear-gradient(to right, ${canScrollTabsLeft ? 'transparent' : 'black'}, black 1.5rem, black calc(100% - 1.5rem), ${canScrollTabsRight ? 'transparent' : 'black'})` : 'none',
   WebkitMaskImage: (canScrollTabsLeft || canScrollTabsRight) ? `linear-gradient(to right, ${canScrollTabsLeft ? 'transparent' : 'black'}, black 1.5rem, black calc(100% - 1.5rem), ${canScrollTabsRight ? 'transparent' : 'black'})` : 'none',
 }}
 >
 {seasons.map((season) => {
 const isActive = selectedSeasonNum === season.seasonNumber
 return (
 <button
 key={season.id}
 onClick={() => setSelectedSeasonNum(season.seasonNumber)}
 className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all snap-start ${isActive ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-105" : "glass-tab text-muted-foreground hover:text-foreground hover:scale-105"}`}
 >
 {season.seasonNumber === 0 ? "Specials" : `Season ${season.seasonNumber}`}
 </button>
 )
 })}
 </div>

 <button
 onClick={() => scrollTabs("right")}
 className={`glass-scroll-btn absolute top-1/2 z-20 flex w-8 h-8 items-center justify-center rounded-full -translate-y-1/2 right-0 transition-all duration-300 shadow-md ${canScrollTabsRight ? "opacity-0 group-hover/tabs:opacity-100 -translate-x-2" : "opacity-0 pointer-events-none translate-x-2"}`}
 aria-label="Scroll right"
 >
 <ChevronRight className="h-4 w-4" />
 </button>
 </div>

 {/* ── Season Content ── */}
 {currentSeason && (
 <div className="space-y-6">
 {/* Season header */}
 <div className="glass-inset p-5 sm:p-6 rounded-3xl flex flex-col sm:flex-row gap-5 sm:gap-6 items-start relative overflow-hidden">
 {/* Decorative background glow */}
 <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
 
 <div className="shrink-0 w-28 sm:w-36 relative z-10">
 <div className="overflow-hidden rounded-2xl aspect-[2/3] shadow-[var(--dk-shadow-sm)] bg-[var(--dk-surface-glass)]">
 <Image
 src={seasonPoster || undefined}
 alt={currentSeason.name || `Season ${currentSeason.seasonNumber}`}
 className="h-full w-full object-cover"
 fallback={`S${currentSeason.seasonNumber}`}
 />
 </div>
 </div>

 <div className="flex flex-col gap-3 min-w-0 flex-1 relative z-10">
 <div>
 <h3 className="text-xl font-bold tracking-tight text-foreground">
 {currentSeason.name || `Season ${currentSeason.seasonNumber}`}
 </h3>
 <div className="flex items-center gap-2 mt-1 text-xs font-medium text-muted-foreground">
 {currentSeason.episodeCount > 0 && (
 <span>{currentSeason.episodeCount} episode{currentSeason.episodeCount !== 1 ? "s" : ""}</span>
 )}
 </div>
 </div>

 {/* Watch progress */}
 {hasEpisodes && currentSeason.seasonNumber !== 0 && (
 <div className="max-w-md mt-1">
 <SeasonProgressBar watched={seasonProgress.watched} total={seasonProgress.total} />
 </div>
 )}

 <div className="flex flex-wrap gap-3 items-center mt-2">
 {hasEpisodes && firstPlayableEpisode && (
 <button
 onClick={() =>
   streamEpisode({
     showId: data?.id ? String(data.id) : mediaId,
     showTitle: data?.title,
     seasonNumber: currentSeason.seasonNumber,
     episodeNumber: firstPlayableEpisode.episodeNumber,
     episodeTitle: firstPlayableEpisode.name,
   })
 }
 disabled={loadingKey === `${data?.id ? String(data.id) : mediaId}-s${currentSeason.seasonNumber}-e${firstPlayableEpisode.episodeNumber}`}
 className="text-xs font-semibold transition-all text-primary-foreground flex items-center gap-1.5 bg-primary hover:bg-primary/90 active:scale-95 px-3.5 py-1.5 rounded-full shadow-sm hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50"
 >
 {loadingKey === `${data?.id ? String(data.id) : mediaId}-s${currentSeason.seasonNumber}-e${firstPlayableEpisode.episodeNumber}` ? (
   <Loader2 className="w-3.5 h-3.5 animate-spin" />
 ) : (
   <Play className="w-3.5 h-3.5 fill-current" />
 )}
 <span>Play Season {currentSeason.seasonNumber}</span>
 </button>
 )}
 {/* Mark season as watched */}
 {hasEpisodes && currentUnwatched > 0 && currentSeason.seasonNumber !== 0 && (
 <button
 onClick={handleMarkSeasonWatchedConfirm}
 className="text-xs font-medium transition-all text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1.5 bg-[var(--dk-surface-glass)] px-3 py-1.5 rounded-full hover:bg-[var(--dk-surface-glass-hover)] shadow-sm hover:shadow-md hover:-translate-y-0.5"
 >
 <CheckCircle2 className="w-3.5 h-3.5" />
 Mark all as watched
 </button>
 )}
 {hasEpisodes && seasonProgress.watched === seasonProgress.total && seasonProgress.total > 0 && currentSeason.seasonNumber !== 0 && (
 <button
 onClick={() => onMarkSeasonWatched(currentSeason.seasonNumber, false)}
 className="text-xs font-medium transition-all text-muted-foreground hover:text-destructive flex items-center gap-1.5 bg-[var(--dk-surface-glass)] px-3 py-1.5 rounded-full hover:bg-[var(--dk-surface-glass-hover)] shadow-sm hover:shadow-md hover:-translate-y-0.5"
 >
 <Circle className="w-3.5 h-3.5" />
 Mark all as unwatched
 </button>
 )}
 </div>

 {currentSeason.overview && (
 <p className="text-sm leading-relaxed text-muted-foreground/90 line-clamp-3 mt-1">
 {currentSeason.overview}
 </p>
 )}
 </div>
 </div>

 {/* ── Episodes ── */}
 {hasEpisodes && (
 <div className="relative group/episodes -mx-4 px-4 sm:mx-0 sm:px-0">
 <button
 onClick={() => scrollEpisodes("left")}
 className={`glass-scroll-btn absolute top-[40%] z-20 flex w-10 h-10 items-center justify-center rounded-full -translate-y-1/2 left-2 sm:-left-4 transition-all duration-300 shadow-lg ${canScrollEpLeft ? "opacity-0 group-hover/episodes:opacity-100 scale-100" : "opacity-0 pointer-events-none scale-90"}`}
 aria-label="Scroll left"
 >
 <ChevronLeft className="h-5 w-5" />
 </button>

 <div
 ref={episodesRef}
 onScroll={checkEpScroll}
 className="flex gap-4 overflow-x-auto pb-4 pt-2 px-2 scrollbar-none"
 >
 {currentEpisodes.map((episode) => {
            const isActive = false
            const thumb = episode.stillUrl || seasonPoster
            const runtime = formatRuntime(episode.runtime)
            const isWatched = episodeInteractions?.[episode.id]?.watched ?? false
            const epLoadingKey = `${data?.id ? String(data.id) : mediaId}-s${currentSeason.seasonNumber}-e${episode.episodeNumber}`
            const isEpLoading = loadingKey === epLoadingKey

            return (
              <button
                key={episode.id}
                onClick={(e) => {
                  // Don't open modal if clicking the watch toggle or stream button
                  if ((e.target as HTMLElement).closest("[data-watch-toggle]") || (e.target as HTMLElement).closest("[data-stream-btn]")) return
                  const thumbEl = e.currentTarget.querySelector("[data-thumb]")
                  flipSourceRef.current = thumbEl?.getBoundingClientRect() ?? null
                  const close = openModal(
                    <EpisodeModal
                      episode={episode}
                      seasonPoster={seasonPoster}
                      sourceRect={flipSourceRef.current}
                      showId={data?.id ? String(data.id) : mediaId}
                      showTitle={data?.title}
                      seasonNumber={currentSeason.seasonNumber}
                      onClose={() => close()}
                    />
                  )
                }}
 className={`glass-episode-card group shrink-0 flex flex-col w-[260px] text-left rounded-2xl overflow-hidden relative transition-all hover:-translate-y-0.5 hover:shadow-xl ${isActive ? "bg-[var(--dk-surface-glass-hover)] border border-[var(--dk-separator)]" : ""}`}
 >
 <div data-thumb className="relative aspect-video bg-black/10 overflow-hidden">
 <Image
 src={thumb || undefined}
 alt={episode.name || `Episode ${episode.episodeNumber}`}
 className="h-full w-full transition-transform duration-500 group-hover:scale-105"
 fallback={
 <div className="flex h-full w-full items-center justify-center text-muted-foreground/20 text-xs font-semibold">
 E{episode.episodeNumber}
 </div>
 }
 />
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
 <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
 <span
 data-stream-btn
 role="button"
 tabIndex={0}
 aria-label={`Play ${episode.name || `Episode ${episode.episodeNumber}`}`}
 onClick={(e) => {
 e.stopPropagation()
 streamEpisode({
   showId: data?.id ? String(data.id) : mediaId,
   showTitle: data?.title,
   seasonNumber: currentSeason.seasonNumber,
   episodeNumber: episode.episodeNumber,
   episodeTitle: episode.name,
 })
 }}
 className="pointer-events-auto w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform cursor-pointer"
 >
 {isEpLoading ? (
   <Loader2 className="w-4 h-4 animate-spin text-primary" />
 ) : (
   <Play className="w-4 h-4 fill-current ml-0.5" />
 )}
 </span>
 </div>
 <span className="glass-badge absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 font-semibold text-[10px] tabular-nums text-foreground/90 z-10">
 E{episode.episodeNumber}
 </span>
 {runtime && (
 <span className="glass-badge absolute bottom-1.5 right-1.5 rounded-md px-1.5 py-0.5 font-medium text-[10px] tabular-nums text-muted-foreground z-10">
 {runtime}
 </span>
 )}

 {/* Watch toggle */}
 {onToggleEpisodeWatched && (
 <span
 data-watch-toggle
 role="button"
 tabIndex={0}
 aria-label={isWatched ? "Mark episode as unwatched" : "Mark episode as watched"}
 title={isWatched ? "Mark as unwatched" : "Mark as watched"}
 onClick={(e) => {
 e.stopPropagation()
 onToggleEpisodeWatched(episode.id, !isWatched)
 }}
 onKeyDown={(e) => {
 if (e.key === "Enter" || e.key === " ") {
 e.preventDefault()
 e.stopPropagation()
 onToggleEpisodeWatched(episode.id, !isWatched)
 }
 }}
 className={`absolute top-1.5 left-1.5 rounded-full p-1 transition-all cursor-pointer hover:scale-110 z-10 ${isWatched
 ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-md shadow-emerald-950/30"
 : "glass-badge text-muted-foreground hover:text-foreground"}`}
 >
 {isWatched ? (
 <Check className="h-3.5 w-3.5 stroke-[2.5]" />
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
 className={`glass-scroll-btn absolute top-[40%] z-20 flex w-10 h-10 items-center justify-center rounded-full -translate-y-1/2 right-2 sm:-right-4 transition-all duration-300 shadow-lg ${canScrollEpRight ? "opacity-0 group-hover/episodes:opacity-100 scale-100" : "opacity-0 pointer-events-none scale-90"}`}
 aria-label="Scroll right"
 >
 <ChevronRight className="h-5 w-5" />
 </button>
 </div>
 )}

 {!hasEpisodes && (
 <div className="rounded-xl px-4 py-6 text-center glass-inset">
 <p className="text-xs text-muted-foreground">No episode details available for this season.</p>
 </div>
 )}
 </div>
 )}

 </section>
 )
};

// ── EpisodeModal ──────────────────────────────────────────────────
