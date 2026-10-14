import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { calendarQueries } from './queries/calendar-queries'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const CalendarPage = safeLazy(() =>
  import('./pages/calendar-page').then((m) => ({ default: m.CalendarPage }))
)

const CalendarTimelinePage = safeLazy(() =>
  import('./pages/calendar-timeline-page').then((m) => ({ default: m.CalendarTimelinePage }))
)

export function createCalendarRoutes(rootRoute: AnyRoute) {
  const calendarRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/calendar',
    component: CalendarPage,
    loader: ({ context }) => {
      safePrefetchChunk(() => import('./pages/calendar-page'))
      void context.queryClient.prefetchQuery(calendarQueries.events())
    },
  })

  const calendarTimelineRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/calendar/timeline',
    component: CalendarTimelinePage,
    loader: ({ context }) => {
      safePrefetchChunk(() => import('./pages/calendar-timeline-page'))
      void context.queryClient.prefetchQuery(calendarQueries.events())
    },
  })

  return [calendarRoute, calendarTimelineRoute]
}
