import { useMemo } from 'react'
import { useHeatmap, type HeatmapDateEntry } from '../workout-queries'
import { cn } from '@/lib/utils'

const LEGEND_CELL = 'w-3 h-3 rounded-[2px]'
const CELL = 'size-4 rounded-[2px]'
const WAVE_MS = 30

function loadingStyle(col: number, row: number): React.CSSProperties {
  return {
    animationDelay: `${(col * 7 + row) * WAVE_MS}ms`,
    animationDuration: '2.5s',
  }
}

function cellColor(count: number): string {
  if (count === 0) return 'bg-white/[0.06] ring-1 ring-white/[0.04]'
  if (count === 1) return 'bg-primary/30 ring-1 ring-primary/10'
  if (count === 2) return 'bg-primary/50 ring-1 ring-primary/20'
  return 'bg-primary/70 ring-1 ring-primary/30'
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
    <div className={cn('w-full overflow-x-auto', className)}>
      <div className="w-fit">
        {/* Month labels */}
        <div className="flex gap-0.5 mb-1">
          {Array.from({ length: grid.cols }).map((_, col) => {
            const month = grid.monthCols.find((m) => m.col === col)
            return (
              <div key={col} className={cn(CELL, 'relative')}>
                {month && (
                  <span className="absolute -top-4 left-0 text-[10px] text-muted-foreground/50 whitespace-nowrap">
                    {month.label}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Grid */}
        <div className="flex gap-0.5">
          {Array.from({ length: grid.cols }).map((_, col) => (
            <div key={col} className="flex flex-col gap-0.5">
              {Array.from({ length: 7 }).map((_, row) => {
                const entry = grid.cells[row][col]
                const count = entry?.count ?? 0
                const date = entry?.date ?? ''
                return (
                  <div
                    key={row}
                    className={cn(
                      CELL,
                      isLoading
                        ? 'animate-pulse bg-muted/20'
                        : cellColor(count),
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
      <div className="flex items-center gap-1 mt-3 justify-end">
        <span className="text-[10px] text-muted-foreground/40">Less</span>
        <div className={cn(LEGEND_CELL, 'bg-white/[0.06] ring-1 ring-white/[0.04]')} />
        <div className={cn(LEGEND_CELL, 'bg-primary/30 ring-1 ring-primary/10')} />
        <div className={cn(LEGEND_CELL, 'bg-primary/50 ring-1 ring-primary/20')} />
        <div className={cn(LEGEND_CELL, 'bg-primary/70 ring-1 ring-primary/30')} />
        <span className="text-[10px] text-muted-foreground/40">More</span>
      </div>
    </div>
  )
}
