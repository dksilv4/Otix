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
        ${!isCurrentMonth ? 'text-white/10' : isSelected ? 'bg-white/10 text-white' : isToday ? 'text-white' : 'text-white/60'}
        ${isSelected ? '' : isToday ? 'ring-1 ring-inset ring-white/20' : ''}
        ${isCurrentMonth && !isSelected ? 'hover:bg-white/5' : ''}
      `}
    >
      <span className={isSelected ? 'font-semibold' : ''}>{day}</span>
      {eventCount > 0 && (
        <div className="mt-0.5 flex items-center gap-[2px]">
          {eventTypes.slice(0, 3).map((type) => (
            <span
              key={type}
              className={`h-1 w-1 rounded-full ${TYPE_DOT_COLORS[type] ?? 'bg-white/30'}`}
            />
          ))}
          {eventCount > 3 && (
            <span className="text-[8px] text-white/30">+{eventCount - 3}</span>
          )}
        </div>
      )}
    </button>
  )
})
