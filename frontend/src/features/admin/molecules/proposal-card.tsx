// TODO: Review this file
import { useState } from 'react'
import { Check, X, ChevronDown, Bot, Undo2, ThumbsUp, ThumbsDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ExperimentGuard } from '@/features/experiments/molecules/experiment-guard'
import type { MediaEditProposal, ImageOverrideItem } from '../admin-edit-queries'
import './proposal-card.scss'

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
 <div className="dk-admin-proposal-card">
 {/* Header */}
 <div
  role="button"
  tabIndex={0}
  onClick={() => setExpanded(!expanded)}
  onKeyDown={(e) => {
   if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    setExpanded(!expanded)
   }
  }}
  className="dk-admin-proposal-card__header"
 >
 <div className="dk-admin-proposal-card__header-inner">
 {/* Media poster thumbnail */}
 {showMediaInfo && (
 proposal.mediaPosterUrl ? (
 <img
 src={proposal.mediaPosterUrl}
 alt=""
 className="dk-admin-proposal-card__thumbnail"
 />
 ) : (
 <div className="dk-admin-proposal-card__thumbnail-placeholder">
 <span className="dk-admin-proposal-card__thumbnail-placeholder-text">—</span>
 </div>
 )
 )}

 <div className="dk-admin-proposal-card__content">
 {/* Media title + type badge */}
 {showMediaInfo && (
 <div className="dk-admin-proposal-card__media-title-row">
 <span className="dk-admin-proposal-card__media-title">
 {proposal.mediaTitle || 'Unknown Media'}
 </span>
 {proposal.mediaType && (
 <span className="dk-admin-proposal-card__media-type-badge">
 {MEDIA_TYPE_LABELS[proposal.mediaType] ?? proposal.mediaType}
 </span>
 )}
 </div>
 )}

 {/* Proposer + status */}
 <div className="dk-admin-proposal-card__proposer-row">
 {proposal.proposer ? (
 <span className="dk-admin-proposal-card__proposer-name">
 {proposal.proposer.username}
 </span>
 ) : (
 <span className="dk-admin-proposal-card__system-badge">
 <Bot className="h-3 w-3" />
 System
 </span>
 )}
 <span
 className={cn('dk-admin-proposal-card__status-badge', `dk-admin-proposal-card__status-badge--${proposal.status}`)}
 >
 {badge.label}
 </span>
 </div>

 {/* Change summary */}
 <p className="dk-admin-proposal-card__summary">
 {changeSummary(proposal)}
 </p>

 {/* Approver info */}
 {proposal.approver && (
 <p className="dk-admin-proposal-card__approver">
 {proposal.status === 'approved' ? 'Approved by' : 'Rejected by'}{' '}
 {proposal.approver.username}
 </p>
 )}

 <p className="dk-admin-proposal-card__timestamp">
 {new Date(proposal.createdAt).toLocaleString()}
 </p>
 </div>

 {/* Actions */}
 <div className="dk-admin-proposal-card__actions">
 {isPending && !isProposer && !rejecting && (
 <>
 {/* Voting buttons — gated behind experiment */}
 {canVote && (
 <ExperimentGuard feature="community_edit_proposals">
 <div className="dk-admin-proposal-card__vote-group" onClick={(e) => e.stopPropagation()}>
 <button
 type="button"
 onClick={(e) => handleVote(e, 'up')}
 disabled={isVoting}
 className={cn(
 'dk-admin-proposal-card__vote-btn dk-admin-proposal-card__vote-btn--up',
 proposal.myVote === 'up' && 'dk-admin-proposal-card__vote-btn--up-active',
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
 'dk-admin-proposal-card__vote-btn dk-admin-proposal-card__vote-btn--down',
 proposal.myVote === 'down' && 'dk-admin-proposal-card__vote-btn--down-active',
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
 className="dk-admin-proposal-card__action-approve"
 >
 <Check className="h-3.5 w-3.5" />
 Approve
 </button>
 <button
 type="button"
 onClick={handleRejectClick}
 className="dk-admin-proposal-card__action-reject"
 >
 <X className="h-3.5 w-3.5" />
 Reject
 </button>
 </>
 )}

 {isPending && isProposer && (
 <span className="dk-admin-proposal-card__awaiting">
 Awaiting review
 </span>
 )}

 {isApproved && isApprover && (
 <button
 type="button"
 onClick={handleUndo}
 disabled={isUndoing}
 className="dk-admin-proposal-card__action-undo"
 >
 <Undo2 className="h-3.5 w-3.5" />
 Undo
 </button>
 )}

 <ChevronDown
 className={cn(
 'dk-admin-proposal-card__chevron',
 expanded && 'dk-admin-proposal-card__chevron--expanded',
 )}
 />
 </div>
 </div>
 </div>

 {/* Reject reason input */}
 {rejecting && (
 <div className="dk-admin-proposal-card__reject-area">
 <input
 type="text"
 value={rejectReason}
 onChange={(e) => setRejectReason(e.target.value)}
 placeholder="Reason for rejection (optional)"
 className="dk-admin-proposal-card__reject-input"
 onKeyDown={(e) => { if (e.key === 'Enter') handleRejectConfirm() }}
 autoFocus
 />
 <div className="dk-admin-proposal-card__reject-actions">
 <button
 type="button"
 onClick={handleRejectConfirm}
 disabled={isRejecting}
 className="dk-admin-proposal-card__reject-confirm"
 >
 Confirm Reject
 </button>
 <button
 type="button"
 onClick={() => setRejecting(false)}
 className="dk-admin-proposal-card__reject-cancel"
 >
 Cancel
 </button>
 </div>
 </div>
 )}

 {/* Rejection reason display */}
 {proposal.rejectionReason && !rejecting && (
 <div className="dk-admin-proposal-card__rejection-reason">
 <p className="dk-admin-proposal-card__rejection-reason-text">Reason: {proposal.rejectionReason}</p>
 </div>
 )}

 {/* Expanded diff view */}
 {expanded && (
 <div className="dk-admin-proposal-card__expanded">
 <div className="dk-admin-proposal-card__diff">
 {/* Field changes */}
 {changedFields.length > 0 && (
 <div className="dk-admin-proposal-card__fields-section">
 <h4 className="dk-admin-proposal-card__section-heading">
 Field Changes
 </h4>
 <div className="dk-admin-proposal-card__fields-grid">
 {changedFields.map((key) => (
 <div key={key} className="dk-admin-proposal-card__field-row">
 <span className="dk-admin-proposal-card__field-label">
 {FIELD_LABELS[key] ?? key}
 </span>
 <span className="dk-admin-proposal-card__field-arrow">→</span>
 <span className="dk-admin-proposal-card__field-value">
 {String((proposal.changes as Record<string, unknown>)[key])}
 </span>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Image overrides */}
 {proposal.imageOverrides && proposal.imageOverrides.length > 0 && (
 <div className="dk-admin-proposal-card__images-section">
 <h4 className="dk-admin-proposal-card__section-heading">
 Image Overrides
 </h4>
 <div className="dk-admin-proposal-card__images-grid">
 {proposal.imageOverrides.map((ov: ImageOverrideItem, i: number) => (
 <div
 key={i}
 className="dk-admin-proposal-card__image-item"
 >
 <img
 src={ov.url}
 alt=""
 className="dk-admin-proposal-card__image-img"
 />
 <div className="dk-admin-proposal-card__image-info">
 <p className="dk-admin-proposal-card__image-title">
 {IMAGE_TYPE_LABELS[ov.imageType] ?? ov.imageType}
 </p>
 <p className="dk-admin-proposal-card__image-lang">
 Language: {ov.languageCode}
 </p>
 <p className="dk-admin-proposal-card__image-url">
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
 <p className="dk-admin-proposal-card__no-changes">
 No changes recorded in this proposal.
 </p>
 )}
 </div>
 </div>
 )}
 </div>
 )
}
