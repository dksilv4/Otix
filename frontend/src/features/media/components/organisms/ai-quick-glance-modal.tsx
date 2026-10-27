import { useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Star,
  Play,
  Clapperboard,
  Sparkles,
  Clock,
  Calendar,
  X,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { mediaQueries } from '../../queries/media-queries'
import { useStreamAvailability } from '../../hooks/use-stream-availability'
import { useQuickStream } from '../../hooks/use-quick-stream'
import { useModal } from '@/lib/modals/modal-context'
import {
  formatMediaRuntime,
  getCertification,
  generateAiHighlights,
} from '../../utils/ai-glance'
import { heroBackdrop } from '@/features/discover/utils/trailer'
import { TrailerVideoModal } from '@/features/discover/components/molecules/trailer-video-modal'

export interface AiQuickGlanceModalProps {
  mediaType: string
  mediaId: string
  initialTitle?: string
  initialPosterUrl?: string | null
  initialBackdropUrl?: string | null
  initialTmdbId?: string | null
  isExiting?: boolean
  onClose?: () => void
}

export const AiQuickGlanceModal = ({
  mediaType,
  mediaId,
  initialTitle,
  initialPosterUrl,
  initialBackdropUrl,
  initialTmdbId,
  isExiting,
  onClose,
}: AiQuickGlanceModalProps) => {
  const navigate = useNavigate()
  const { openModal } = useModal()

  const { data: detail, isLoading } = useQuery({
    ...mediaQueries.detail(mediaType, mediaId),
    staleTime: 5 * 60 * 1000,
  })

  const effectiveTitle = detail?.title || initialTitle || 'Media Preview'
  const effectiveTmdbId = detail?.tmdbId || initialTmdbId
  const effectivePosterUrl = detail?.posterUrl || initialPosterUrl
  const effectiveBackdropUrl = detail?.backdropUrl || initialBackdropUrl

  const { isStreamable, providerLabel } = useStreamAvailability({
    mediaId,
    tmdbId: effectiveTmdbId,
    mediaType,
  })

  const { quickStream, isStartingStream } = useQuickStream()

  const releaseYear = detail?.releaseDate
    ? detail.releaseDate.slice(0, 4)
    : undefined
  const certification = getCertification(detail?.releases)
  const runtime =
    mediaType === 'movie'
      ? formatMediaRuntime(detail?.movie?.runtime)
      : detail?.show?.numberOfSeasons
      ? `${detail.show.numberOfSeasons} ${detail.show.numberOfSeasons === 1 ? 'Season' : 'Seasons'}`
      : null
  const rating = detail?.overallRating || detail?.avgRating
  const aiHighlights = generateAiHighlights(detail?.genres || [], detail?.description)

  // Find trailer YouTube ID if available
  const trailerVideo = detail?.videos?.find(
    (v) =>
      v.videoType === 'trailer' ||
      v.videoType === 'teaser' ||
      (v.provider === 'youtube' && Boolean(v.providerId)),
  )
  const youtubeId = detail?.youtubeVideoId || trailerVideo?.providerId

  const handleStreamClick = useCallback(() => {
    quickStream({
      mediaId,
      tmdbId: effectiveTmdbId,
      mediaType,
      title: effectiveTitle,
    })
    if (onClose) onClose()
  }, [effectiveTitle, effectiveTmdbId, mediaId, mediaType, onClose, quickStream])

  const handleTrailerClick = useCallback(() => {
    if (!youtubeId) return
    openModal(
      <TrailerVideoModal
        youtubeId={youtubeId}
        title={effectiveTitle}
        onClose={() => {}}
      />,
    )
  }, [effectiveTitle, openModal, youtubeId])

  const handleNavigateDetail = useCallback(() => {
    if (onClose) onClose()
    navigate({
      to: '/media/$mediaType/$mediaId',
      params: { mediaType, mediaId },
    })
  }, [mediaId, mediaType, navigate, onClose])

  const topCast = detail?.credits?.slice(0, 6) || []
  const directorCredit = detail?.credits?.find(
    (c) =>
      c.role.toLowerCase().includes('director') ||
      c.role.toLowerCase().includes('creator') ||
      c.role.toLowerCase().includes('directing'),
  )

  const isVisible = !isExiting

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md border-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: isVisible ? 1 : 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >
        <motion.div
          className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl shadow-2xl overflow-hidden border-0 text-left select-none"
          initial={{ scale: 0.94, opacity: 0, y: 16 }}
          animate={{ scale: isVisible ? 1 : 0.94, opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 16 }}
          exit={{ scale: 0.94, opacity: 0, y: 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Hero Art with Gradient Scrim */}
          <div className="relative w-full h-48 sm:h-56 bg-zinc-950 overflow-hidden shrink-0">
            {effectiveBackdropUrl ? (
              <img
                src={heroBackdrop(effectiveBackdropUrl)}
                alt={effectiveTitle}
                className="w-full h-full object-cover object-center filter brightness-[0.65]"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-zinc-900 to-zinc-950" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--dk-surface-glass)] via-transparent to-black/60 pointer-events-none" />

            {/* AI Sparkle Badge */}
            <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/20 backdrop-blur-xl border-0 shadow-lg text-primary text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              <span>AI Quick Glance</span>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 hover:bg-white/15 text-muted-foreground hover:text-primary-foreground backdrop-blur-xl shadow-lg transition-all border-0"
              aria-label="Close"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Poster & Header Capsule layered at bottom of hero */}
            <div className="absolute bottom-3 left-4 right-4 z-20 flex items-end gap-3 sm:gap-4">
              {effectivePosterUrl && (
                <img
                  src={effectivePosterUrl}
                  alt={effectiveTitle}
                  className="w-16 sm:w-20 aspect-[2/3] rounded-2xl shadow-2xl object-cover shrink-0 ring-1 ring-white/10"
                />
              )}
              <div className="min-w-0 flex-1 pb-1">
                <h3 className="text-lg sm:text-xl font-bold text-primary-foreground truncate drop-shadow-md">
                  {effectiveTitle}
                </h3>
                {directorCredit && (
                  <p className="text-xs text-muted-foreground truncate">
                    Directed by <span className="text-primary-foreground font-medium">{directorCredit.person.name}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Scrollable Body Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* Metadata Pills Row */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {releaseYear && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 text-muted-foreground font-medium">
                  <Calendar className="h-3 w-3" />
                  <span>{releaseYear}</span>
                </div>
              )}
              {certification && (
                <span className="px-2 py-0.5 rounded-full bg-white/10 font-bold text-[10px] tracking-wide text-primary-foreground uppercase">
                  {certification}
                </span>
              )}
              {runtime && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 text-muted-foreground font-medium">
                  <Clock className="h-3 w-3" />
                  <span>{runtime}</span>
                </div>
              )}
              {rating != null && rating > 0 && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/20 text-primary font-bold">
                  <Star className="h-3 w-3 fill-current" />
                  <span>{rating.toFixed(1)}</span>
                </div>
              )}
              {detail?.genres?.map((g) => (
                <span
                  key={g.id}
                  className="px-2.5 py-1 rounded-full bg-white/5 text-muted-foreground font-medium"
                >
                  {g.name}
                </span>
              ))}
            </div>

            {/* AI Highlights Theme Badges */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" />
                Smart Highlights
              </span>
              <div className="flex flex-wrap gap-1.5">
                {aiHighlights.map((hl) => (
                  <span
                    key={hl}
                    className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium"
                  >
                    {hl}
                  </span>
                ))}
              </div>
            </div>

            {/* Synopsis / Description */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                Storyline
              </span>
              <p className="text-xs sm:text-sm text-primary-foreground/90 leading-relaxed line-clamp-3">
                {detail?.description || detail?.synopsis || (isLoading ? 'Hydrating synopsis...' : 'No synopsis available for this media item.')}
              </p>
            </div>

            {/* Top Cast Reel */}
            {topCast.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  Top Cast
                </span>
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                  {topCast.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 shrink-0 bg-white/5 rounded-2xl p-1.5 pr-3">
                      {c.person.photoUrl ? (
                        <img
                          src={c.person.photoUrl}
                          alt={c.person.name}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-muted-foreground text-xs font-bold">
                          {c.person.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-primary-foreground truncate max-w-[100px]">
                          {c.person.name}
                        </p>
                        {c.characterName && (
                          <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                            {c.characterName}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Footer Pod */}
          <div className="p-4 sm:p-5 bg-[var(--dk-surface-glass)] backdrop-blur-xl border-t border-white/[0.04] flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={handleNavigateDetail}
              className="text-xs font-medium text-muted-foreground hover:text-primary-foreground transition-colors flex items-center gap-1.5"
            >
              <span>View Full Details</span>
              <ExternalLink className="h-3 w-3" />
            </button>

            <div className="flex items-center gap-2">
              {youtubeId && (
                <button
                  type="button"
                  onClick={handleTrailerClick}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-primary-foreground font-semibold text-xs transition-all active:scale-95 border-0 shadow-sm"
                >
                  <Clapperboard className="h-3.5 w-3.5" />
                  <span>Trailer</span>
                </button>
              )}

              {isStreamable && (
                <button
                  type="button"
                  onClick={handleStreamClick}
                  disabled={isStartingStream}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition-all active:scale-95 border-0 shadow-md shadow-primary/20"
                >
                  {isStartingStream ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current" />
                  )}
                  <span>Stream {providerLabel ? `(${providerLabel})` : ''}</span>
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
