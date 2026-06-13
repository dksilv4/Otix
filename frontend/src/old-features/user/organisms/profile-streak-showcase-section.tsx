// TODO: Review this file
import { Flame, PenLine } from 'lucide-react'
import './profile-streak-showcase-section.scss'

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
      <div className="dk-user-streaks__header">
        <Flame className="h-4 w-4 text-muted-foreground/60" />
        <h2 className="dk-user-streaks__heading">Streaks</h2>
      </div>

      <div className="dk-user-streaks__pills">
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
    <div className="dk-user-streaks__pill">
      <div className="dk-user-streaks__pill-header">
        <span style={{ color: iconColor }}>{icon}</span>
        <span className="dk-user-streaks__pill-unit">{unit}s</span>
      </div>
      <p className="dk-user-streaks__pill-value" style={{ color: iconColor }}>
        {value}
      </p>
      <p className="dk-user-streaks__pill-best">best: {best}</p>

      {/* Progress bar to next milestone */}
      <div className="dk-user-streaks__pill-bar">
        <div
          className="dk-user-streaks__pill-bar-fill"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: iconColor,
          }}
        />
      </div>
      <p className="dk-user-streaks__pill-next">
        {milestone - value} to {milestone} {unit}s
      </p>
    </div>
  )
}
