import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/providers/auth'
import { useToast } from '@/old-features/dk-ui/molecules/toast'
import { showXPToast } from '@/old-features/dk-ui/atoms/xp-toast'
import {
  Loader2,
  AlertTriangle,
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProposals, useApproveProposal, useRejectProposal, useUndoProposal, useVoteOnProposal, useRemoveVote } from '../proposals-queries'
import { ProposalCard } from '../components/molecules/proposal-card'

// XP constants — mirrors backend
const PROPOSAL_MIN_XP = 500
const ADMIN_XP = { PROPOSAL_APPROVE: 100, PROPOSAL_REJECT: 30 } as const

const TYPE_TABS = [
  { value: undefined, label: 'All' },
  { value: 'match', label: 'Game Match' },
  { value: 'edit', label: 'Media Edit' },
] as const

const STATUS_TABS = [
  { value: undefined, label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
] as const

const PAGE_SIZE = 20

export function ProposalsPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [typeFilter, setTypeFilter] = useState<string | undefined>()
  const [statusFilter, setStatusFilter] = useState<string | undefined>('pending')
  const [offset, setOffset] = useState(0)

  const isAdmin = user?.isAdmin ?? false
  const isTrusted = isAdmin || (user?.totalXp ?? 0) >= PROPOSAL_MIN_XP

  const { data, isLoading, isError, refetch } = useProposals({
    type: typeFilter,
    status: statusFilter,
    limit: PAGE_SIZE,
    offset,
  })

  const approveMutation = useApproveProposal()
  const rejectMutation = useRejectProposal()
  const undoMutation = useUndoProposal()
  const voteMutation = useVoteOnProposal()
  const removeVoteMutation = useRemoveVote()

  const handleApprove = async (id: string) => {
    try {
      await approveMutation.mutateAsync(id)
      showXPToast(ADMIN_XP.PROPOSAL_APPROVE)
      toast({ title: 'Proposal approved', variant: 'success' })
    } catch {
      toast({ title: 'Failed to approve', variant: 'error' })
    }
  }

  const handleReject = async (id: string, reason?: string) => {
    try {
      await rejectMutation.mutateAsync({ proposalId: id, reason })
      showXPToast(ADMIN_XP.PROPOSAL_REJECT)
      toast({ title: 'Proposal rejected', variant: 'success' })
    } catch {
      toast({ title: 'Failed to reject', variant: 'error' })
    }
  }

  const handleUndo = async (id: string) => {
    try {
      await undoMutation.mutateAsync(id)
      toast({ title: 'Approval undone', variant: 'success' })
    } catch {
      toast({ title: 'Failed to undo', variant: 'error' })
    }
  }

  const handleVote = async (id: string, voteType: 'up' | 'down') => {
    try {
      await voteMutation.mutateAsync({ proposalId: id, voteType })
    } catch {
      toast({ title: 'Failed to vote', variant: 'error' })
    }
  }

  const handleRemoveVote = async (id: string) => {
    try {
      await removeVoteMutation.mutateAsync(id)
    } catch {
      toast({ title: 'Failed to remove vote', variant: 'error' })
    }
  }

  // Reset pagination when filters change
  useEffect(() => { setOffset(0) }, [typeFilter, statusFilter])

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="p-6 min-h-full">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
          <Filter className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-white">Proposals</h1>
            {total > 0 && (
              <span className="text-sm text-white/40">
                {data?.items.filter(p => p.status === 'pending').length ?? 0} pending
              </span>
            )}
          </div>
          <p className="text-sm text-white/50 mt-0.5">
            Review and manage community edit proposals and game match proposals
          </p>
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="flex gap-2 mb-3">
        {TYPE_TABS.map(tab => (
          <button
            key={tab.label}
            onClick={() => setTypeFilter(tab.value)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
              typeFilter === tab.value
                ? 'bg-white/10 text-white'
                : 'text-white/50 hover:text-white hover:bg-white/5',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-4">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.label}
            onClick={() => setStatusFilter(tab.value)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
              statusFilter === tab.value
                ? 'bg-white/10 text-white'
                : 'text-white/50 hover:text-white hover:bg-white/5',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
          <p className="text-sm text-white/50">Failed to load proposals</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg bg-white/10 text-white text-xs font-medium hover:bg-white/15 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && (!data || data.items.length === 0) && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          {statusFilter === 'pending' ? (
            <Clock className="h-10 w-10 text-white/20" />
          ) : statusFilter === 'approved' ? (
            <CheckCircle2 className="h-10 w-10 text-emerald-400/30" />
          ) : (
            <XCircle className="h-10 w-10 text-white/20" />
          )}
          <p className="text-sm text-white/40">
            {statusFilter ? `No ${statusFilter} proposals` : 'No proposals yet'}
          </p>
          {typeFilter && (
            <p className="text-xs text-white/30">
              for {typeFilter === 'match' ? 'game matches' : 'media edits'}
            </p>
          )}
        </div>
      )}

      {/* Proposal list */}
      {data && data.items.length > 0 && (
        <>
          <div className="space-y-3">
            {data.items.map(proposal => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                isAdmin={isAdmin}
                isTrusted={isTrusted}
                onApprove={handleApprove}
                onReject={handleReject}
                onUndo={handleUndo}
                onVote={handleVote}
                onRemoveVote={handleRemoveVote}
                isApproving={approveMutation.isPending}
                isRejecting={rejectMutation.isPending}
                isUndoing={undoMutation.isPending}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
                className="px-4 py-2 rounded-lg bg-white/5 text-white/60 text-xs font-medium hover:bg-white/10 hover:text-white/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs text-white/40">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total}
                className="px-4 py-2 rounded-lg bg-white/5 text-white/60 text-xs font-medium hover:bg-white/10 hover:text-white/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
