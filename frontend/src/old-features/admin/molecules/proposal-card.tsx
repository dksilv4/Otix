// TODO: Review this file
import { useState } from 'react'
import { X, ChevronDown, Bot, Undo2, ThumbsUp, ThumbsDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ExperimentGuard } from '@/features/experiments/molecules/experiment-guard'
import type { MediaEditProposal, ImageOverrideItem } from '../admin-edit-queries'
import './proposal-card.scss'

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
  runtime: 'Runtime',
}

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

export function ProposalCard({
  proposal,
  onApprove,
  onReject,
  onRollback,
}: {
  proposal: MediaEditProposal
  onApprove: (proposal: MediaEditProposal) => void
  onReject: (proposal: MediaEditProposal, reason?: string) => void
  onRollback?: (proposal: MediaEditProposal) => void
  currentUserId?: string
  showMediaInfo?: boolean
  isTrustedUser?: boolean
  isApproving?: boolean
  isRejecting?: boolean
  isUndoing?: boolean
  onUndo?: (proposal: MediaEditProposal) => void
  onVote?: (proposal: MediaEditProposal, voteType: 'up' | 'down') => void
  onRemoveVote?: (proposal: MediaEditProposal) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const badge = statusBadge(proposal.status)

  return (
    <div className={cn('dk-proposal-card', `dk-proposal-card--${proposal.status}`)}>
      <ExperimentGuard feature="admin_edit">
        <div className="dk-proposal-card__header">
          <div className="dk-proposal-card__meta">
            <span className={cn('dk-proposal-card__badge', badge.bg, badge.text)}>{badge.label}</span>
            <span className="dk-proposal-card__date">
              {new Date(proposal.createdAt).toLocaleDateString()}
            </span>
            {proposal.proposer?.username && (
              <span className="dk-proposal-card__author">
                <Bot className="h-3 w-3" />
                {proposal.proposer.username}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="dk-proposal-card__expand"
          >
            <ChevronDown
              className={cn('dk-proposal-card__chevron', expanded && 'dk-proposal-card__chevron--open')}
            />
          </button>
        </div>

        <div className="dk-proposal-card__summary">
          {changeSummary(proposal)}
        </div>

        {expanded && (
          <div className="dk-proposal-card__details">
            {proposal.changes && Object.keys(proposal.changes).length > 0 && (
              <div className="dk-proposal-card__section">
                <h4 className="dk-proposal-card__section-title">Field Changes</h4>
                {Object.entries(proposal.changes).map(([field, change]) => (
                  <div key={field} className="dk-proposal-card__field">
                    <span className="dk-proposal-card__field-name">
                      {FIELD_LABELS[field] ?? field}
                    </span>
                    <div className="dk-proposal-card__field-values">
                      <span className="dk-proposal-card__field-old">
                        {String((change as { old: unknown }).old ?? '—')}
                      </span>
                      <span className="dk-proposal-card__field-arrow">→</span>
                      <span className="dk-proposal-card__field-new">
                        {String((change as { new: unknown }).new ?? '—')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {proposal.imageOverrides && proposal.imageOverrides.length > 0 && (
              <div className="dk-proposal-card__section">
                <h4 className="dk-proposal-card__section-title">Image Overrides</h4>
                {proposal.imageOverrides.map((override: ImageOverrideItem, i: number) => (
                  <div key={i} className="dk-proposal-card__image-override">
                    <span>{IMAGE_TYPE_LABELS[override.imageType] ?? override.imageType}</span>
                    <span className="dk-proposal-card__image-lang">{override.languageCode}</span>
                    {override.url && (
                      <img
                        src={override.url}
                        alt={`${override.imageType} preview`}
                        className="dk-proposal-card__image-preview"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {proposal.status === 'pending' && (
              <div className="dk-proposal-card__actions">
                <button
                  type="button"
                  onClick={() => onApprove(proposal)}
                  className="dk-proposal-card__btn dk-proposal-card__btn--approve"
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => setShowRejectInput(!showRejectInput)}
                  className="dk-proposal-card__btn dk-proposal-card__btn--reject"
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                  Reject
                </button>

                {showRejectInput && (
                  <div className="dk-proposal-card__reject-form">
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Reason (optional)..."
                      className="dk-proposal-card__reject-input"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onReject(proposal, rejectReason || undefined)
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => onReject(proposal, rejectReason || undefined)}
                      className="dk-proposal-card__btn dk-proposal-card__btn--confirm-reject"
                    >
                      <X className="h-3 w-3" />
                      Confirm
                    </button>
                  </div>
                )}
              </div>
            )}

            {proposal.status !== 'pending' && (
              <button
                type="button"
                onClick={() => onRollback?.(proposal)}
                className="dk-proposal-card__btn dk-proposal-card__btn--rollback"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Rollback
              </button>
            )}
          </div>
        )}
      </ExperimentGuard>
    </div>
  )
}
