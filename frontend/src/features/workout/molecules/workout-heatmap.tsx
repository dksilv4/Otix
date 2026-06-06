// TODO: Review this file
import { useMemo } from 'react'
import { useHeatmap, type HeatmapDateEntry } from '../workout-queries'
import { cn } from '@/lib/utils'
import './workout-heatmap.scss'

const WAVE_MS = 30

function loadingStyle(col: number, row: number): React.CSSProperties {
  return {
    animationDelay: `${(col * 7 + row) * WAVE_MS}ms`,
    animationDuration: '2.5s',
  }
}

function cellClass(count: number, isLoading: boolean): string {
  if (isLoading) return 'dk-workout-heatmap__cell--loading'
  return `dk-workout-heatmap__cell--level-${Math.min(count, 3)}`
}

function tooltip(date: string, count: number): string {
  if (!date) return ''
  if (count === 0) return `${date}: No workouts`
  return `${date}: ${count} workout${count > 1 ? 's' : ''}`
}

interface WorkoutHeatmapProps {
  weeks?: number
  className?: string
}

function buildGrid(data: { dates: HeatmapDateEntry[] } | undefined, weeks: number) {
  if (!data?.dates?.length) {
    return {
      cols: weeks,
      cells: Array.from({ length: 7 }, () => Array(weeks).fill(null)) as (HeatmapDateEntry | null)[][],
      monthCols: [] as { label: string; col: number }[],
    }
  }

  const dates = data.dates
  const firstDate = new Date(dates[0].date + 'T00:00:00')
  const firstDow = firstDate.getUTCDay() === 0 ? 6 : firstDate.getUTCDay() - 1
  const totalCols = Math.ceil((firstDow + dates.length) / 7)

  const cells: (HeatmapDateEntry | null)[][] = Array.from({ length: 7 }, () =>
    Array(totalCols).fill(null),
  )

  for (const entry of dates) {
    const d = new Date(entry.date + 'T00:00:00')
    const dayIdx = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1
    const daysSinceStart = Math.floor((d.getTime() - firstDate.getTime()) / 86400000)
    const col = Math.floor((firstDow + daysSinceStart) / 7)
    if (col >= 0 && col < totalCols) {
      cells[dayIdx][col] = entry
    }
  }

  const monthCols: { label: string; col: number }[] = []
  for (let c = 0; c < totalCols; c++) {
    let d: Date | null = null
    for (let r = 0; r < 7; r++) {
      const entry = cells[r][c]
      if (entry) { d = new Date(entry.date + 'T00:00:00'); break }
    }
    if (!d) d = new Date(firstDate.getTime() + c * 7 * 86400000)

    const monthKey = d.toLocaleDateString('en-US', { month: 'short' })
    const prev = monthCols[monthCols.length - 1]
    if (!prev || prev.label !== monthKey) {
      monthCols.push({ label: monthKey, col: c })
    }
  }

  return { cols: totalCols, cells, monthCols }
}

export function WorkoutHeatmap({ weeks = 52, className }: WorkoutHeatmapProps) {
  const { data, isLoading, isError, error } = useHeatmap(weeks)

  const grid = useMemo(() => buildGrid(data, weeks), [data, weeks])

  if (isError) {
    console.error('Heatmap query failed:', error)
  }

  return (
    <div className={cn('dk-workout-heatmap', className)}>
      <div className="dk-workout-heatmap__inner">
        {/* Month labels */}
        <div className="dk-workout-heatmap__months">
          {Array.from({ length: grid.cols }).map((_, col) => {
            const month = grid.monthCols.find((m) => m.col === col)
            return (
              <div key={col} className="dk-workout-heatmap__month-cell">
                {month && (
                  <span className="dk-workout-heatmap__month-label">
                    {month.label}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Grid */}
        <div className="dk-workout-heatmap__grid">
          {Array.from({ length: grid.cols }).map((_, col) => (
            <div key={col} className="dk-workout-heatmap__col">
              {Array.from({ length: 7 }).map((_, row) => {
                const entry = grid.cells[row][col]
                const count = entry?.count ?? 0
                const date = entry?.date ?? ''
                return (
                  <div
                    key={row}
                    className={cn(
                      'dk-workout-heatmap__cell',
                      cellClass(count, isLoading),
                    )}
                    style={isLoading ? loadingStyle(col, row) : undefined}
                    title={tooltip(date, count)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="dk-workout-heatmap__legend">
        <span className="dk-workout-heatmap__legend-label">Less</span>
        <div className="dk-workout-heatmap__legend-cell dk-workout-heatmap__cell--level-0" />
        <div className="dk-workout-heatmap__legend-cell dk-workout-heatmap__cell--level-1" />
        <div className="dk-workout-heatmap__legend-cell dk-workout-heatmap__cell--level-2" />
        <div className="dk-workout-heatmap__legend-cell dk-workout-heatmap__cell--level-3" />
        <span className="dk-workout-heatmap__legend-label">More</span>
      </div>
    </div>
  )
}
