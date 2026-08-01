import { lazy } from 'react'
import { createRoute, redirect } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const CalendarPage = lazy(() => import('./pages/calendar-page').then(m => ({ default: m.CalendarPage })))

export function createCalendarRoutes(rootRoute: AnyRoute) {
  const calendarRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/calendar',
    component: CalendarPage,
    beforeLoad: ({ context }) => {
      if (context.isAuthLoaded && !context.isAuthenticated) {
        throw redirect({ to: '/auth/login', search: { redirect: '/calendar' } })
      }
    },
  })

  return [calendarRoute]
}
