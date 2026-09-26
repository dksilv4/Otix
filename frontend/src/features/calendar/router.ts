import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { calendarQueries } from './queries/calendar-queries'

const CalendarPage = lazy(() =>
  import('./pages/calendar-page').then((m) => ({ default: m.CalendarPage }))
)

const CalendarTimelinePage = lazy(() =>
  import('./pages/calendar-timeline-page').then((m) => ({ default: m.CalendarTimelinePage }))
)

export function createCalendarRoutes(rootRoute: AnyRoute) {
  const calendarRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/calendar',
    component: CalendarPage,
    loader: ({ context }) => {
      void import('./pages/calendar-page')
      void context.queryClient.prefetchQuery(calendarQueries.events())
    },
  })

  const calendarTimelineRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/calendar/timeline',
    component: CalendarTimelinePage,
    loader: ({ context }) => {
      void import('./pages/calendar-timeline-page')
      void context.queryClient.prefetchQuery(calendarQueries.events())
    },
  })

  return [calendarRoute, calendarTimelineRoute]
}
