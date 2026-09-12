// TODO: Review this file
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { emitOtixEvent } from '@/lib/plugin-events'

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
    onMutate: async (voteType) => {
      const voteKey = ['review-votes', userId, mediaItemId]
      await queryClient.cancelQueries({ queryKey: voteKey })
      const prev = queryClient.getQueryData<VoteCounts>(voteKey)
      if (prev) {
        const next: VoteCounts = { ...prev }
        if (prev.my_vote === 'up') next.up = Math.max(0, next.up - 1)
        if (prev.my_vote === 'down') next.down = Math.max(0, next.down - 1)
        if (prev.my_vote === voteType) {
          next.my_vote = null
        } else {
          if (voteType === 'up') next.up += 1
          else next.down += 1
          next.my_vote = voteType
        }
        queryClient.setQueryData<VoteCounts>(voteKey, next)
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['review-votes', userId, mediaItemId], context.prev)
      }
    },
    onSuccess: (_data, voteType, context) => {
      emitOtixEvent('otix:review:voted', {
        mediaItemId,
        userId,
        voteType,
        active: context?.prev?.my_vote !== voteType,
      })
    },
    onSettled: () => {
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
    onMutate: async () => {
      const voteKey = ['review-votes', userId, mediaItemId]
      await queryClient.cancelQueries({ queryKey: voteKey })
      const prev = queryClient.getQueryData<VoteCounts>(voteKey)
      if (prev) {
        const next: VoteCounts = { ...prev }
        if (prev.my_vote === 'up') next.up = Math.max(0, next.up - 1)
        if (prev.my_vote === 'down') next.down = Math.max(0, next.down - 1)
        next.my_vote = null
        queryClient.setQueryData<VoteCounts>(voteKey, next)
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['review-votes', userId, mediaItemId], context.prev)
      }
    },
    onSuccess: (_data, _vars, context) => {
      const removed = context?.prev?.my_vote
      if (removed === 'up' || removed === 'down') {
        emitOtixEvent('otix:review:voted', { mediaItemId, userId, voteType: removed, active: false })
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['review-votes', userId, mediaItemId] })
    },
  })
}
