import { useState } from "react"
import { Link, useLocation } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Star, Pencil } from "lucide-react"
import { useAuth } from "@/features/auth"
import { DkButton } from "@/features/dk-ui/atoms/button"
import { DkDialog } from "@/features/dk-ui/molecules/dialog"
import { ReviewComposer } from "../molecules/review-composer"
import { reviewQueries, type ReviewOut } from "../review-queries"
import { cn } from "@/lib/utils"

interface ReviewSectionProps {
  mediaId: string
  className?: string
}

function scoreColor(score: number): { text: string; glow: string; bg: string } {
  if (score >= 8) return { text: "text-emerald-400", glow: "from-emerald-500/15", bg: "bg-emerald-400/10" }
  if (score >= 6) return { text: "text-sky-400", glow: "from-sky-500/15", bg: "bg-sky-400/10" }
  if (score >= 4) return { text: "text-amber-400", glow: "from-amber-500/15", bg: "bg-amber-400/10" }
  return { text: "text-red-400", glow: "from-red-500/15", bg: "bg-red-400/10" }
}

function StarRow({ count, filled, size = "md" }: { count: number; filled: number; size?: "sm" | "md" }) {
  const dims = size === "md" ? "w-6 h-6" : "w-4 h-4"
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: count }).map((_, i) => {
        const fill = Math.min(1, Math.max(0, filled - i))
        return (
          <span key={i} className="relative inline-block">
            <Star className={cn(dims, "text-white/[0.08]")} fill="currentColor" />
            {fill > 0 && (
              <Star
                className={cn(dims, "absolute inset-0 text-amber-400")}
                fill="currentColor"
                style={{
                  clipPath: fill === 1 ? undefined : `inset(0 ${(1 - fill) * 100}% 0 0)`,
                }}
              />
            )}
          </span>
        )
      })}
    </div>
  )
}

function ReviewSection({ mediaId, className }: ReviewSectionProps) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const [composerOpen, setComposerOpen] = useState(false)
  const { data: myReview, isLoading, isError, refetch } = useQuery(reviewQueries.myReview(mediaId))

  if (!isAuthenticated) {
    return (
      <section className={cn(className)}>
        <h2 className="text-lg font-semibold mb-3">Your Rating</h2>
        <div className="rounded-3xl border border-white/[0.06] bg-[var(--dk-surface-base)] p-6 text-center">
          <p className="text-sm text-muted-foreground">
            <Link to="/auth/login" search={{ redirect: location.href }} className="font-medium text-primary hover:underline">
              Sign in
            </Link>
            {" "}to rate and review this title.
          </p>
        </div>
      </section>
    )
  }

  if (isLoading) {
    return (
      <section className={cn(className)}>
        <h2 className="text-lg font-semibold mb-3">Your Rating</h2>
        <div className="rounded-3xl border border-white/[0.06] bg-[var(--dk-surface-base)] p-8">
          <div className="flex flex-col items-center gap-4">
            <div className="h-7 w-48 animate-pulse rounded-full bg-[var(--dk-surface-glass)]" />
            <div className="h-10 w-28 animate-pulse rounded-full bg-[var(--dk-surface-glass)]" />
          </div>
        </div>
      </section>
    )
  }

  if (isError) {
    return (
      <section className={cn(className)}>
        <h2 className="text-lg font-semibold mb-3">Your Rating</h2>
        <div className="rounded-3xl border border-white/[0.06] bg-[var(--dk-surface-base)] p-8 text-center">
          <p className="text-sm text-muted-foreground mb-3">Failed to load your review.</p>
          <DkButton variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </DkButton>
        </div>
      </section>
    )
  }

  const review = (myReview ?? null) as ReviewOut | null

  return (
    <section className={cn(className)}>
      <h2 className="text-lg font-semibold mb-3">Your Rating</h2>

      {review ? (
        /* ── Rated state — big show-off display ── */
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[var(--dk-surface-base)]">
          {/* Score-colored ambient glow */}
          <div
            className={cn(
              "absolute inset-0 opacity-40 pointer-events-none bg-[radial-gradient(circle_at_30%_50%,var(--tw-gradient-from),transparent_70%)]",
              scoreColor(review.score ?? 0).glow,
            )}
          />

          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
              {/* Big score display */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <span
                  className={cn(
                    "text-5xl sm:text-6xl font-extrabold tabular-nums tracking-tight",
                    scoreColor(review.score ?? 0).text,
                  )}
                  style={{ fontFamily: "var(--dk-font-mono)" }}
                >
                  {review.score}
                </span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                  out of 10
                </span>
              </div>

              {/* Stars + content */}
              <div className="flex flex-col items-center sm:items-start gap-3 min-w-0">
                <StarRow count={5} filled={(review.score ?? 0) / 2} size="md" />

                {review.title && (
                  <p className="text-base font-semibold text-center sm:text-left">
                    {review.title}
                  </p>
                )}

                {review.content && (
                  <p className="text-sm text-muted-foreground text-center sm:text-left leading-relaxed line-clamp-3">
                    {review.content}
                  </p>
                )}

                {review.isPrivate && (
                  <span className="text-[10px] font-medium text-muted-foreground bg-muted-foreground/10 px-2 py-0.5 rounded-full">
                    Private
                  </span>
                )}

                <DkButton
                  variant="outline"
                  size="sm"
                  onClick={() => setComposerOpen(true)}
                  className="mt-1"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Review
                </DkButton>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Unrated state — inviting prompt ── */
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[var(--dk-surface-base)]">
          {/* Subtle neutral ambient glow */}
          <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,var(--primary),transparent_70%)]" />

          <div className="relative p-6 sm:p-8 flex flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-2">
              <StarRow count={5} filled={0} size="md" />
              <p className="text-sm text-muted-foreground">How would you rate this?</p>
            </div>

            <DkButton
              variant="primary"
              size="md"
              onClick={() => setComposerOpen(true)}
            >
              <Star className="w-4 h-4" />
              Rate &amp; Review
            </DkButton>
          </div>
        </div>
      )}

      <DkDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        title={review ? "Edit Your Review" : "Rate & Review"}
      >
        <ReviewComposer
          mediaId={mediaId}
          existingReview={review}
          onClose={() => setComposerOpen(false)}
        />
      </DkDialog>
    </section>
  )
}

export { ReviewSection }
