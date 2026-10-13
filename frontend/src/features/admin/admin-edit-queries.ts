// TODO: Review this file
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api/client"

export const adminEditKeys = {
  all: () => ['admin', 'edits'] as const,
  forMedia: (mediaId: string) => [...adminEditKeys.all(), 'media', mediaId] as const,
  pending: () => [...adminEditKeys.all(), 'pending'] as const,
  allProposals: (filters?: { status?: string; limit?: number; offset?: number }) =>
    [...adminEditKeys.all(), 'all-proposals', filters] as const,
}

export interface ProposerUser {
  id: string
  username: string
  avatarUrl: string | null
}

export interface ImageOverrideItem {
  imageType: string
  languageCode: string
  url: string
}

export type ArtworkContext = 'general' | 'dark' | 'light'

export interface MediaAsset {
  id: string | number
  assetType: string
  url: string
  width: number | null
  height: number | null
  lang: string | null
  style: string | null
  score: number | null
  provider: string | null
  /** Admin pinned this asset as the artwork for a presentation context. */
  selectedContext: ArtworkContext | null
  /** Mirrored file name; non-null means a local copy exists. */
  localName: string | null
  /** Admin kept this variant in the mirror set (localized extras kept on disk). */
  keepLocal: boolean
  /** Contexts this asset is currently resolved/served for. */
  currentContexts: ArtworkContext[]
  /** This image is the family's (theme-agnostic) textless art. */
  isTextless: boolean
}

export interface MediaAssetList {
  items: MediaAsset[]
  total: number
}

export interface MediaEditProposal {
  id: string
  mediaItemId: string
  proposerUserId: string | null
  approverUserId: string | null
  status: "pending" | "approved" | "rejected"
  changes: Record<string, unknown>
  imageOverrides: ImageOverrideItem[] | null
  rejectionReason: string | null
  proposer: ProposerUser | null
  approver: ProposerUser | null
  createdAt: string
  updatedAt: string
  mediaTitle: string | null
  mediaType: string | null
  mediaPosterUrl: string | null
  myVote: string | null
  upvoteCount: number
  downvoteCount: number
}

export interface MediaEditProposalList {
  items: MediaEditProposal[]
  total: number
}

export function useMediaAssets(mediaType: string, mediaId: string) {
  return useQuery({
    queryKey: [...adminEditKeys.forMedia(mediaId), 'assets'],
    queryFn: async () => {
      const { data } = await apiClient.get<MediaAssetList>(
        `/media/${mediaType}/${mediaId}/assets`
      )
      return data
    },
    staleTime: 60_000,
  })
}

export interface ArtworkSelectionResult {
  assetId: string | number
  selectedContext: ArtworkContext | null
  mirrored: boolean
}

/** Pin/unpin an asset as the admin-chosen artwork for a presentation context. */
export function useSetArtworkSelection(_mediaType: string, mediaId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      assetId,
      context,
    }: {
      assetId: string | number
      context: ArtworkContext | null
    }): Promise<ArtworkSelectionResult> => {
      const url = `/media/admin/media-items/${mediaId}/assets/${assetId}/select`
      if (context) {
        const { data } = await apiClient.put<ArtworkSelectionResult>(url, { context })
        return data
      }
      await apiClient.delete(url)
      return { assetId, selectedContext: null, mirrored: false }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminEditKeys.forMedia(mediaId) })
      queryClient.invalidateQueries({ queryKey: ['media'] })
      queryClient.invalidateQueries({ queryKey: ['discover'] })
    },
  })
}

export interface TextlessPickResult {
  assetId: string | number
  active: boolean
  mirrored: boolean
}

/**
 * Designate/clear this image as the media item's family textless art — a
 * single, theme-agnostic pick (General/Dark/Light all fall back to it). PUT
 * designates (a plain poster/backdrop is backed by a hidden textless row reusing
 * its image), DELETE clears it.
 */
export function useSetTextlessPick(_mediaType: string, mediaId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      assetId,
      active,
    }: {
      assetId: string | number
      active: boolean
    }): Promise<TextlessPickResult> => {
      const url = `/media/admin/media-items/${mediaId}/assets/${assetId}/textless`
      if (active) {
        const { data } = await apiClient.put<TextlessPickResult>(url)
        return data
      }
      const { data } = await apiClient.delete<TextlessPickResult>(url)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminEditKeys.forMedia(mediaId) })
      queryClient.invalidateQueries({ queryKey: ['media'] })
      queryClient.invalidateQueries({ queryKey: ['discover'] })
    },
  })
}

export interface ArtworkMirrorResult {
  assetId: string | number
  kept: boolean
  mirrored: boolean
}

/** Keep/release an asset in the admin mirror set (PUT mirrors + DELETE unkeeps). */
export function useSetAssetMirrorKeep(_mediaType: string, mediaId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      assetId,
      keep,
    }: {
      assetId: string | number
      keep: boolean
    }): Promise<ArtworkMirrorResult> => {
      const url = `/media/admin/media-items/${mediaId}/assets/${assetId}/mirror`
      if (keep) {
        const { data } = await apiClient.put<ArtworkMirrorResult>(url)
        return data
      }
      const { data } = await apiClient.delete<ArtworkMirrorResult>(url)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminEditKeys.forMedia(mediaId) })
    },
  })
}

