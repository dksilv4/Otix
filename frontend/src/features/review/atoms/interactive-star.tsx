// TODO: Review this file
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import "./interactive-star.scss"

interface InteractiveStarProps {
  starIndex: number       // 0-4
  currentScore: number    // current committed score (0-10)
  hoveredScore: number    // hovered/pressed score (0-10, 0 when idle)
  onPointerDown: (score: number) => void
  onPointerEnter: (score: number) => void
  onPointerMove: (score: number) => void
  size?: "sm" | "md" | "lg"
}

const sizeMap = {
  sm: "w-5 h-5",
  md: "w-7 h-7",
  lg: "w-9 h-9",
}

const InteractiveStar = ({
  starIndex,
  currentScore,
  hoveredScore,
  onPointerDown,
  onPointerEnter,
  onPointerMove,
  size = "md",
}: InteractiveStarProps) => {
  const iconSize = sizeMap[size]
  const activeScore = hoveredScore || currentScore

  // starIndex 0 covers scores 1-2, starIndex 1 covers 3-4, etc.
  const starMin = starIndex * 2
  const fill = Math.min(1, Math.max(0, (activeScore - starMin) / 2))

  const halfScore = starMin + 1  // e.g. star 0 → score 1
  const fullScore = starMin + 2  // e.g. star 0 → score 2

  return (
    <span className="dk-review-interactive-star">
      {/* Background empty star */}
      <Star className={cn(iconSize, "text-muted-foreground/25")} fill="currentColor" />

      {/* Left half hit area */}
      <span
        className="dk-review-interactive-star__hit--left"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => { e.preventDefault(); onPointerDown(halfScore) }}
        onPointerEnter={(e) => { e.preventDefault(); onPointerEnter(halfScore) }}
        onPointerMove={(e) => { e.preventDefault(); onPointerMove(halfScore) }}
      />

      {/* Right half hit area */}
      <span
        className="dk-review-interactive-star__hit--right"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => { e.preventDefault(); onPointerDown(fullScore) }}
        onPointerEnter={(e) => { e.preventDefault(); onPointerEnter(fullScore) }}
        onPointerMove={(e) => { e.preventDefault(); onPointerMove(fullScore) }}
      />

      {/* Filled overlay */}
      {fill > 0 && (
        <Star
          className={cn(iconSize, "absolute inset-0 text-amber-500 dark:text-amber-400 pointer-events-none")}
          fill="currentColor"
          style={{
            clipPath:
              fill <= 0.25
                ? `inset(0 ${(1 - fill) * 100}% 0 0)`
                : fill < 1
                  ? `inset(0 ${(1 - fill) * 100}% 0 0)`
                  : undefined,
          }}
        />
      )}
    </span>
  )
};

export { InteractiveStar }
