import { useState, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { InteractiveStar } from "../atoms/interactive-star"
import "./star-input.scss"

interface StarInputProps {
  value: number | null
  onChange: (score: number) => void
  size?: "sm" | "md" | "lg"
  disabled?: boolean
  className?: string
}

const StarInput = ({ value, onChange, size = "md", disabled = false, className }: StarInputProps) => {
  const [hoveredScore, setHoveredScore] = useState(0)
  const [isHolding, setIsHolding] = useState(false)
  const [tooltipScore, setTooltipScore] = useState(0)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdScoreRef = useRef(0)
  const pointerActiveRef = useRef(false)

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }, [])

  const handlePointerDown = useCallback((score: number) => {
    if (disabled) return
    pointerActiveRef.current = true
    holdScoreRef.current = score
    setHoveredScore(score)
    clearHoldTimer()
    holdTimerRef.current = setTimeout(() => {
      setIsHolding(true)
      setTooltipScore(score)
      try { navigator.vibrate?.(10) } catch { /* not supported */ }
    }, 300)
  }, [disabled, clearHoldTimer])

  const handlePointerEnter = useCallback((score: number) => {
    if (disabled) return
    if (pointerActiveRef.current) {
      holdScoreRef.current = score
      setTooltipScore(score)
      setHoveredScore(score)
      try { navigator.vibrate?.(10) } catch { /* not supported */ }
    } else {
      setHoveredScore(score)
    }
  }, [disabled])

  const handlePointerMove = useCallback((score: number) => {
    if (disabled) return
    if (pointerActiveRef.current) {
      holdScoreRef.current = score
      setTooltipScore(score)
      setHoveredScore(score)
    }
  }, [disabled])

  const handlePointerUp = useCallback(() => {
    if (disabled) return
    pointerActiveRef.current = false
    clearHoldTimer()

    if (isHolding) {
      onChange(holdScoreRef.current)
    } else {
      const tappedScore = holdScoreRef.current || hoveredScore
      if (tappedScore > 0) {
        onChange(value === tappedScore ? 0 : tappedScore)
      }
    }

    setIsHolding(false)
    setTooltipScore(0)
    setHoveredScore(0)
  }, [disabled, isHolding, hoveredScore, onChange, value, clearHoldTimer])

  const handlePointerLeave = useCallback(() => {
    if (!pointerActiveRef.current) {
      setHoveredScore(0)
    }
  }, [])

  const currentScore = value ?? 0
  const displayScore = isHolding ? tooltipScore : (hoveredScore || currentScore)
  const label = isHolding
    ? `${tooltipScore}/10`
    : currentScore > 0
      ? `${currentScore}/10`
      : hoveredScore > 0
        ? `${hoveredScore}/10`
        : null

  return (
    <div
      className={cn(
        "dk-review-star-input",
        disabled && "dk-review-star-input--disabled",
        className,
      )}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      {isHolding && (
        <div className="dk-review-star-input__tooltip">
          {tooltipScore}/10
          <div className="dk-review-star-input__tooltip-arrow" />
        </div>
      )}

      <div className="dk-review-star-input__stars">
        {[0, 1, 2, 3, 4].map((i) => (
          <InteractiveStar
            key={i}
            starIndex={i}
            currentScore={currentScore}
            hoveredScore={isHolding ? tooltipScore : hoveredScore}
            onPointerDown={handlePointerDown}
            onPointerEnter={handlePointerEnter}
            onPointerMove={handlePointerMove}
            size={size}
          />
        ))}
      </div>

      {label && (
        <span
          className={cn(
            "dk-review-star-input__label",
            displayScore >= 8
              ? "dk-review-star-input__label--high"
              : displayScore >= 6
                ? "dk-review-star-input__label--medium"
                : displayScore >= 4
                  ? "dk-review-star-input__label--low"
                  : displayScore > 0
                    ? "dk-review-star-input__label--critical"
                    : "dk-review-star-input__label--muted",
          )}
        >
          {label}
        </span>
      )}
      {!label && (
        <span className="dk-review-star-input__placeholder" aria-hidden>
          0/10
        </span>
      )}
    </div>
  )
};

export { StarInput }
