import { useState } from 'react'
import {
  ChevronDown,
  ThumbsUp,
  ThumbsDown,
  Undo2,
  Gamepad2,
  ExternalLink,
  Image,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  Scan,
  Hash,
  Calendar,
  Building2,
  Tags,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Proposal } from '../../proposals-queries'

// ── Helpers ──────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  overview: 'Overview',
  tagline: 'Tagline',
  status: 'Status',
  release_date: 'Release Date',
  original_language: 'Language',
  runtime: 'Runtime',
  poster_url: 'Poster',
  backdrop_url: 'Backdrop',
  logo_url: 'Logo',
  textless_poster_url: 'Textless Poster',
}

const IMAGE_TYPE_LABELS: Record<string, string> = {
  poster: 'Poster',
  backdrop: 'Backdrop',
  logo: 'Logo',
  textless_poster: 'Textless Poster',
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  direct: 'Direct ID match',
  exact_title: 'Exact title match',
  ilike: 'Fuzzy title match',
  trigram: 'Similar title',
  igdb_crossref: 'IGDB cross-reference',
  igdb_search: 'IGDB search',
  igdb_fuzzy: 'IGDB fuzzy',
}

const STATUS_CONFIG = {
  pending: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Pending', icon: Clock },
  approved: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Approved', icon: CheckCircle2 },
  rejected: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Rejected', icon: XCircle },
} as const

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return s }
}

function ConfidenceBadge({ confidence, className }: { confidence: number; className?: string }) {
  const level = confidence >= 0.98 ? 'high' : confidence >= 0.90 ? 'medium' : confidence >= 0.80 ? 'low' : 'very-low'
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold',
      level === 'high' && 'bg-green-500/20 text-green-400',
      level === 'medium' && 'bg-blue-500/20 text-blue-400',
      level === 'low' && 'bg-amber-500/15 text-amber-400',
      level === 'very-low' && 'bg-white/5 text-white/40',
      className,
    )}>
      {Math.round(confidence * 100)}%
    </span>
  )
}

// ── Type-specific summary snippets ───────────────────────────────────

function MatchSummary({ proposal }: { proposal: Proposal }) {
  const p = proposal.payload as Record<string, any>
  return (
    <div className="flex items-center gap-2 text-xs text-white/60">
      <span className="font-mono uppercase text-[10px] tracking-wider text-white/30">{p.source}</span>
      <span className="text-white/20">→</span>
      <span className="text-green-400 font-medium">{p.otixTitle ?? p.otix_title}</span>
      <ConfidenceBadge confidence={p.otixConfidence ?? p.otix_confidence ?? 0} />
      <span className="text-white/30">{MATCH_TYPE_LABELS[p.matchType ?? p.match_type] ?? p.matchType ?? p.match_type}</span>
    </div>
  )
}

function EditSummary({ proposal }: { proposal: Proposal }) {
  const p = proposal.payload as Record<string, any>
  const changes = p.changes as Record<string, any> ?? {}
  const overrides = (p.imageOverrides ?? p.image_overrides) as any[] ?? []
  const parts: string[] = []
  const keys = Object.keys(changes)
  if (keys.length > 0) parts.push(`Changed: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ` +${keys.length - 3}` : ''}`)
  if (overrides.length > 0) parts.push(`Images: ${overrides.length}`)
  return (
    <div className="text-xs text-white/60">
      {parts.length > 0 ? parts.join(' · ') : 'No changes recorded'}
    </div>
  )
}

// ── Type-specific expanded details ───────────────────────────────────

function PosterSection({ src, label }: { src: string | null | undefined; label: string }) {
  return (
    <div className="w-full aspect-[2/3] rounded-lg overflow-hidden bg-white/5 flex items-center justify-center">
      {src ? (
        <img src={src} alt={label} className="w-full h-full object-cover" />
      ) : (
        <Gamepad2 className="h-8 w-8 text-white/20" />
      )}
    </div>
  )
}

