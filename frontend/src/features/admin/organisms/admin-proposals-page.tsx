import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Navigate } from '@tanstack/react-router'
import { useAuth } from '@/features/auth/auth-provider'
import { useToast } from '@/features/dk-ui/molecules/toast'
import { showXPToast } from '@/features/dk-ui/atoms/xp-toast'
import {
  useAdminAllProposals,
  useApproveAnyProposal,
  useRejectAnyProposal,
  useUndoAnyProposal,
  ADMIN_XP,
  type MediaEditProposal,
  type ImageOverrideItem,
} from '../admin-edit-queries'
import {
  Check,
  X,
  ChevronDown,
  Bot,
  Undo2,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const IMAGE_TYPE_LABELS: Record<string, string> = {
  poster: 'Poster',
  backdrop: 'Backdrop',
  logo: 'Logo',
  textless_poster: 'Textless Poster',
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  overview: 'Overview',
  tagline: 'Tagline',
  status: 'Status',
  release_date: 'Release Date',
  original_language: 'Original Language',
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  movie: 'Movie',
  show: 'TV Show',
  music: 'Music',
  game: 'Game',
}

const STATUS_TABS = [
  { value: undefined, label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
] as const

const PAGE_SIZE = 20

function changeSummary(proposal: MediaEditProposal): string {
  const parts: string[] = []
  const changedFields = Object.keys(proposal.changes ?? {})
  if (changedFields.length > 0) {
    parts.push('Changed ' + changedFields.join(', '))
  }
  if (proposal.imageOverrides && proposal.imageOverrides.length > 0) {
    const types = proposal.imageOverrides.map(
      (o) => `${IMAGE_TYPE_LABELS[o.imageType] ?? o.imageType} (${o.languageCode})`,
    )
    parts.push('Overrode ' + types.join(', '))
  }
  return parts.join('; ') || 'No changes recorded'
}

function statusBadge(status: string) {
  switch (status) {
    case 'approved':
      return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Approved' }
    case 'rejected':
      return { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Rejected' }
    default:
      return { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Pending' }
  }
}

export function AdminProposalsPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [statusFilter, setStatusFilter] = useState<string | undefined>('pending')
  const [offset, setOffset] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const { data, isLoading, isError, refetch } = useAdminAllProposals(
    statusFilter,
    PAGE_SIZE,
    offset,
  )
  const approveMutation = useApproveAnyProposal()
  const rejectMutation = useRejectAnyProposal()
  const undoMutation = useUndoAnyProposal()

  if (!user?.isAdmin) return <Navigate to="/" />

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

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

  const handleReject = async (proposal: MediaEditProposal) => {
    try {
      await rejectMutation.mutateAsync({
        mediaId: proposal.mediaItemId,
        proposalId: proposal.id,
        reason: rejectReason || null,
      })
      showXPToast(ADMIN_XP.PROPOSAL_REJECT)
      setRejectingId(null)
      setRejectReason('')
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

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Helmet>
        <title>Edit Proposals — Otix Admin</title>
      </Helmet>

      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Edit Proposals</h1>
        <p className="text-sm text-muted-foreground">
          Review and manage media edit proposals across all content
        </p>
      </div>

      {/* Status filter tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-[var(--dk-surface-ghost)] p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => { setStatusFilter(tab.value); setOffset(0) }}
            className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors"
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
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-400" />
          <p className="text-sm text-muted-foreground">Failed to load proposals</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Retry
          </button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {statusFilter
              ? `No ${statusFilter} proposals`
              : 'No proposals yet'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {data.items.map((proposal) => {
              const badge = statusBadge(proposal.status)
              const isProposer = proposal.proposerUserId != null && proposal.proposerUserId === user.id
              const isApprover = proposal.approverUserId != null && proposal.approverUserId === user.id
              const isPending = proposal.status === 'pending'
              const isApproved = proposal.status === 'approved'
              const isExpanded = expandedId === proposal.id
              const changedFields = Object.keys(proposal.changes ?? {})

              return (
                <div
                  key={proposal.id}
                  className="rounded-2xl border border-[var(--dk-border)] bg-[var(--dk-surface-glass)] overflow-hidden"
                >
                  {/* Header */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : proposal.id)}
                    className="w-full p-4 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      {/* Media poster thumbnail */}
                      {proposal.mediaPosterUrl ? (
                        <img
                          src={proposal.mediaPosterUrl}
                          alt=""
                          className="h-16 w-12 shrink-0 rounded-lg object-cover bg-black/20"
                        />
                      ) : (
                        <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--dk-surface-ghost)]">
                          <span className="text-xs text-muted-foreground">—</span>
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-1">
                        {/* Media title + type badge */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate">
                            {proposal.mediaTitle || 'Unknown Media'}
                          </span>
                          {proposal.mediaType && (
                            <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {MEDIA_TYPE_LABELS[proposal.mediaType] ?? proposal.mediaType}
                            </span>
                          )}
                        </div>

                        {/* Proposer + status */}
                        <div className="flex items-center gap-2">
                          {proposal.proposer ? (
                            <span className="text-xs font-medium">
                              {proposal.proposer.username}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400">
                              <Bot className="h-3 w-3" />
                              System
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.bg} ${badge.text}`}
                          >
                            {badge.label}
                          </span>
                        </div>

                        {/* Change summary */}
                        <p className="text-xs text-muted-foreground truncate">
                          {changeSummary(proposal)}
                        </p>

                        {/* Approver info */}
                        {proposal.approver && (
                          <p className="text-xs text-muted-foreground">
                            {proposal.status === 'approved' ? 'Approved by' : 'Rejected by'}{' '}
                            {proposal.approver.username}
                          </p>
                        )}

                        <p className="text-[10px] text-muted-foreground/60">
                          {new Date(proposal.createdAt).toLocaleString()}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-2">
                        {isPending && !isProposer && rejectingId !== proposal.id && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleApprove(proposal) }}
                              disabled={approveMutation.isPending}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setRejectingId(proposal.id)
                                setRejectReason('')
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                              Reject
                            </button>
                          </>
                        )}

                        {isPending && isProposer && (
                          <span className="text-[10px] text-muted-foreground/60">
                            Awaiting review
                          </span>
                        )}

                        {isApproved && isApprover && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleUndo(proposal) }}
                            disabled={undoMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            Undo
                          </button>
                        )}

                        <ChevronDown
                          className={cn(
                            'h-4 w-4 text-muted-foreground transition-transform duration-200',
                            isExpanded && 'rotate-180',
                          )}
                        />
                      </div>
                    </div>
                  </button>

                  {/* Reject reason input */}
                  {rejectingId === proposal.id && (
                    <div className="px-4 pb-4 space-y-2">
                      <input
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Reason for rejection (optional)"
                        className="w-full rounded-lg border border-[var(--dk-border)] bg-[var(--dk-surface-ghost)] px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:outline-none"
                      />
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleReject(proposal)}
                          disabled={rejectMutation.isPending}
                          className="rounded-lg bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                        >
                          Confirm Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectingId(null)}
                          className="rounded-lg px-3 py-1 text-xs text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Rejection reason display */}
                  {proposal.rejectionReason && rejectingId !== proposal.id && (
                    <div className="px-4 pb-3">
                      <p className="text-xs text-red-400">Reason: {proposal.rejectionReason}</p>
                    </div>
                  )}

                  {/* Expanded diff view */}
                  {isExpanded && (
                    <div className="border-t border-[var(--dk-border)]">
                      <div className="m-3 rounded-xl border-2 border-primary/25 ring-2 ring-primary/5 p-4 space-y-4">
                        {/* Field changes */}
                        {changedFields.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Field Changes
                            </h4>
                            <div className="grid gap-1.5">
                              {changedFields.map((key) => (
                                <div key={key} className="flex items-center gap-2 text-xs">
                                  <span className="w-36 shrink-0 text-muted-foreground">
                                    {FIELD_LABELS[key] ?? key}
                                  </span>
                                  <span className="text-primary/60">→</span>
                                  <span className="font-medium text-emerald-400">
                                    {String((proposal.changes as Record<string, unknown>)[key])}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Image overrides */}
                        {proposal.imageOverrides && proposal.imageOverrides.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Image Overrides
                            </h4>
                            <div className="grid gap-2">
                              {proposal.imageOverrides.map((ov: ImageOverrideItem, i: number) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-3 rounded-xl border border-[var(--dk-border)] bg-[var(--dk-surface-base)] p-2"
                                >
                                  <img
                                    src={ov.url}
                                    alt=""
                                    className="h-16 w-12 shrink-0 rounded-lg object-cover bg-black/30"
                                  />
                                  <div className="min-w-0 space-y-0.5">
                                    <p className="text-xs font-medium text-foreground">
                                      {IMAGE_TYPE_LABELS[ov.imageType] ?? ov.imageType}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                      Language: {ov.languageCode}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground/60 truncate">
                                      {ov.url}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* No changes */}
                        {changedFields.length === 0 && (!proposal.imageOverrides || proposal.imageOverrides.length === 0) && (
                          <p className="text-xs text-muted-foreground/60 italic">
                            No changes recorded in this proposal.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
                className="rounded-lg bg-[var(--dk-surface-ghost)] px-3 py-1.5 text-xs font-medium text-foreground hover:bg-[var(--dk-surface-ghost-hover)] disabled:opacity-30 transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total}
                className="rounded-lg bg-[var(--dk-surface-ghost)] px-3 py-1.5 text-xs font-medium text-foreground hover:bg-[var(--dk-surface-ghost-hover)] disabled:opacity-30 transition-colors"
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
