import { Flame } from 'lucide-react'

interface StreakDisplayProps {
  loginStreak: number
  longestLoginStreak: number
  reviewStreak: number
  longestReviewStreak: number
}

export function StreakDisplay({
  loginStreak,
  longestLoginStreak,
  reviewStreak,
  longestReviewStreak,
}: StreakDisplayProps) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="inline-flex items-center gap-1 text-amber-400" title={`${longestLoginStreak}-day best`}>
        <Flame className="h-3.5 w-3.5" />
        {loginStreak}d
      </span>
      <span aria-hidden className="text-white/10">·</span>
      <span className="inline-flex items-center gap-1 text-purple-400/80" title={`${longestReviewStreak}-week best`}>
        <Flame className="h-3.5 w-3.5" />
        {reviewStreak}w
      </span>
    </div>
  )
}
