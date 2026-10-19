import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { friendsQueries } from '../queries'
import { filterFriendActivity } from '../utils'
import type { ActivityFilterKey } from '../types'

export const useFriendActivity = (limit = 40) => {
  const [filter, setFilter] = useState<ActivityFilterKey>('all')
  const query = useQuery(friendsQueries.activity(limit))

  const allActivities = query.data ?? []

  const filteredActivities = useMemo(
    () => filterFriendActivity(allActivities, filter),
    [allActivities, filter],
  )

  return {
    activities: filteredActivities,
    rawActivities: allActivities,
    filter,
    setFilter,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
