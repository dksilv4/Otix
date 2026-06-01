import { useState } from 'react'
import { Check, X, ChevronDown, Bot, Undo2, ThumbsUp, ThumbsDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ExperimentGuard } from '@/features/experiments/molecules/experiment-guard'
import type { MediaEditProposal, ImageOverrideItem } from '../admin-edit-queries'

export const IMAGE_TYPE_LABELS: Record<string, string> = {
  poster: 'Poster',
  backdrop: 'Backdrop',
  logo: 'Logo',
  textless_poster: 'Textless Poster',
}

export const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  overview: 'Overview',
  tagline: 'Tagline',
  status: 'Status',
  release_date: 'Release Date',
  original_language: 'Original Language',
  runtime: 'Runtime',
}

export function changeSummary(proposal: MediaEditProposal): string {
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

export function statusBadge(status: string) {
  switch (status) {
    case 'approved':
      return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Approved' }
    case 'rejected':
      return { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Rejected' }
    default:
      return { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Pending' }
  }
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  movie: 'Movie',
  show: 'TV Show',
  music: 'Music',
  game: 'Game',
}

export interface ProposalCardProps {
  proposal: MediaEditProposal
  currentUserId: string
  showMediaInfo?: boolean
  isTrustedUser?: boolean
  isApproving?: boolean
  isRejecting?: boolean
  isUndoing?: boolean
  isVoting?: boolean
  onApprove: (proposal: MediaEditProposal) => void
  onReject: (proposal: MediaEditProposal, reason: string | null) => void
  onUndo: (proposal: MediaEditProposal) => void
  onVote?: (proposal: MediaEditProposal, voteType: 'up' | 'down') => void
  onRemoveVote?: (proposal: MediaEditProposal) => void
}

export function ProposalCard({
  proposal,
  currentUserId,
  showMediaInfo = true,
  isTrustedUser = false,
  isApproving = false,
  isRejecting = false,
  isUndoing = false,
  isVoting = false,
  onApprove,
  onReject,
  onUndo,
  onVote,
  onRemoveVote,
}: ProposalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const badge = statusBadge(proposal.status)
  const isProposer = proposal.proposerUserId != null && proposal.proposerUserId === currentUserId
  const isApprover = proposal.approverUserId != null && proposal.approverUserId === currentUserId
  const isPending = proposal.status === 'pending'
  const isApproved = proposal.status === 'approved'
  const changedFields = Object.keys(proposal.changes ?? {})
  const canVote = isTrustedUser && isPending && !isProposer && onVote

  const handleApprove = (e: React.MouseEvent) => {
    e.stopPropagation()
    onApprove(proposal)
  }

  const handleRejectClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setRejecting(true)
    setRejectReason('')
  }

  const handleRejectConfirm = () => {
    onReject(proposal, rejectReason || null)
    setRejecting(false)
    setRejectReason('')
  }

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation()
    onUndo(proposal)
  }

  const handleVote = (e: React.MouseEvent, voteType: 'up' | 'down') => {
    e.stopPropagation()
    if (proposal.myVote === voteType) {
      onRemoveVote?.(proposal)
    } else {
      onVote?.(proposal, voteType)
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--dk-border)] bg-[var(--dk-surface-glass)] overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-start gap-4">
          {/* Media poster thumbnail */}
          {showMediaInfo && (
            proposal.mediaPosterUrl ? (
              <img
                src={proposal.mediaPosterUrl}
                alt=""
                className="h-16 w-12 shrink-0 rounded-lg object-cover bg-black/20"
              />
            ) : (
              <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--dk-surface-ghost)]">
                <span className="text-xs text-muted-foreground">—</span>
              </div>
            )
          )}

          <div className="min-w-0 flex-1 space-y-1">
            {/* Media title + type badge */}
            {showMediaInfo && (
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
            )}

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
            {isPending && !isProposer && !rejecting && (
              <>
                {/* Voting buttons — gated behind experiment */}
                {canVote && (
                  <ExperimentGuard feature="community_edit_proposals">
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => handleVote(e, 'up')}
                        disabled={isVoting}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium transition-colors',
                          proposal.myVote === 'up'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'text-muted-foreground hover:text-emerald-400',
                        )}
                      >
                        <ThumbsUp className="h-3 w-3" />
                        {proposal.upvoteCount > 0 && (
                          <span className="tabular-nums">{proposal.upvoteCount}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleVote(e, 'down')}
                        disabled={isVoting}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium transition-colors',
                          proposal.myVote === 'down'
                            ? 'bg-red-500/20 text-red-400'
                            : 'text-muted-foreground hover:text-red-400',
                        )}
                      >
                        <ThumbsDown className="h-3 w-3" />
                        {proposal.downvoteCount > 0 && (
                          <span className="tabular-nums">{proposal.downvoteCount}</span>
                        )}
                      </button>
                    </div>
                  </ExperimentGuard>
                )}
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={handleRejectClick}
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
                onClick={handleUndo}
                disabled={isUndoing}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </button>
            )}

            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform duration-200',
                expanded && 'rotate-180',
              )}
            />
          </div>
        </div>
      </button>

      {/* Reject reason input */}
      {rejecting && (
        <div className="px-4 pb-4 space-y-2">
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (optional)"
            className="w-full rounded-lg border border-[var(--dk-border)] bg-[var(--dk-surface-ghost)] px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:outline-none"
            onKeyDown={(e) => { if (e.key === 'Enter') handleRejectConfirm() }}
            autoFocus
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleRejectConfirm}
              disabled={isRejecting}
              className="rounded-lg bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              Confirm Reject
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="rounded-lg px-3 py-1 text-xs text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rejection reason display */}
      {proposal.rejectionReason && !rejecting && (
        <div className="px-4 pb-3">
          <p className="text-xs text-red-400">Reason: {proposal.rejectionReason}</p>
        </div>
      )}

      {/* Expanded diff view */}
      {expanded && (
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
}
