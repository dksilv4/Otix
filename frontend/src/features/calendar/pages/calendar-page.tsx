import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { calendarQueries } from '../queries/calendar-queries'
import { CalendarGrid } from '../components/organisms/calendar-grid'
import { Helmet } from 'react-helmet-async'

export const CalendarPage = () => {
  const { data: events, isLoading, isError, refetch } = useQuery(calendarQueries.events())

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const prevMonth = useCallback(() => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11) }
    else setMonth((m) => m - 1)
  }, [month])

  const nextMonth = useCallback(() => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0) }
    else setMonth((m) => m + 1)
  }, [month])

  const goToToday = useCallback(() => {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth())
  }, [])

  const monthLabel = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-12">
      <Helmet>
        <title>Calendar — Otix</title>
      </Helmet>

      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground">Calendar</h1>
        <Link
          to="/calendar/timeline"
          className="rounded-md border border-[var(--dk-separator)] px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-[var(--dk-surface-ghost)]"
        >
          Timeline <span className="text-muted-foreground/60">Beta</span>
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--dk-surface-ghost)] hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-foreground">{monthLabel}</h2>
          <button
            onClick={goToToday}
            className="rounded-md border border-[var(--dk-separator)] px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-[var(--dk-surface-ghost)]"
          >
            Today
          </button>
        </div>

        <button
          onClick={nextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--dk-surface-ghost)] hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <div className="h-64 animate-pulse rounded-lg bg-[var(--dk-surface-ghost)]" />
        </div>
      )}

      {isError && !events && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-destructive">Failed to load the calendar.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 rounded-md border border-[var(--dk-separator)] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-[var(--dk-surface-ghost)]"
          >
            Retry
          </button>
        </div>
      )}

      {events && events.length > 0 && <CalendarGrid events={events} year={year} month={month} />}
      {events && events.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">No upcoming or recent releases</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Add items to your watchlist to track them here.</p>
        </div>
      )}
    </div>
  )
};