export function useMediaProposals(mediaType: string, mediaId: string) {
  return useQuery({
    queryKey: adminEditKeys.forMedia(mediaId),
    queryFn: async () => {
      const { data } = await apiClient.get<MediaEditProposalList>(
        `/media/${mediaType}/${mediaId}/edit-proposals`
      )
      return data
    },
    staleTime: 30_000,
  })
}

export function useCreateProposal(mediaType: string, mediaId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { changes: Record<string, unknown>; imageOverrides: ImageOverrideItem[] | null }) => {
      const { data } = await apiClient.post<MediaEditProposal>(
        `/media/${mediaType}/${mediaId}/edit-proposals`,
        body
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminEditKeys.forMedia(mediaId) })
      queryClient.invalidateQueries({ queryKey: adminEditKeys.pending() })
    },
  })
}

export function useApproveProposal(mediaType: string, mediaId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (proposalId: string) => {
      const { data } = await apiClient.post<MediaEditProposal>(
        `/media/${mediaType}/${mediaId}/edit-proposals/${proposalId}/approve`
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminEditKeys.forMedia(mediaId) })
      queryClient.invalidateQueries({ queryKey: adminEditKeys.pending() })
      queryClient.invalidateQueries({ queryKey: ["media"] })
      queryClient.invalidateQueries({ queryKey: ["discover"] })
    },
  })
}

export function useUndoApproval(mediaType: string, mediaId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (proposalId: string) => {
      const { data } = await apiClient.post<MediaEditProposal>(
        `/media/${mediaType}/${mediaId}/edit-proposals/${proposalId}/undo`
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminEditKeys.forMedia(mediaId) })
      queryClient.invalidateQueries({ queryKey: adminEditKeys.pending() })
      queryClient.invalidateQueries({ queryKey: ["media"] })
      queryClient.invalidateQueries({ queryKey: ["discover"] })
    },
  })
}

export function useRejectProposal(mediaType: string, mediaId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ proposalId, reason }: { proposalId: string; reason: string | null }) => {
      const { data } = await apiClient.post<MediaEditProposal>(
        `/media/${mediaType}/${mediaId}/edit-proposals/${proposalId}/reject`,
        { rejectionReason: reason }
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminEditKeys.forMedia(mediaId) })
      queryClient.invalidateQueries({ queryKey: adminEditKeys.pending() })
    },
  })
}

// ── Admin XP constants (mirrors backend otix/lib/xp.py) ──
export const ADMIN_XP = {
  PROPOSAL_CREATE: 50,
  PROPOSAL_APPROVE: 100,
  PROPOSAL_REJECT: 30,
} as const

export const PROPOSAL_MIN_XP = 500

export interface VoteResponse {
  myVote: string | null
  upvoteCount: number
  downvoteCount: number
}

// ── Global admin proposals hooks (not scoped to a single media item) ──

export function useAdminAllProposals(
  status?: string,
  limit?: number,
  offset?: number,
) {
  return useQuery({
    queryKey: adminEditKeys.allProposals({ status, limit, offset }),
    queryFn: async () => {
      const params: Record<string, string | number> = {}
      if (status) params.status = status
      if (limit) params.limit = limit
      if (offset) params.offset = offset
      const { data } = await apiClient.get<MediaEditProposalList>(
        "/admin/edit-proposals",
        { params },
      )
      return data
    },
    staleTime: 30_000,
  })
}

export function useApproveAnyProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ mediaType, mediaId, proposalId }: { mediaType: string; mediaId: string; proposalId: string }) => {
      const { data } = await apiClient.post<MediaEditProposal>(
        `/media/${mediaType}/${mediaId}/edit-proposals/${proposalId}/approve`
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminEditKeys.all() })
      queryClient.invalidateQueries({ queryKey: ["media"] })
      queryClient.invalidateQueries({ queryKey: ["discover"] })
    },
  })
}

export function useRejectAnyProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      mediaType,
      mediaId,
      proposalId,
      reason,
    }: {
      mediaType: string
      mediaId: string
      proposalId: string
      reason: string | null
    }) => {
      const { data } = await apiClient.post<MediaEditProposal>(
        `/media/${mediaType}/${mediaId}/edit-proposals/${proposalId}/reject`,
        { rejectionReason: reason },
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminEditKeys.all() })
    },
  })
}

export function useUndoAnyProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ mediaType, mediaId, proposalId }: { mediaType: string; mediaId: string; proposalId: string }) => {
      const { data } = await apiClient.post<MediaEditProposal>(
        `/media/${mediaType}/${mediaId}/edit-proposals/${proposalId}/undo`,
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminEditKeys.all() })
      queryClient.invalidateQueries({ queryKey: ["media"] })
      queryClient.invalidateQueries({ queryKey: ["discover"] })
    },
  })
}

// ── Proposal voting hooks ──

export function useProposalVote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      mediaType,
      mediaId,
      proposalId,
      voteType,
    }: {
      mediaType: string
      mediaId: string
      proposalId: string
      voteType: 'up' | 'down'
    }) => {
      const { data } = await apiClient.post<VoteResponse>(
        `/media/${mediaType}/${mediaId}/edit-proposals/${proposalId}/vote`,
        { vote_type: voteType },
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminEditKeys.all() })
    },
  })
}

export function useRemoveProposalVote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      mediaType,
      mediaId,
      proposalId,
    }: {
      mediaType: string
      mediaId: string
      proposalId: string
    }) => {
      await apiClient.delete(
        `/media/${mediaType}/${mediaId}/edit-proposals/${proposalId}/vote`,
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminEditKeys.all() })
    },
  })
}
