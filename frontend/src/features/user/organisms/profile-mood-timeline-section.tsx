// TODO: Review this file
import { useQuery } from '@tanstack/react-query'
import { Smile } from 'lucide-react'
import { userQueries } from '../user-queries'
import { Skeleton } from '@ui/atoms/skeleton'
import './profile-mood-timeline-section.scss'

const MOOD_COLORS: Record<string, string> = {
  great: '#34d399',
  good: '#38bdf8',
  okay: '#fbbf24',
  low: '#f97316',
  bad: '#ef4444',
}

const MOOD_LABELS: Record<string, string> = {
  great: 'Great',
  good: 'Good',
  okay: 'Okay',
  low: 'Low',
  bad: 'Bad',
}

export function MoodTimelineSection({ username }: { username: string }) {
  const moodQuery = useQuery(userQueries.moodTimeline(username))

  if (moodQuery.isLoading) return <MoodTimelineSkeleton />
  if (moodQuery.isError || !moodQuery.data || moodQuery.data.length === 0) return null

  const checkins = moodQuery.data

  return (
    <section>
      <div className="dk-user-mood-timeline__header">
        <Smile className="h-4 w-4 text-muted-foreground/60" />
        <h2 className="dk-user-mood-timeline__title">Mood</h2>
        <span className="dk-user-mood-timeline__count">last {checkins.length} days</span>
      </div>

      <div className="dk-user-mood-timeline__checkins">
        {checkins.map((c, i) => {
          const color = MOOD_COLORS[c.mood] ?? '#6b7280'
          const label = MOOD_LABELS[c.mood] ?? c.mood
          const date = new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

          return (
            <div key={c.date} className="dk-user-mood-timeline__checkin" style={{ width: 40 }}>
              {/* Connecting line */}
              {i < checkins.length - 1 && (
                <div className="absolute h-[2px] bg-gradient-to-r from-transparent to-transparent" />
              )}
              {/* Dot */}
              <div
                className="dk-user-mood-timeline__dot"
                style={{
                  backgroundColor: color,
                  boxShadow: `0 0 8px ${color}44`,
                }}
                title={`${label} · ${date}`}
              />
              {/* Date */}
              <span className="dk-user-mood-timeline__date">
                {date.split(' ')[0]}
                <br />
                {date.split(' ')[1]}
              </span>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="dk-user-mood-timeline__legend">
        {Object.entries(MOOD_COLORS).map(([mood, color]) => (
          <span key={mood} className="dk-user-mood-timeline__legend-item">
            <span className="dk-user-mood-timeline__legend-dot" style={{ backgroundColor: color }} />
            {MOOD_LABELS[mood]}
          </span>
        ))}
      </div>
    </section>
  )
}

function MoodTimelineSkeleton() {
  return (
    <section>
      <Skeleton className="dk-user-mood-timeline__skeleton-bar" />
      <div className="dk-user-mood-timeline__skeleton-dots">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="dk-user-mood-timeline__skeleton-dot" />
        ))}
      </div>
    </section>
  )
}
