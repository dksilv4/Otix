import { useMemo, useState } from 'react'
import type { CalendarEvent } from '../../types'
import { CalendarDayCell } from '../molecules/calendar-day-cell'
import { CalendarEventRow } from '../molecules/calendar-event-row'

interface CalendarGridProps {
  events: CalendarEvent[]
  year: number
  month: number
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getMonthGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const grid: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) grid.push(null)
  for (let d = 1; d <= daysInMonth; d++) grid.push(d)
  // Pad to complete the last week
  while (grid.length % 7 !== 0) grid.push(null)
  return grid
}

export function CalendarGrid({ events, year, month }: CalendarGridProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const todayStr = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`
  }, [])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    const safeEvents = Array.isArray(events) ? events : []
    for (const event of safeEvents) {
      if (!event || !event.releaseDate) continue
      const d = new Date(event.releaseDate)
      if (isNaN(d.getTime())) continue
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(event)
    }
    return map
  }, [events])

  const gridDays = useMemo(() => getMonthGrid(year, month), [year, month])
  const selectedKey = selectedDate

  const selectedEvents = selectedKey ? eventsByDate.get(selectedKey) ?? [] : []

  const handleSelect = (key: string) => {
    setSelectedDate(key === selectedKey ? null : key)
  }

  return (
    <div className="space-y-4">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-px">
        {DAYS.map((d) => (
          <div key={d} className="pb-2 text-center text-[11px] font-medium uppercase tracking-wider text-white/30">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px">
        {gridDays.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} className="h-10" />
          const key = `${year}-${month}-${day}`
          const dayEvents = eventsByDate.get(key)
          const isToday = key === todayStr
          const isSelected = key === selectedKey

          return (
            <CalendarDayCell
              key={key}
              day={day}
              isToday={isToday}
              isSelected={isSelected}
              isCurrentMonth
              eventCount={dayEvents?.length ?? 0}
              eventTypes={[...new Set((Array.isArray(dayEvents) ? dayEvents : []).map((e) => e?.eventType).filter(Boolean))]}
              onSelect={() => handleSelect(key)}
            />
          )
        })}
      </div>

      {/* Selected day events */}
      {selectedEvents.length > 0 && (
        <div className="space-y-1.5 pt-2">
          <h3 className="text-xs font-medium text-white/40">
            {new Date(
              parseInt(selectedKey!.split('-')[0]),
              parseInt(selectedKey!.split('-')[1]),
              parseInt(selectedKey!.split('-')[2])
            ).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          <div className="space-y-1">
            {(Array.isArray(selectedEvents) ? selectedEvents.filter(Boolean) : []).map((event) => (
              <CalendarEventRow key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
