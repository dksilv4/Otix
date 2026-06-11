// TODO: Review this file
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Navigate } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/features/dk-ui/molecules/toast'
import { showXPToast } from '@/features/dk-ui/atoms/xp-toast'
import {
  useAdminAllProposals,
  useApproveAnyProposal,
  useRejectAnyProposal,
  useUndoAnyProposal,
  useProposalVote,
  useRemoveProposalVote,
  ADMIN_XP,
  PROPOSAL_MIN_XP,
  type MediaEditProposal,
} from '../admin-edit-queries'
import { ProposalCard } from '../molecules/proposal-card'
import { Loader2, AlertTriangle } from 'lucide-react'

const STATUS_TABS = [
  { value: undefined, label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
] as const

const PAGE_SIZE = 20

export function AdminProposalsPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [statusFilter, setStatusFilter] = useState<string | undefined>('pending')
  const [offset, setOffset] = useState(0)

  const { data, isLoading, isError, refetch } = useAdminAllProposals(
    statusFilter,
    PAGE_SIZE,
    offset,
  )
  const approveMutation = useApproveAnyProposal()
  const rejectMutation = useRejectAnyProposal()
  const undoMutation = useUndoAnyProposal()
  const voteMutation = useProposalVote()
  const removeVoteMutation = useRemoveProposalVote()

  if (!user?.isAdmin) return <Navigate to="/" />

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const isTrustedUser = user.isAdmin || (user.totalXp ?? 0) >= PROPOSAL_MIN_XP

  const handleApprove = async (proposal: MediaEditProposal) => {
    try {
      await approveMutation.mutateAsync({
        mediaId: proposal.mediaItemId,
        proposalId: proposal.id,
      })
      showXPToast(ADMIN_XP.PROPOSAL_APPROVE)
      toast({ title: 'Proposal approved', variant: 'success' })
    } catch {
      toast({ title: 'Failed to approve proposal', variant: 'error' })
    }
  }

  const handleReject = async (proposal: MediaEditProposal, reason: string | null) => {
    try {
      await rejectMutation.mutateAsync({
        mediaId: proposal.mediaItemId,
        proposalId: proposal.id,
        reason,
      })
      showXPToast(ADMIN_XP.PROPOSAL_REJECT)
      toast({ title: 'Proposal rejected', variant: 'success' })
    } catch {
      toast({ title: 'Failed to reject proposal', variant: 'error' })
    }
  }

  const handleUndo = async (proposal: MediaEditProposal) => {
    try {
      await undoMutation.mutateAsync({
        mediaId: proposal.mediaItemId,
        proposalId: proposal.id,
      })
      toast({ title: 'Approval undone', variant: 'success' })
    } catch {
      toast({ title: 'Failed to undo approval', variant: 'error' })
    }
  }

  const handleVote = async (proposal: MediaEditProposal, voteType: 'up' | 'down') => {
    try {
      await voteMutation.mutateAsync({
        mediaId: proposal.mediaItemId,
        proposalId: proposal.id,
        voteType,
      })
    } catch {
      toast({ title: 'Failed to vote', variant: 'error' })
    }
  }

  const handleRemoveVote = async (proposal: MediaEditProposal) => {
    try {
      await removeVoteMutation.mutateAsync({
        mediaId: proposal.mediaItemId,
        proposalId: proposal.id,
      })
    } catch {
      toast({ title: 'Failed to remove vote', variant: 'error' })
    }
  }

  return (
    <div className="dk-admin-proposals">
      <Helmet>
        <title>Edit Proposals — Otix Admin</title>
      </Helmet>

      <div className="dk-admin-proposals__header">
        <h1 className="dk-admin-proposals__title">Edit Proposals</h1>
        <p className="dk-admin-proposals__subtitle">
          Review and manage media edit proposals across all content
        </p>
      </div>

      {/* Status filter tabs */}
      <div className="dk-admin-proposals__tabs">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => { setStatusFilter(tab.value); setOffset(0) }}
            className="dk-admin-proposals__tab"
            style={{
              background: statusFilter === tab.value ? 'var(--dk-surface-base)' : 'transparent',
              color: statusFilter === tab.value ? 'var(--foreground)' : 'var(--muted-foreground)',
              boxShadow: statusFilter === tab.value ? 'var(--dk-shadow-sm)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="dk-admin-proposals__loading">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="dk-admin-proposals__error">
          <AlertTriangle className="h-8 w-8 text-amber-400" />
          <p className="dk-admin-proposals__error-text">Failed to load proposals</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="dk-admin-proposals__retry-btn"
          >
            Retry
          </button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="dk-admin-proposals__empty">
          <p className="dk-admin-proposals__empty-text">
            {statusFilter
              ? `No ${statusFilter} proposals`
              : 'No proposals yet'}
          </p>
        </div>
      ) : (
        <>
          <div className="dk-admin-proposals__list">
            {data.items.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                currentUserId={user.id}
                showMediaInfo
                isTrustedUser={isTrustedUser}
                isApproving={approveMutation.isPending}
                isRejecting={rejectMutation.isPending}
                isUndoing={undoMutation.isPending}
                onApprove={handleApprove}
                onReject={handleReject}
                onUndo={handleUndo}
                onVote={handleVote}
                onRemoveVote={handleRemoveVote}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="dk-admin-proposals__pagination">
              <button
                type="button"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
                className="dk-admin-proposals__page-btn"
              >
                Previous
              </button>
              <span className="dk-admin-proposals__page-info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total}
                className="dk-admin-proposals__page-btn"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
