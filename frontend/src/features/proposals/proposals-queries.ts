import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

// ── Types ────────────────────────────────────────────────────────────

export interface ProposerUser {
  id: string
  username: string
  avatarUrl: string | null
}

export interface Proposal {
  id: string
  proposalType: string  // 'match' | 'edit'
  targetType: string
  targetId: string
  proposerId: string | null
  reviewerId: string | null
  status: 'pending' | 'approved' | 'rejected'
  payload: Record<string, unknown>
  rejectionReason: string | null
  snapshot: Record<string, unknown> | null
  upvoteCount: number
  downvoteCount: number
  myVote: string | null
  proposer: ProposerUser | null
  reviewer: ProposerUser | null
  createdAt: string
  updatedAt: string
  reviewedAt: string | null
  // ── Media enrichment (from API layer) ──
  targetTitle: string | null
  targetPosterUrl: string | null
  targetBackdropUrl: string | null
}

export interface ProposalList {
  items: Proposal[]
  total: number
}

export interface VoteResponse {
  myVote: string | null
  upvoteCount: number
  downvoteCount: number
}

export interface ProposalFilters {
  type?: string
  status?: string
  targetType?: string
  targetId?: string
  limit?: number
  offset?: number
}

// ── Query key factory ────────────────────────────────────────────────

export const proposalKeys = {
  all: () => ['proposals'] as const,
  lists: () => [...proposalKeys.all(), 'list'] as const,
  list: (filters: ProposalFilters) => [...proposalKeys.lists(), filters] as const,
  details: () => [...proposalKeys.all(), 'detail'] as const,
  detail: (id: string) => [...proposalKeys.details(), id] as const,
}

// ── Hooks ────────────────────────────────────────────────────────────

export function useProposals(filters: ProposalFilters = {}) {
  return useQuery({
    queryKey: proposalKeys.list(filters),
    queryFn: async () => {
      const params: Record<string, string | number> = {}
      if (filters.type) params.type = filters.type
      if (filters.status) params.status = filters.status
      if (filters.targetType) params.targetType = filters.targetType
      if (filters.targetId) params.targetId = filters.targetId
      if (filters.limit) params.limit = filters.limit
      if (filters.offset) params.offset = filters.offset
      const { data } = await apiClient.get<ProposalList>('/proposals', { params })
      return data
    },
    staleTime: 15_000,
  })
}

export function useProposal(id: string) {
  return useQuery({
    queryKey: proposalKeys.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<Proposal>(`/proposals/${id}`)
      return data
    },
    enabled: !!id,
  })
}

export function useApproveProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (proposalId: string) => {
      const { data } = await apiClient.post<Proposal>(`/proposals/${proposalId}/approve`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: proposalKeys.all() })
    },
  })
}

export function useRejectProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ proposalId, reason }: { proposalId: string; reason?: string }) => {
      const { data } = await apiClient.post<Proposal>(`/proposals/${proposalId}/reject`, {
        rejection_reason: reason ?? null,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: proposalKeys.all() })
    },
  })
}

export function useUndoProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (proposalId: string) => {
      const { data } = await apiClient.post<Proposal>(`/proposals/${proposalId}/undo`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: proposalKeys.all() })
    },
  })
}

export function useVoteOnProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ proposalId, voteType }: { proposalId: string; voteType: 'up' | 'down' }) => {
      const { data } = await apiClient.post<VoteResponse>(`/proposals/${proposalId}/vote`, {
        vote_type: voteType,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: proposalKeys.all() })
    },
  })
}

export function useRemoveVote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (proposalId: string) => {
      await apiClient.delete(`/proposals/${proposalId}/vote`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: proposalKeys.all() })
    },
  })
}
