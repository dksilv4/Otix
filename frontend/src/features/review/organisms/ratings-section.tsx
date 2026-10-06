import "./ratings-section.scss"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

interface RatingsSectionProps {
  overallRating?: number | null
  overallRatingSource?: string | null
  avgRating?: number | null
  ratingCount?: number
  className?: string
}

import { ratingsScoreColor as scoreColor } from "../utils"

const StarRow = ({ count, filled }: { count: number; filled: number }) => {
  return (
    <div className="dk-review-ratings__stars">
      {Array.from({ length: count }).map((_, i) => {
        const fill = Math.min(1, Math.max(0, filled - i))
        return (
          <span key={i} className="dk-review-ratings__star">
            <Star className="w-5 h-5 text-white/[0.06]" fill="currentColor" />
            {fill > 0 && (
              <Star
                className="w-5 h-5 absolute inset-0 text-amber-400"
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
};

const RatingsSection = ({ overallRating, overallRatingSource, ratingCount, className }: RatingsSectionProps) => {
  const hasRating = overallRating != null
  const rating = overallRating ?? 0
  const colors = hasRating
    ? scoreColor(rating)
    : { scoreClass: "dk-review-ratings__score--muted", glowClass: "dk-review-ratings__glow--muted" }

  let subtitle: string
  if (!hasRating) {
    subtitle = "No ratings yet"
  } else if (overallRatingSource === "community" && ratingCount != null && ratingCount > 0) {
    subtitle = `Based on ${ratingCount.toLocaleString()} ${ratingCount === 1 ? "rating" : "ratings"}`
  } else if (overallRatingSource === "external") {
    subtitle = "Estimated from external sources"
  } else {
    subtitle = "No ratings yet"
  }

  return (
    <section className={cn(className)}>
      <div className="dk-review-ratings__inner">
        {/* ── Overall Otix Rating ── */}
        <div className="glass-inset relative overflow-hidden rounded-3xl w-full">
          {/* Ambient glow */}
          <div
            className={cn(
              "dk-review-ratings__glow",
              colors.glowClass,
            )}
          />

          <div className="dk-review-ratings__body">
            <div className="dk-review-ratings__row">
              {/* Big score */}
              <div className="dk-review-ratings__score-section">
                <span
                  className={cn(
                    "dk-review-ratings__score",
                    colors.scoreClass,
                  )}
                >
                  {hasRating ? rating.toFixed(0) : "—"}
                </span>
                <span className="dk-review-ratings__score-label">
                  out of 100
                </span>
              </div>

              {/* Stars + meta */}
              <div className="dk-review-ratings__meta">
                <StarRow count={5} filled={hasRating ? rating / 20 : 0} />

                <div className="dk-review-ratings__meta-text">
                  <span className="dk-review-ratings__label">Otix Rating</span>
                  <span className="dk-review-ratings__count">
                    {subtitle}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
};

export { RatingsSection }
