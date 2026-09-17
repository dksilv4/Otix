import { useState } from 'react'
import { Star, Pencil, Award, Sparkles, ExternalLink, LogIn } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@auth/hooks/use-auth'
import { useModal } from '@/lib/modals'
import { DkDialog } from '@ui/molecules/dialog'
import { ReviewComposer } from '@/features/review/molecules/review-composer'
import { reviewQueries, type ReviewOut } from '@/features/review/review-queries'
import { ratingQueries, useUpsertRating, type MediaRatingOut } from '@/features/review/rating-queries'
import { showXPToast } from '@ui/atoms/xp-toast'
import { cn } from '@/lib/utils'

interface RatingsHubProps {
  mediaId: string
  mediaType: string
  overallRating?: number | null
  overallRatingSource?: string | null
  avgRating?: number | null
  ratingCount?: number
  tmdbId?: string | number | null
  imdbId?: string | null
  className?: string
}


function scoreColor(score: number) {
  if (score >= 80) return { text: 'text-emerald-400', bg: 'bg-emerald-400/10', ring: 'ring-emerald-400/30', glow: 'shadow-[0_0_24px_rgba(52,211,153,0.18)]' }
  if (score >= 60) return { text: 'text-sky-400', bg: 'bg-sky-400/10', ring: 'ring-sky-400/30', glow: 'shadow-[0_0_24px_rgba(56,189,248,0.18)]' }
  if (score >= 40) return { text: 'text-amber-400', bg: 'bg-amber-400/10', ring: 'ring-amber-400/30', glow: 'shadow-[0_0_24px_rgba(251,191,36,0.18)]' }
  return { text: 'text-red-400', bg: 'bg-red-400/10', ring: 'ring-red-400/30', glow: 'shadow-[0_0_24px_rgba(248,113,113,0.18)]' }
}

const SCORE_LABELS: Record<number, string> = {
  1: '0.5 ★ Appalling',
  2: '1.0 ★ Terrible',
  3: '1.5 ★ Very Bad',
  4: '2.0 ★ Poor',
  5: '2.5 ★ Average',
  6: '3.0 ★ Decent',
  7: '3.5 ★ Good',
  8: '4.0 ★ Great',
  9: '4.5 ★ Superb',
  10: '5.0 ★ Masterpiece',
}

