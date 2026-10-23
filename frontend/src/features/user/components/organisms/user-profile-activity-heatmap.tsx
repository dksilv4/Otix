import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Sparkles, Flame } from 'lucide-react'
import { userQueries, type ActivityHeatmapEntry } from '../../user-queries'
import { SectionHeader } from '../molecules/section-header'
import type { SectionVisibility } from '../../types'
import { getHeatmapIntensityClass } from '../../utils/profile-sections'

interface UserProfileActivityHeatmapProps {
  username: string
  isOwner?: boolean
  visibility?: SectionVisibility
  onToggleVisibility?: () => void | Promise<void>
  onChangeVisibility?: (visibility: SectionVisibility) => void | Promise<void>
  isUpdatingVisibility?: boolean
  onRemove?: () => void | Promise<void>
  isRemoving?: boolean
}

export const UserProfileActivityHeatmap = ({
  username,
  isOwner = false,
  visibility = 'public',
  onToggleVisibility,
  onChangeVisibility,
  isUpdatingVisibility = false,
  onRemove,
  isRemoving = false,
}: UserProfileActivityHeatmapProps) => {
  const query = useQuery(userQueries.userActivityHeatmap(username, 52))
  const data = query.data

  const dates: ActivityHeatmapEntry[] = useMemo(() => {
    return Array.isArray(data?.dates) ? data.dates : []
  }, [data?.dates])

  // Group into columns of 7 days
  const weeks = useMemo(() => {
    const cols: ActivityHeatmapEntry[][] = []
    for (let i = 0; i < dates.length; i += 7) {
      cols.push(dates.slice(i, i + 7))
    }
    return cols
  }, [dates])

  const totalActiveDays = useMemo(() => {
    return dates.filter((d) => (d.total || 0) > 0).length
  }, [dates])

  const totalLogged = useMemo(() => {
    return dates.reduce((acc, d) => acc + (d.total || 0), 0)
  }, [dates])

  const summary = totalLogged > 0 ? `${totalLogged} actions in 52 weeks` : undefined

  return (
    <div data-testid="user-profile-activity-heatmap" className="w-full space-y-4">
      <SectionHeader
        icon={Calendar}
        title="Activity Heatmap"
        summary={summary}
        isOwner={isOwner}
        visibility={visibility}
        onToggleVisibility={onToggleVisibility}
        onChangeVisibility={onChangeVisibility}
        isUpdatingVisibility={isUpdatingVisibility}
        onRemove={onRemove}
        isRemoving={isRemoving}
      />

      <div className="px-4 sm:px-6 lg:px-8">
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--dk-surface-base)] border border-[var(--dk-separator)] space-y-4">
          {/* Stats Bar */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold text-foreground">{totalActiveDays}</span>
              <span>active days</span>
            </div>
            <span className="text-muted-foreground/30">·</span>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Flame className="h-3.5 w-3.5 text-amber-500" />
              <span className="font-semibold text-foreground">{totalLogged}</span>
              <span>total media interactions</span>
            </div>
          </div>

          {/* 52-Week Grid */}
          {query.isLoading ? (
            <div className="h-24 w-full rounded-xl bg-[var(--dk-surface-ghost)] animate-pulse" />
          ) : dates.length === 0 ? (
            <div className="py-6 flex flex-col items-center justify-center text-center">
              <p className="text-xs text-muted-foreground">
                No activity logged in the past year.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto pb-1">
              <div className="inline-flex gap-1 min-w-[700px]">
                {weeks.map((week, wIdx) => (
                  <div key={wIdx} className="flex flex-col gap-1">
                    {week.map((day) => {
                      const count = day.total || 0
                      const parts: string[] = []
                      if (day.movie) parts.push(`${day.movie} movie${day.movie > 1 ? 's' : ''}`)
                      if (day.show) parts.push(`${day.show} show${day.show > 1 ? 's' : ''}`)
                      if (day.game) parts.push(`${day.game} game${day.game > 1 ? 's' : ''}`)
                      if (day.review) parts.push(`${day.review} review${day.review > 1 ? 's' : ''}`)
                      if (day.workout) parts.push(`${day.workout} workout${day.workout > 1 ? 's' : ''}`)

                      const tooltip = count > 0
                        ? `${count} activities on ${day.date}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`
                        : `No activity on ${day.date}`

                      return (
                        <div
                          key={day.date}
                          title={tooltip}
                          className={`h-2.5 w-2.5 rounded-[2px] transition-colors cursor-pointer ${getHeatmapIntensityClass(
                            count,
                          )} hover:ring-1 hover:ring-primary`}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground mt-3">
                <span>Less</span>
                <div className="h-2 w-2 rounded-[2px] bg-[var(--dk-surface-ghost)]/60" />
                <div className="h-2 w-2 rounded-[2px] bg-primary/30" />
                <div className="h-2 w-2 rounded-[2px] bg-primary/60" />
                <div className="h-2 w-2 rounded-[2px] bg-primary/80" />
                <div className="h-2 w-2 rounded-[2px] bg-primary" />
                <span>More</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
