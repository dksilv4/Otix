import { useState } from 'react'
import { useAuth } from '@/features/auth/auth-provider'
import { useToast } from '@/features/dk-ui/molecules/toast'
import {
  useMediaProposals,
  useApproveProposal,
  useRejectProposal,
  useUndoApproval,
  type MediaEditProposal,
  type ImageOverrideItem,
} from '../admin-edit-queries'
import type { MediaItemDetail } from '@/features/media/media-queries'
import { Check, X, ShieldCheck, ChevronDown, Bot, Undo2 } from 'lucide-react'

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

const LANG_LABELS: Record<string, string> = {
  '*': 'All',
  en: 'EN', ja: 'JA', ko: 'KO', zh: 'ZH', es: 'ES', fr: 'FR', de: 'DE',
  pt: 'PT', it: 'IT', ru: 'RU', ar: 'AR', hi: 'HI', th: 'TH', vi: 'VI',
  tr: 'TR', pl: 'PL', nl: 'NL', sv: 'SV', nb: 'NB', fi: 'FI',
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

function fieldValue(media: MediaItemDetail, key: string): string {
  const map: Record<string, string | null> = {
    title: media.title,
    overview: media.overview,
    release_date: media.releaseDate,
    original_language: media.originalLanguage,
    poster_url: media.posterUrl,
    backdrop_url: media.backdropUrl,
    logo_url: media.logoUrl,
    textless_poster_url: media.textlessPosterUrl,
  }
  return (map[key] ?? '—') || '—'
}

interface Props {
  mediaId: string
  media: MediaItemDetail
}

export function AdminProposalsList({ mediaId, media }: Props) {
  const { user } = useAuth()
  const { toast } = useToast()
  const { data, isLoading } = useMediaProposals(mediaId)
  const approveProposal = useApproveProposal(mediaId)
  const rejectProposal = useRejectProposal(mediaId)
  const undoApproval = useUndoApproval(mediaId)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!user?.isAdmin) return null
  if (isLoading) return null
  if (!data || data.items.length === 0) return null

  const handleApprove = async (proposalId: string) => {
    try {
      await approveProposal.mutateAsync(proposalId)
      toast({ title: 'Proposal approved', variant: 'success' })
    } catch {
      toast({ title: 'Failed to approve proposal', variant: 'error' })
    }
  }

  const handleReject = async (proposalId: string) => {
    try {
      await rejectProposal.mutateAsync({ proposalId, reason: rejectReason || null })
      setRejectingId(null)
      setRejectReason('')
      toast({ title: 'Proposal rejected', variant: 'success' })
    } catch {
      toast({ title: 'Failed to reject proposal', variant: 'error' })
    }
  }

  const handleUndo = async (proposalId: string) => {
    try {
      await undoApproval.mutateAsync(proposalId)
      toast({ title: 'Approval undone — image overrides removed, proposal returned to pending', variant: 'success' })
    } catch {
      toast({ title: 'Failed to undo approval', variant: 'error' })
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-muted-foreground">
          Edit Proposals ({data.total})
        </h2>
      </div>
      <div className="space-y-2">
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
              {/* Header — clickable row */}
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : proposal.id)}
                className="w-full p-4 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      {proposal.proposer ? (
                        <span className="text-sm font-medium">
                          {proposal.proposer.username}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-400">
                          <Bot className="h-3.5 w-3.5" />
                          System
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{changeSummary(proposal)}</p>
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

                  <div className="flex shrink-0 items-center gap-2">
                    {/* Approve/Reject actions */}
                    {isPending && !isProposer && rejectingId !== proposal.id && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleApprove(proposal.id) }}
                          disabled={approveProposal.isPending}
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
                        onClick={(e) => { e.stopPropagation(); handleUndo(proposal.id) }}
                        disabled={undoApproval.isPending}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Undo
                      </button>
                    )}

                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
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
                      onClick={() => handleReject(proposal.id)}
                      disabled={rejectProposal.isPending}
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

              {/* Rejection reason display when not the editing id */}
              {proposal.rejectionReason && rejectingId !== proposal.id && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-red-400">Reason: {proposal.rejectionReason}</p>
                </div>
              )}

              {/* Expanded preview viewport */}
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
                            <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                              <div className="text-right space-y-0.5">
                                <span className="block text-[10px] text-muted-foreground/60">
                                  {FIELD_LABELS[key] ?? key} (current)
                                </span>
                                <span className="block font-medium text-muted-foreground line-through decoration-red-500/40">
                                  {fieldValue(media, key)}
                                </span>
                              </div>
                              <span className="text-[10px] text-primary/60">→</span>
                              <div className="space-y-0.5">
                                <span className="block text-[10px] text-primary/60">
                                  {FIELD_LABELS[key] ?? key} (proposed)
                                </span>
                                <span className="block font-medium text-foreground">
                                  {String((proposal.changes as Record<string, unknown>)[key])}
                                </span>
                              </div>
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
                                  Language: {LANG_LABELS[ov.languageCode] ?? ov.languageCode}
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
                      <p className="text-xs text-muted-foreground/60 italic">No changes recorded in this proposal.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
