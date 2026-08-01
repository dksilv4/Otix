import { queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type { CalendarResponse } from '../types'

export const calendarKeys = {
  all: () => ['calendar'] as const,
  events: () => [...calendarKeys.all(), 'events'] as const,
}

export const calendarQueries = {
  events: () =>
    queryOptions({
      queryKey: calendarKeys.events(),
      queryFn: async () => {
        const { data } = await apiClient.get<CalendarResponse>('/calendar')
        return data.events
      },
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
    }),
}
