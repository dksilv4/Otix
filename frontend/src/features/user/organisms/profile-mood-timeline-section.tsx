import { useQuery } from '@tanstack/react-query'
import { Smile } from 'lucide-react'
import { userQueries } from '../user-queries'
import { Skeleton } from '@ui/atoms/skeleton'

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
      <div className="flex items-center gap-2 mb-4">
        <Smile className="h-4 w-4 text-muted-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Mood</h2>
        <span className="text-[10px] text-muted-foreground/30 ml-auto">last {checkins.length} days</span>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {checkins.map((c, i) => {
          const color = MOOD_COLORS[c.mood] ?? '#6b7280'
          const label = MOOD_LABELS[c.mood] ?? c.mood
          const date = new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

          return (
            <div key={c.date} className="flex flex-col items-center shrink-0" style={{ width: 40 }}>
              {/* Connecting line */}
              {i < checkins.length - 1 && (
                <div className="absolute h-[2px] bg-gradient-to-r from-transparent to-transparent" />
              )}
              {/* Dot */}
              <div
                className="w-3 h-3 rounded-full ring-2 ring-offset-2 ring-offset-[var(--dk-surface-root)]"
                style={{
                  backgroundColor: color,
                  boxShadow: `0 0 8px ${color}44`,
                }}
                title={`${label} · ${date}`}
              />
              {/* Date */}
              <span className="text-[9px] text-muted-foreground/40 mt-2 text-center leading-tight">
                {date.split(' ')[0]}
                <br />
                {date.split(' ')[1]}
              </span>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-3">
        {Object.entries(MOOD_COLORS).map(([mood, color]) => (
          <span key={mood} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
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
      <Skeleton className="h-4 w-28 mb-4" />
      <div className="flex gap-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="w-3 h-3 rounded-full shrink-0" />
        ))}
      </div>
    </section>
  )
}
