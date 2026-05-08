import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

interface StarRatingProps {
  score: number
  maxScore?: number
  size?: "sm" | "md"
  color?: string
  className?: string
}

function StarRating({ score, maxScore = 10, size = "sm", color = "text-amber-400", className }: StarRatingProps) {
  const normalized = (score / maxScore) * 5
  const stars = Math.round(normalized * 2) / 2
  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5"

  return (
    <div className={cn("inline-flex items-center gap-0.5", className)} aria-label={`Rating: ${score}/${maxScore}`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.min(1, Math.max(0, stars - i))
        return (
          <span key={i} className="relative">
            <Star className={cn(iconSize, "text-muted-foreground/30")} fill="currentColor" />
            {fill > 0 && (
              <Star
                className={cn(iconSize, "absolute inset-0", color)}
                fill="currentColor"
                style={{
                  clipPath: fill === 0.5 ? "inset(0 50% 0 0)" : undefined,
                }}
              />
            )}
          </span>
        )
      })}
    </div>
  )
}

export { StarRating }
