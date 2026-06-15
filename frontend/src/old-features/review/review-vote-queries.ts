// TODO: Review this file
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

export interface VoteCounts {
  up: number
  down: number
  my_vote: string | null
}

export function useReviewVoteCounts(userId: string, mediaItemId: string) {
  return useQuery({
    queryKey: ['review-votes', userId, mediaItemId],
    queryFn: async () => {
      const { data } = await apiClient.get<VoteCounts>(
        `/reviews/${userId}/${mediaItemId}/vote`,
      )
      return data
    },
    staleTime: 1000 * 60,
  })
}

export function useVoteReview(userId: string, mediaItemId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (voteType: 'up' | 'down') => {
      await apiClient.post(`/reviews/${userId}/${mediaItemId}/vote`, {
        vote_type: voteType,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-votes', userId, mediaItemId] })
    },
  })
}

export function useRemoveVote(userId: string, mediaItemId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/reviews/${userId}/${mediaItemId}/vote`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-votes', userId, mediaItemId] })
    },
  })
}
