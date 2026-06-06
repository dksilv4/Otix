import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import './star-rating.scss'

interface DkStarRatingProps {
  score: number
  maxScore?: number
  size?: "sm" | "md"
  color?: string
  className?: string
}

function DkStarRating({ score, maxScore = 10, size = "sm", color = "text-amber-400", className }: DkStarRatingProps) {
  const normalized = (score / maxScore) * 5
  const stars = Math.round(normalized * 2) / 2
  const sizeClass = size === "sm" ? "dk-star-rating--sm" : "dk-star-rating--md"

  return (
    <div className={cn("dk-star-rating", sizeClass, className)} aria-label={`Rating: ${score}/${maxScore}`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.min(1, Math.max(0, stars - i))
        return (
          <span key={i} className="dk-star-rating__star">
            <Star className="dk-star-rating__star-bg" fill="currentColor" />
            {fill > 0 && (
              <Star
                className={cn("dk-star-rating__star-fill", color)}
                fill="currentColor"
                style={{ clipPath: fill === 0.5 ? "inset(0 50% 0 0)" : undefined }}
              />
            )}
          </span>
        )
      })}
    </div>
  )
}

export { DkStarRating, DkStarRating as StarRating }