function MatchDetails({ proposal }: { proposal: Proposal }) {
  const p = proposal.payload as Record<string, any>
  const confidence = p.otixConfidence ?? p.otix_confidence ?? 0
  const level = confidence >= 0.98 ? 'high' : confidence >= 0.90 ? 'medium' : confidence >= 0.80 ? 'low' : 'very-low'

  // Normalize payload keys (axios converts snake_case → camelCase)
  const source = p.source
  const sourceTitle = p.sourceTitle ?? p.source_title
  const sourceGameId = p.sourceGameId ?? p.source_game_id
  const developer = p.developer
  const releaseYear = p.releaseYear ?? p.release_year
  const posterUrl = p.posterUrl ?? p.poster_url
  const otixTitle = p.otixTitle ?? p.otix_title
  const otixMediaId = p.otixMediaId ?? p.otix_media_id
  const matchType = p.matchType ?? p.match_type

  const levelDescriptions: Record<string, { label: string; desc: string }> = {
    high: { label: 'High confidence — auto-approved', desc: 'Strong match, likely correct.' },
    medium: { label: 'Good confidence — review recommended', desc: 'Matches on title or cross-reference.' },
    low: { label: 'Low confidence — review carefully', desc: 'Weak title similarity or search result.' },
    'very-low': { label: 'Very low confidence', desc: 'Unlikely match, verify thoroughly.' },
  }

  const levelColors: Record<string, string> = {
    high: 'bg-green-500/10 border-green-500/20 text-green-400',
    medium: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    low: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    'very-low': 'bg-white/5 border-white/10 text-white/50',
  }

  return (
    <div className="space-y-4">
      {/* Confidence banner */}
      <div className={cn('rounded-lg border px-3 py-2', levelColors[level])}>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold">{Math.round(confidence * 100)}%</span>
          <div className="text-xs leading-tight">
            <p className="font-medium">{levelDescriptions[level].label}</p>
            <p className="opacity-70">{levelDescriptions[level].desc}</p>
          </div>
        </div>
        {/* Confidence bar */}
        <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              level === 'high' && 'bg-green-400',
              level === 'medium' && 'bg-blue-400',
              level === 'low' && 'bg-amber-400',
              level === 'very-low' && 'bg-white/30',
            )}
            style={{ width: `${Math.min(confidence * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Side-by-side posters + info */}
      <div className="grid grid-cols-2 gap-4">
        {/* Source column */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">
            <Scan className="h-3 w-3" />
            Source: {source}
          </div>
          <PosterSection src={posterUrl} label={`${sourceTitle} poster`} />
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-2.5 space-y-1.5">
            <p className="text-sm font-semibold text-white leading-tight">{sourceTitle ?? '—'}</p>
            {developer && (
              <div className="flex items-center gap-1 text-[10px] text-white/40">
                <Building2 className="h-3 w-3 shrink-0" />
                {developer}
              </div>
            )}
            {releaseYear && (
              <div className="flex items-center gap-1 text-[10px] text-white/40">
                <Calendar className="h-3 w-3 shrink-0" />
                {releaseYear}
              </div>
            )}
            <div className="flex items-center gap-1 text-[10px] text-white/30 font-mono">
              <Hash className="h-3 w-3 shrink-0" />
              {sourceGameId}
            </div>
          </div>
        </div>

        {/* Otix column */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-green-400">
            <Tags className="h-3 w-3" />
            Otix Catalog
          </div>
          <PosterSection src={proposal.targetPosterUrl || proposal.targetBackdropUrl} label="Otix poster" />
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-2.5 space-y-1.5">
            <p className="text-sm font-semibold text-white leading-tight">{otixTitle ?? proposal.targetTitle ?? '—'}</p>
            <div className="flex items-center gap-1 text-[10px] text-white/40">
              <Hash className="h-3 w-3 shrink-0" />
              ID: {otixMediaId ?? proposal.targetId}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-white/40">
              <HelpCircle className="h-3 w-3 shrink-0" />
              Match: {MATCH_TYPE_LABELS[matchType] ?? matchType}
            </div>
          </div>
        </div>
      </div>

      {/* Match metadata footer */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/25">
        <span>Source: {source}</span>
        <span>Game ID: {sourceGameId}</span>
        <span>Match type: {matchType}</span>
        <span>Media ID: {proposal.targetId}</span>
      </div>
    </div>
  )
}

function EditDetails({ proposal }: { proposal: Proposal }) {
  const p = proposal.payload as Record<string, any>
  const changes = p.changes as Record<string, any> ?? {}
  const overrides = (p.imageOverrides ?? p.image_overrides) as any[] ?? []

  return (
    <div className="space-y-3">
      {Object.keys(changes).length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">Field Changes</h4>
          <div className="space-y-1">
            {Object.entries(changes).map(([field, value]) => (
              <div key={field} className="flex items-center gap-2 text-xs">
                <span className="text-white/40 w-24 shrink-0">{FIELD_LABELS[field] ?? field}</span>
                <span className="text-white/20">→</span>
                <span className="text-white font-medium truncate">{String(value ?? '—')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {overrides.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">Image Overrides</h4>
          <div className="flex flex-wrap gap-2">
            {overrides.map((ov: any, i: number) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/[0.04] p-2">
                <Image className="h-3 w-3 text-white/30" />
                <span className="text-[10px] text-white/50">{IMAGE_TYPE_LABELS[ov.imageType ?? ov.image_type] ?? ov.imageType ?? ov.image_type}</span>
                <span className="text-[10px] text-white/30 font-mono">{ov.languageCode ?? ov.language_code}</span>
                {ov.url && (
                  <img src={ov.url as string} alt="" className="w-8 h-10 rounded object-cover bg-white/5" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ProposalCard ────────────────────────────────────────────────

interface ProposalCardProps {
  proposal: Proposal
  isAdmin?: boolean
  isTrusted?: boolean
  onApprove: (id: string) => void
  onReject: (id: string, reason?: string) => void
  onUndo: (id: string) => void
  onVote: (id: string, voteType: 'up' | 'down') => void
  onRemoveVote: (id: string) => void
  isApproving?: boolean
  isRejecting?: boolean
  isUndoing?: boolean
}

export function ProposalCard({
  proposal,
  isAdmin = false,
  isTrusted = false,
  onApprove,
  onReject,
  onUndo,
  onVote,
  onRemoveVote,
  isApproving,
  isRejecting,
  isUndoing,
}: ProposalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const cfg = STATUS_CONFIG[proposal.status] ?? STATUS_CONFIG.pending
  const StatusIcon = cfg.icon

  const canApproveReject = isAdmin && proposal.status === 'pending'
  const canUndo = isAdmin && proposal.status === 'approved'
  const canVote = isTrusted && proposal.status === 'pending' && proposal.proposerId !== undefined

  const proposerName = proposal.proposer?.username ?? (proposal.proposalType === 'match' ? 'Auto-match' : 'Unknown')
  const mediaLink = `/media/game/${proposal.targetId}`

  return (
    <div className={cn(
      'rounded-xl border transition-colors overflow-hidden',
      proposal.status === 'pending' && 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03]',
      proposal.status === 'approved' && 'border-emerald-500/10 bg-emerald-500/[0.02]',
      proposal.status === 'rejected' && 'border-red-500/10 bg-red-500/[0.02]',
    )}>
      {/* Always-visible header */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          {/* Left: status badge + meta */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider',
                proposal.proposalType === 'match' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400',
              )}>
                {proposal.proposalType === 'match' ? 'Game Match' : 'Media Edit'}
              </span>
              <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium', cfg.bg, cfg.text)}>
                <StatusIcon className="h-3 w-3" />
                {cfg.label}
              </span>
              <span className="text-[10px] text-white/30">{formatDate(proposal.createdAt)}</span>
              {proposal.proposalType === 'edit' && proposerName && (
                <span className="text-[10px] text-white/30">by {proposerName}</span>
              )}
            </div>

            {/* Title row */}
            <h3 className="text-sm font-semibold text-white truncate">
              {(() => {
                if (proposal.proposalType === 'match') {
                  const pl = proposal.payload as any
                  return pl.sourceTitle ?? pl.source_title ?? 'Unknown Game'
                }
                return proposal.targetTitle ?? proposal.targetId
              })()}
            </h3>

            {/* Type summary */}
            {proposal.proposalType === 'match' ? <MatchSummary proposal={proposal} /> : <EditSummary proposal={proposal} />}
          </div>

          {/* Right: type icon */}
          <div className="flex items-center gap-1 shrink-0">
            {proposal.proposalType === 'match' && (
              <a href={mediaLink} target="_blank" rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-white/20 hover:text-white/50 transition-colors">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
            </button>
          </div>
        </div>

        {/* Quick actions row (always visible for pending) */}
        {proposal.status === 'pending' && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.04]">
            {/* Vote buttons */}
            {canVote && (
              <div className="flex items-center gap-1 mr-2">
                <button
                  onClick={() => proposal.myVote === 'up' ? onRemoveVote(proposal.id) : onVote(proposal.id, 'up')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors',
                    proposal.myVote === 'up'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60',
                  )}
                >
                  <ThumbsUp className="h-3 w-3" /> {proposal.upvoteCount}
                </button>
                <button
                  onClick={() => proposal.myVote === 'down' ? onRemoveVote(proposal.id) : onVote(proposal.id, 'down')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors',
                    proposal.myVote === 'down'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60',
                  )}
                >
                  <ThumbsDown className="h-3 w-3" /> {proposal.downvoteCount}
                </button>
              </div>
            )}

            {/* Admin approve/reject */}
            {canApproveReject && (
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => onApprove(proposal.id)}
                  disabled={isApproving}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                </button>
                <button
                  onClick={() => setShowRejectInput(!showRejectInput)}
                  disabled={isRejecting}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
              </div>
            )}
          </div>
        )}

        {/* Reject reason input */}
        {showRejectInput && (
          <div className="flex items-center gap-2 mt-2">
            <input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason (optional)..."
              className="flex-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-white/30 outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onReject(proposal.id, rejectReason || undefined)
                  setShowRejectInput(false)
                  setRejectReason('')
                }
              }}
            />
            <button
              onClick={() => {
                onReject(proposal.id, rejectReason || undefined)
                setShowRejectInput(false)
                setRejectReason('')
              }}
              className="px-2 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30"
            >
              Confirm
            </button>
          </div>
        )}

        {/* Undo button for approved */}
        {canUndo && (
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => onUndo(proposal.id)}
              disabled={isUndoing}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 text-white/50 text-xs font-medium hover:bg-white/10 hover:text-white/70 transition-colors disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo Approval
            </button>
          </div>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-0">
          <div className="border-t border-white/[0.04] pt-3">
            {proposal.proposalType === 'match'
              ? <MatchDetails proposal={proposal} />
              : <EditDetails proposal={proposal} />
            }

            {/* Rejection reason */}
            {proposal.status === 'rejected' && proposal.rejectionReason && (
              <div className="mt-3 rounded-lg bg-red-500/5 border border-red-500/10 p-2.5">
                <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-0.5">Rejection reason</p>
                <p className="text-xs text-white/60">{proposal.rejectionReason}</p>
              </div>
            )}

            {/* Review meta */}
            {proposal.reviewer && (
              <div className="mt-3 flex items-center gap-2 text-[10px] text-white/30">
                <span>Reviewed by {proposal.reviewer.username}</span>
                {proposal.reviewedAt && <span>· {formatDate(proposal.reviewedAt)}</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
