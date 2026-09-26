import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { calendarQueries } from '../queries/calendar-queries'
import { CalendarTimeline } from '../components/organisms/calendar-timeline'

export function CalendarTimelinePage() {
  const { data: events, isLoading, isError, refetch } = useQuery(calendarQueries.events())

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden pt-16 md:pt-20">
      <Helmet>
        <title>Timeline (Beta) — Otix</title>
      </Helmet>

      {isLoading && (
        <div className="min-h-0 flex-1 animate-pulse bg-white/[0.03]" />
      )}

      {isError && !events && (
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <p className="text-sm text-white/50">Failed to load the calendar.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {events && events.length > 0 && <CalendarTimeline events={events} />}

      {events && events.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <p className="text-sm text-white/30">No upcoming or recent releases</p>
          <p className="mt-1 text-xs text-white/20">Add items to your watchlist to track them here.</p>
        </div>
      )}
    </div>
  )
}
