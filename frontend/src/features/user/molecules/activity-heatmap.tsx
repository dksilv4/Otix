import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { userQueries, type ActivityHeatmapEntry } from '@/features/user/user-queries'
import { cn } from '@/lib/utils'

type ActivityType = 'workout' | 'movie' | 'show' | 'music'

const ACTIVITIES: { key: ActivityType; label: string; color: string; bg: string }[] = [
  { key: 'workout', label: 'Workout', color: 'text-amber-400', bg: 'bg-amber-400' },
  { key: 'movie', label: 'Movie', color: 'text-rose-400', bg: 'bg-rose-400' },
  { key: 'show', label: 'Show', color: 'text-violet-400', bg: 'bg-violet-400' },
  { key: 'music', label: 'Music', color: 'text-emerald-400', bg: 'bg-emerald-400' },
]

interface WeekData {
  weekStart: string
  weekLabel: string
  counts: Record<ActivityType, number>
  total: number
}

function buildWeeks(data: ActivityHeatmapResponse | undefined, weeks: number): {
  weeks: WeekData[]
  max: number
} {
  if (!data?.dates?.length) return { weeks: [], max: 1 }

  // Group days into ISO weeks
  const weekMap = new Map<string, WeekData>()

  function getWeekStart(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    const day = d.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day // Monday as week start
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() + diff)
    return monday.toISOString().slice(0, 10)
  }

  for (const entry of data.dates) {
    const weekStart = getWeekStart(entry.date)
    if (!weekMap.has(weekStart)) {
      weekMap.set(weekStart, {
        weekStart,
        weekLabel: '',
        counts: { workout: 0, movie: 0, show: 0, music: 0 },
        total: 0,
      })
    }
    const w = weekMap.get(weekStart)!
    w.counts.workout += entry.workout
    w.counts.movie += entry.movie
    w.counts.show += entry.show
    w.counts.music += entry.music
    w.total += entry.workout + entry.movie + entry.show + entry.music
  }

  const weekArray = Array.from(weekMap.values()).sort(
    (a, b) => a.weekStart.localeCompare(b.weekStart),
  ).slice(-weeks)

  // Label weeks
  let max = 0
  for (const w of weekArray) {
    if (w.total > max) max = w.total
    const d = new Date(w.weekStart + 'T00:00:00')
    const month = d.toLocaleDateString('en-US', { month: 'short' })
    const day = d.getUTCDate()
    w.weekLabel = `${month} ${day}`
  }

  return { weeks: weekArray, max: Math.max(max, 1) }
}

function LoadingBar() {
  return (
    <div className="h-3 w-full rounded bg-white/[0.04] animate-pulse" />
  )
}

export interface ActivityHeatmapProps {
  weeks?: number
  className?: string
}

export function ActivityHeatmap({ weeks = 16, className }: ActivityHeatmapProps) {
  const { data, isLoading } = useQuery({
    ...userQueries.activityHeatmap(weeks),
  })

  const { weeks: weekData, max } = useMemo(() => buildWeeks(data, weeks), [data, weeks])

  if (isLoading) {
    return (
      <div className="space-y-2">
        <LoadingBar />
        <LoadingBar />
        <LoadingBar />
        <LoadingBar />
      </div>
    )
  }

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <div className="w-fit">
        {/* Header: type labels */}
        <div className="flex items-end gap-2 mb-2">
          <div className="w-16 shrink-0" />
          {weekData.map((w) => (
            <div key={w.weekStart} className="w-8 text-center">
              <span className="text-[9px] text-muted-foreground/50 leading-tight block">
                {w.weekLabel}
              </span>
            </div>
          ))}
        </div>

        {/* Rows — one per activity type */}
        {ACTIVITIES.map((activity) => (
          <div key={activity.key} className="flex items-center gap-2 mb-2 last:mb-0">
            <div className="w-16 shrink-0 flex items-center gap-1.5">
              <span className={cn('w-2.5 h-2.5 rounded-[3px]', activity.bg)} />
              <span className="text-xs font-medium text-muted-foreground/70">{activity.label}</span>
            </div>
            {weekData.map((w) => {
              const count = w.counts[activity.key]
              const intensity = max > 0 ? count / max : 0
              const pct = Math.min(Math.round(intensity * 100), 100)
              return (
                <div
                  key={w.weekStart}
                  className="w-8 flex items-center justify-center"
                  title={`${activity.label}: ${count} in week of ${w.weekLabel}`}
                >
                  <div
                    className="w-6 h-6 rounded-[4px] flex items-center justify-center transition-all hover:scale-110"
                    style={{
                      backgroundColor: count > 0
                        ? `hsl(var(--primary) / ${0.15 + pct * 0.006})`
                        : 'rgba(255,255,255,0.04)',
                      boxShadow: count > 0
                        ? 'inset 0 0 0 1px rgba(255,255,255,0.08)'
                        : 'inset 0 0 0 1px rgba(255,255,255,0.03)',
                    }}
                  >
                    {count > 0 && pct > 30 && (
                      <span className="text-[10px] font-semibold text-foreground/80">{count}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