export function RatingsHub({
  mediaId,
  mediaType,
  overallRating,
  overallRatingSource,
  avgRating,
  ratingCount,
  tmdbId,
  imdbId,
  className = '',
}: RatingsHubProps) {
  const { isAuthenticated } = useAuth()
  const { openModal } = useModal()
  const [hoverRating, setHoverRating] = useState<number | null>(null)

  const myReviewQuery = useQuery({
    ...reviewQueries.myReview(mediaType, mediaId),
    enabled: isAuthenticated,
  })
  const myRatingQuery = useQuery({
    ...ratingQueries.myRating(mediaType, mediaId),
    enabled: isAuthenticated,
  })
  const upsertRating = useUpsertRating(mediaType, mediaId)

  const review = (myReviewQuery.data ?? null) as ReviewOut | null
  const rating = (myRatingQuery.data ?? null) as MediaRatingOut | null
  const userScore = rating?.score ?? null
  const hasRatingOrReview = Boolean(rating || review)

  const hasOverall = overallRating != null
  const score = overallRating ?? 0
  const colors = hasOverall
    ? scoreColor(score)
    : { text: 'text-muted-foreground', bg: 'bg-white/5', ring: 'ring-white/10', glow: '' }

  let subtitle = 'No ratings yet'
  if (hasOverall) {
    if (overallRatingSource === 'community' && ratingCount != null && ratingCount > 0) {
      subtitle = `${ratingCount.toLocaleString()} user ${ratingCount === 1 ? 'rating' : 'ratings'}`
    } else if (overallRatingSource === 'external') {
      subtitle = 'Aggregated score'
    } else if (ratingCount != null && ratingCount > 0) {
      subtitle = `${ratingCount} community ${ratingCount === 1 ? 'review' : 'reviews'}`
    } else {
      subtitle = 'Verified Otix score'
    }
  }

  const handleRateQuick = (val: number) => {
    if (!isAuthenticated) return
    upsertRating.mutate(val)
    showXPToast(20)
  }

  const handleOpenComposer = () => {
    const close = openModal(
      <DkDialog
        open={true}
        onOpenChange={() => close()}
        title={hasRatingOrReview ? 'Edit Your Review' : 'Rate & Review'}
      >
        <ReviewComposer
          mediaType={mediaType}
          mediaId={mediaId}
          existingReview={review}
          existingRating={rating}
          onClose={() => close()}
        />
      </DkDialog>,
    )
  }

  const tmdbUrl = tmdbId
    ? `https://www.themoviedb.org/${mediaType === 'show' ? 'tv' : 'movie'}/${tmdbId}`
    : null
  const imdbUrl = imdbId ? `https://www.imdb.com/title/${imdbId}` : null

  const activeDisplayScore = hoverRating ?? userScore
  const activeLabel = activeDisplayScore ? SCORE_LABELS[activeDisplayScore] : null

  return (
    <div className={`glass-card p-5 sm:p-6 space-y-4 ${className}`}>
      {/* ── Community Rating & Multi-Source Badges ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight">Ratings &amp; Scores</h3>
          </div>

          <div className="flex items-center gap-1.5">
            {imdbUrl && (
              <a
                href={imdbUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-0.5 rounded-md bg-[#f5c518]/15 text-[#f5c518] hover:bg-[#f5c518]/25 text-[10px] font-bold tracking-wider transition-colors inline-flex items-center gap-1 border border-[#f5c518]/20"
                title="View on IMDb"
              >
                IMDb
                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
              </a>
            )}
          </div>
        </div>

        {/* Primary Otix Score Banner */}
        <div className="glass-inset p-3.5 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={cn(
                'flex h-13 w-13 shrink-0 flex-col items-center justify-center rounded-xl font-black ring-1 transition-all',
                colors.bg,
                colors.text,
                colors.ring,
                colors.glow,
              )}
            >
              <span className="text-2xl leading-none tracking-tight">
                {hasOverall ? Math.round(score) : '—'}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-60 mt-0.5">
                / 100
              </span>
            </div>

            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">Otix Community</span>
                {avgRating && (
                  <span className="text-[11px] text-amber-400 font-medium">({(avgRating / 2).toFixed(1)}/5 ★)</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 5-Star Rating Block with Half-Star Support ── */}
      <div className="border-t border-white/[0.06] pt-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your Rating
          </span>
          {isAuthenticated && userScore != null && (
            <button
              type="button"
              onClick={() => handleRateQuick(0)}
              className="text-[11px] text-muted-foreground/70 hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {isAuthenticated ? (
          <div className="glass-inset p-4 rounded-2xl flex flex-col items-center justify-center text-center space-y-2.5">
            {/* Centered 5-Star Half-Star Interactive Array */}
            <div
              className="flex items-center justify-center gap-1.5"
              onMouseLeave={() => setHoverRating(null)}
            >
              {[0, 1, 2, 3, 4].map((starIdx) => {
                const halfVal = starIdx * 2 + 1 // 1, 3, 5, 7, 9
                const fullVal = starIdx * 2 + 2 // 2, 4, 6, 8, 10
                const activeVal = hoverRating ?? userScore ?? 0
                const isFull = activeVal >= fullVal
                const isHalf = !isFull && activeVal >= halfVal

                return (
                  <div key={starIdx} className="relative flex items-center justify-center w-8 h-8 select-none">
                    {/* Base dimmed empty star */}
                    <Star
                      className="w-6 h-6 text-zinc-700/60 fill-zinc-800/40 transition-colors"
                      strokeWidth={1.5}
                    />

                    {/* Left half hit target (0.5 star) */}
                    <button
                      type="button"
                      onMouseEnter={() => setHoverRating(halfVal)}
                      onClick={() => handleRateQuick(halfVal)}
                      className="absolute inset-y-0 left-0 w-1/2 z-10 focus:outline-none cursor-pointer"
                      title={`Rate ${(halfVal / 2).toFixed(1)} / 5`}
                      aria-label={`Rate ${(halfVal / 2).toFixed(1)} out of 5 stars`}
                    />

                    {/* Right half hit target (1.0 star) */}
                    <button
                      type="button"
                      onMouseEnter={() => setHoverRating(fullVal)}
                      onClick={() => handleRateQuick(fullVal)}
                      className="absolute inset-y-0 right-0 w-1/2 z-10 focus:outline-none cursor-pointer"
                      title={`Rate ${(fullVal / 2).toFixed(0)} / 5`}
                      aria-label={`Rate ${(fullVal / 2).toFixed(0)} out of 5 stars`}
                    />

                    {/* Filled / Half-filled Star Overlay - centered identically */}
                    {(isFull || isHalf) && (
                      <div
                        className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]"
                        style={{
                          clipPath: isHalf ? 'inset(0 50% 0 0)' : undefined,
                        }}
                      >
                        <Star
                          className="w-6 h-6 text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)] transition-transform duration-150"
                          strokeWidth={1.5}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Centered Rating Preview directly beneath the stars */}
            <div className="flex items-center justify-center min-h-[24px]">
              {activeDisplayScore != null && activeDisplayScore > 0 ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/25 text-xs font-semibold text-amber-400 animate-fade-in">
                  <span>
                    {(activeDisplayScore / 2).toFixed(activeDisplayScore % 2 === 0 ? 0 : 1)} / 5 ★
                  </span>
                  {activeLabel && (
                    <>
                      <span className="opacity-40">•</span>
                      <span className="text-[11px] font-medium text-amber-300/90">{activeLabel}</span>
                    </>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground/60">
                  Tap or hover to rate (0.5 – 5 ★)
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="glass-inset p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Sign in to rate and log your watched media</span>
            <div className="flex items-center gap-1 text-primary font-semibold shrink-0">
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Separate Dedicated Section to Write a Review ── */}
      {isAuthenticated && (
        <div className="border-t border-white/[0.06] pt-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Review
            </span>
            {review && (
              <button
                type="button"
                onClick={handleOpenComposer}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            )}
          </div>

          {review?.content ? (
            <div
              onClick={handleOpenComposer}
              className="glass-inset p-4 rounded-2xl space-y-2 cursor-pointer border border-white/[0.06] hover:border-primary/40 hover:bg-white/[0.05] transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Your Review</span>
                </div>
                <span className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                  Click to edit <Pencil className="h-2.5 w-2.5" />
                </span>
              </div>
              {review.title && (
                <p className="text-xs font-semibold text-foreground line-clamp-1">{review.title}</p>
              )}
              <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                &ldquo;{review.content}&rdquo;
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleOpenComposer}
              className="w-full text-left relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-transparent p-4 transition-all duration-200 hover:border-primary/50 hover:from-primary/[0.08] hover:to-transparent hover:shadow-lg hover:shadow-primary/5 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 transition-all duration-300 group-hover:scale-105 group-hover:bg-primary/20">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                      Write a Review
                      <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">
                        →
                      </span>
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      Share your thoughts and critique with the community
                    </p>
                  </div>
                </div>
                <span className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
                  Write
                </span>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default RatingsHub;