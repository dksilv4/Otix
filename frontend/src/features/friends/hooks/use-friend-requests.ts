import { useQuery } from '@tanstack/react-query'
import {
  friendsQueries,
  useAcceptFriendRequest,
  useRejectFriendRequest,
} from '../queries'

interface UseFriendRequestsOptions {
  enabled?: boolean
}

export const useFriendRequests = (options: UseFriendRequestsOptions = {}) => {
  const { enabled = true } = options
  const incomingQuery = useQuery({
    ...friendsQueries.incomingRequests(),
    enabled,
  })
  const outgoingQuery = useQuery({
    ...friendsQueries.outgoingRequests(),
    enabled,
  })

  const acceptMutation = useAcceptFriendRequest()
  const rejectMutation = useRejectFriendRequest()

  const incoming = incomingQuery.data ?? []
  const outgoing = outgoingQuery.data ?? []

  return {
    incoming,
    outgoing,
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    isLoading: incomingQuery.isLoading || outgoingQuery.isLoading,
    acceptRequest: acceptMutation.mutate,
    isAccepting: acceptMutation.isPending,
    rejectRequest: rejectMutation.mutate,
    isRejecting: rejectMutation.isPending,
    refetch: () => {
      void incomingQuery.refetch()
      void outgoingQuery.refetch()
    },
  }
}
