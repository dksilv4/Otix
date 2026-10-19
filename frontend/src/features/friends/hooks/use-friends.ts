import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { friendsQueries } from '../queries'
import { computeActiveFriends, filterFriends } from '../utils'

interface UseFriendsOptions {
  searchQuery?: string
  enabled?: boolean
}

export const useFriends = (options: UseFriendsOptions = {}) => {
  const { searchQuery = '', enabled = true } = options

  const listQuery = useQuery({
    ...friendsQueries.list(),
    enabled,
  })
  const activityQuery = useQuery({
    ...friendsQueries.activity(50),
    enabled,
  })

  const friends = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const activities = useMemo(() => activityQuery.data ?? [], [activityQuery.data])

  const filteredFriends = useMemo(
    () => filterFriends(friends, searchQuery),
    [friends, searchQuery],
  )

  const activeFriends = useMemo(
    () => computeActiveFriends(friends, activities),
    [friends, activities],
  )

  const activeNowFriends = useMemo(
    () => activeFriends.filter((a) => a.state === 'active_now'),
    [activeFriends],
  )

  return {
    friends,
    filteredFriends,
    activeFriends,
    activeNowFriends,
    totalCount: friends.length,
    activeCount: activeNowFriends.length,
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    refetch: listQuery.refetch,
  }
}
