// TODO: Review this file
import { Flame } from 'lucide-react'
import './streak-display.scss'

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
    <div className="dk-user__streak">
      <span className="dk-user__streak__login" title={`${longestLoginStreak}-day best`}>
        <Flame className="h-3.5 w-3.5" />
        {loginStreak}d
      </span>
      <span aria-hidden className="dk-user__streak__sep">·</span>
      <span className="dk-user__streak__review" title={`${longestReviewStreak}-week best`}>
        <Flame className="h-3.5 w-3.5" />
        {reviewStreak}w
      </span>
    </div>
  )
}
