import { memo } from 'react'

interface CalendarDayCellProps {
  day: number
  isToday: boolean
  isSelected: boolean
  isCurrentMonth: boolean
  eventCount: number
  eventTypes: string[]
  onSelect: () => void
}

const TYPE_DOT_COLORS: Record<string, string> = {
  watchlist_release: 'bg-blue-400',
  new_episode: 'bg-emerald-400',
  sequel: 'bg-amber-400',
  new_season: 'bg-purple-400',
}

export const CalendarDayCell = memo(({
  day,
  isToday,
  isSelected,
  isCurrentMonth,
  eventCount,
  eventTypes,
  onSelect,
}: CalendarDayCellProps) => {
  return (
    <button
      onClick={onSelect}
      className={`
        relative flex h-10 w-full flex-col items-center justify-center rounded-lg text-sm transition-colors
        ${!isCurrentMonth ? 'text-muted-foreground/30' : isSelected ? 'bg-primary text-primary-foreground font-semibold' : isToday ? 'text-foreground font-semibold ring-1 ring-inset ring-primary/40' : 'text-foreground/80 hover:text-foreground'}
        ${isCurrentMonth && !isSelected ? 'hover:bg-[var(--dk-surface-ghost)]' : ''}
      `}
    >
      <span>{day}</span>
      {eventCount > 0 && (
        <div className="mt-0.5 flex items-center gap-[2px]">
          {eventTypes.slice(0, 3).map((type) => (
            <span
              key={type}
              className={`h-1 w-1 rounded-full ${TYPE_DOT_COLORS[type] ?? 'bg-muted-foreground/40'}`}
            />
          ))}
          {eventCount > 3 && (
            <span className="text-[8px] text-muted-foreground">+{eventCount - 3}</span>
          )}
        </div>
      )}
    </button>
  )
})
