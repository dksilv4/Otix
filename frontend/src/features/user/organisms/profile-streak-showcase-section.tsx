import { Flame, PenLine } from 'lucide-react'

interface StreakShowcaseProps {
  loginStreak: number
  longestLoginStreak: number
  reviewStreak: number
  longestReviewStreak: number
}

const MILESTONES_LOGIN = [7, 14, 30, 60, 100, 365]
const MILESTONES_REVIEW = [4, 8, 12, 26, 52]

function nextMilestone(current: number, milestones: number[]): number {
  for (const m of milestones) {
    if (current < m) return m
  }
  return current + 1
}

export function StreakShowcaseSection({
  loginStreak,
  longestLoginStreak,
  reviewStreak,
  longestReviewStreak,
}: StreakShowcaseProps) {
  if (loginStreak === 0 && reviewStreak === 0) return null

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Flame className="h-4 w-4 text-muted-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Streaks</h2>
      </div>

      <div className="flex gap-3">
        <StreakPill
          icon={<Flame className="h-4 w-4" />}
          iconColor="#f59e0b"
          value={loginStreak}
          unit="day"
          best={longestLoginStreak}
          milestone={nextMilestone(loginStreak, MILESTONES_LOGIN)}
        />
        <StreakPill
          icon={<PenLine className="h-4 w-4" />}
          iconColor="#a78bfa"
          value={reviewStreak}
          unit="week"
          best={longestReviewStreak}
          milestone={nextMilestone(reviewStreak, MILESTONES_REVIEW)}
        />
      </div>
    </section>
  )
}

function StreakPill({
  icon,
  iconColor,
  value,
  unit,
  best,
  milestone,
}: {
  icon: React.ReactNode
  iconColor: string
  value: number
  unit: string
  best: number
  milestone: number
}) {
  const progress = Math.min(1, value / milestone)

  return (
    <div className="flex-1 rounded-2xl bg-[var(--dk-surface-base)] p-4 shadow-[var(--dk-shadow-sm)]">
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: iconColor }}>{icon}</span>
        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">{unit}s</span>
      </div>
      <p className="text-2xl font-bold tabular-nums" style={{ color: iconColor }}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground/40 mt-0.5">best: {best}</p>

      {/* Progress bar to next milestone */}
      <div className="mt-3 h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: iconColor,
          }}
        />
      </div>
      <p className="text-[9px] text-muted-foreground/30 mt-1">
        {milestone - value} to {milestone} {unit}s
      </p>
    </div>
  )
}
