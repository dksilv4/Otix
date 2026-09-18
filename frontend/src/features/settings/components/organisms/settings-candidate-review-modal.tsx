/* ── CandidateReviewModal — comparison table: scanned game ↔ match / candidates ── */

import { useState, useEffect } from 'react'
import {
  CheckCircle2, Gamepad2, Loader2, Check,
  X, Sparkles, LogIn, AlertCircle,
  ChevronLeft, ChevronRight
} from 'lucide-react'
import type { LocalGame } from '@/features/launcher/types'
import { confirmMatch, rejectMatch } from '@/features/plugins/utils/matching'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useAuth } from '@/lib/providers/auth'

interface MatchCandidate {
  media_item_id?: string | null
  title: string
  poster_url?: string | null
  backdrop_url?: string | null
  release_year?: number | null
  platforms?: string[] | null
  developer?: string | null
  confidence: number
  match_type: string
  needs_import?: boolean
  provider_id?: string | null
  provider?: string | null
}

export interface CandidateReviewModalProps {
  game: LocalGame
  onClose: () => void
  isExiting?: boolean
  onMatchResolved?: () => void
}

type Row = [string, string | null, string | null]

export function CandidateReviewModal({ game, onClose, isExiting, onMatchResolved }: CandidateReviewModalProps) {
  const { user } = useAuth()
  const isAuthenticated = !!user
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)))
  }, [])

  const visible = animateIn && !isExiting
  const isMatched = !!(game.data?.id || game.otixMediaId)
  const suggestion = game.otixMatchSuggestion || game.matchSuggestion

  const candidates: MatchCandidate[] =
    (suggestion as any)?._candidates?.length ? (suggestion as any)._candidates
    : suggestion ? [{ media_item_id: suggestion.id, title: suggestion.title, poster_url: suggestion.posterUrl || null, confidence: game.otixConfidence || 0, match_type: 'unknown' }]
    : []

  const sources = (game as any).sources || game.sources
  const dlcOf = (() => {
    if (Array.isArray(sources)) for (const s of sources) if (typeof s === 'object' && s !== null && (s as any).dlcOf) return (s as any).dlcOf as string
    return null
  })()
  const rawMeta: Record<string, any> = (() => {
    if (Array.isArray(sources)) for (const s of sources) if (typeof s === 'object' && s !== null) return s as Record<string, unknown>
    return {}
  })()

  const queryId = game.platform + ':' + ((game as any).appName || game.id || '')
  const nativePoster = game.posterUrl || game.iconUrl
  const matchedTitle = game.data?.title || game.otixMediaTitle
  const matchedPoster = game.data?.posterUrl || game.otixPosterUrl
  const matchedConfidence = game.otixConfidence
  const candidateCount = candidates.length
  const isAccepting = confirming || rejecting

  // Build comparison rows — both sides have comparable data
  const launcherName = game.platform ? game.platform.charAt(0).toUpperCase() + game.platform.slice(1) : 'Launcher'
  const matchPosterFinal = isMatched ? matchedPoster : (candidates[selectedIdx]?.poster_url || nativePoster)
  const matchTitleFinal = isMatched ? matchedTitle : candidates[selectedIdx]?.title
  const scannedId = rawMeta.id || (game as any).appName || (game.id?.includes('_') ? game.id.split('_').slice(1).join('_') : game.id) || null
  const matchId = isMatched ? (game.otixMediaId || game.otixMediaSlug) : (candidates[selectedIdx]?.media_item_id || null)
  const hasRightSide = isMatched || candidateCount > 0

  const rows: Row[] = ([
    ['Title', game.title, matchTitleFinal || null],
    ['Platform', game.platform, candidates[selectedIdx]?.provider || 'otix'],
    ['ID', scannedId, matchId],
    ['Developer', (game as any).developer || rawMeta.developer || null, candidates[selectedIdx]?.developer || null],
    ['Publisher', rawMeta.publisher || (game as any).publisher || null, candidates[selectedIdx]?.developer || null],
    ['Release Year', game.data?.releaseDate?.slice(0, 4) || rawMeta.releaseYear || null, candidates[selectedIdx]?.release_year ? String(candidates[selectedIdx].release_year) : null],
    ['Confidence', null, matchedConfidence != null ? `${Math.round(matchedConfidence * 100)}%` : (candidates[selectedIdx]?.confidence != null ? `${Math.round(candidates[selectedIdx].confidence * 100)}%` : null)],
  ] as Row[]).filter(([, a, b]) => a || b)

  const handleAcceptCandidate = async (candidate: MatchCandidate) => {
    if (!isAuthenticated) { setActionError('Sign in to confirm matches'); return }
    setActionError(null); setConfirming(true)
    try {
      const r = await confirmMatch(queryId, candidate.media_item_id || null, candidate.provider_id ? parseInt(candidate.provider_id) : null)
      if (r.success) {
        const api = getDesktopAPI()
        if (api) await api.acceptSuggestion(game.id, { id: candidate.media_item_id || `${candidate.provider}_${candidate.provider_id}`, title: candidate.title, slug: candidate.media_item_id || '', mediaType: 'game', posterUrl: candidate.poster_url || null, developer: candidate.developer || null, platforms: candidate.platforms || [], confidence: candidate.confidence } as any)
        onMatchResolved?.(); onClose()
      } else setActionError(r.error || 'Failed to confirm')
    } catch (err: any) {
      setActionError(err?.response?.status === 401 ? 'Sign in to confirm matches' : err?.response?.status === 403 ? 'Account not authorized' : err?.message || 'Failed')
    } finally { setConfirming(false) }
  }

  const handleReject = async (permanent: boolean) => {
    setActionError(null); setRejecting(true)
    try {
      await rejectMatch(queryId, permanent)
      const api = getDesktopAPI(); if (api) await api.rejectSuggestion(game.id, suggestion?.id || '')
      onMatchResolved?.(); onClose()
    } catch (err: any) {
      if (err?.response?.status !== 401) console.error('handleReject error:', err)
      else setActionError('Sign in to manage matches')
    } finally { setRejecting(false) }
  }

  return (
    <div className={'fixed inset-0 z-[var(--dk-z-modal)] flex items-center justify-center p-4 transition-opacity duration-200 ' + (visible ? 'opacity-100' : 'opacity-0')}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={'relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-3xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-dialog)] transition-all duration-200 ease-out flex flex-col ' + (visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4')}>
        {/* Header */}
        <div className="flex items-center gap-2.5 px-6 py-4 shrink-0">
          {isMatched ? <CheckCircle2 size={16} className="text-green-500" /> : candidateCount > 0 ? <Sparkles size={16} className="text-yellow-500" /> : <Gamepad2 size={16} className="text-white/40" />}
          <h2 className="text-sm font-bold text-white truncate flex-1">
            {isMatched ? 'Matched Game' : candidateCount > 0 ? `Review Candidates (${candidateCount})` : 'Game Details'}
          </h2>
          {dlcOf && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium shrink-0">DLC of {dlcOf}</span>}
          <button onClick={onClose} className="shrink-0 rounded-xl p-1.5 transition-all text-[var(--muted-foreground)] hover:bg-[var(--dk-surface-ghost-hover)] hover:text-[var(--foreground)]"><X size={16} /></button>
        </div>

        {/* Poster row */}
        <div className="flex gap-4 px-6 py-4 shrink-0">
          <div className="flex-1 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">{launcherName}</p>
            <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/5 w-full">
              {nativePoster ? <img src={nativePoster} alt="" className="h-full w-full object-cover" /> : <div className="h-full flex items-center justify-center"><Gamepad2 className="h-10 w-10 text-white/10" /></div>}
            </div>
          </div>
          {hasRightSide && (
            <div className="flex-1 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">{isMatched ? 'Matched' : 'Candidate'}</p>
              <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/5 w-full">
                {matchPosterFinal ? <img src={matchPosterFinal} alt="" className="h-full w-full object-cover" /> : <div className="h-full flex items-center justify-center">{isMatched ? <CheckCircle2 className="h-10 w-10 text-green-400/20" /> : <Gamepad2 className="h-10 w-10 text-white/10" />}</div>}
              </div>
            </div>
          )}
        </div>

        {/* Comparison table — single column, both values shown per row */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-0.5">
          {rows.map(([label, scanned, match], i) => {
            return (
              <div key={i} className="flex items-start gap-3 py-2 text-xs">
                <span className="text-white/30 font-medium w-20 shrink-0 text-right">{label}</span>
                <span className={`flex-1 min-w-0 break-words text-right ${scanned ? 'text-white/70' : 'text-white/15'}`}>
                  {scanned || '—'}
                </span>
                {hasRightSide && (
                  <>
                    <span className="text-white/15 shrink-0">→</span>
                    <span className={`flex-1 min-w-0 break-words ${match ? (label === 'Confidence' ? (String(match).includes('90') || String(match).includes('95') || String(match).includes('100') ? 'text-green-400 font-semibold' : String(match).includes('80') || String(match).includes('85') ? 'text-blue-400 font-semibold' : 'text-white/50') : 'text-white/70') : 'text-white/15'}`}>
                      {match || '—'}
                    </span>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Candidate slideshow nav */}
        {!isMatched && candidateCount > 1 && (
          <div className="flex items-center justify-between px-6 py-3 shrink-0">
            <button onClick={() => setSelectedIdx(i => Math.max(0, i - 1))} disabled={selectedIdx === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed">
              <ChevronLeft size={14} /> Previous
            </button>
            <span className="text-xs text-white/40 font-medium tabular-nums">
              {selectedIdx + 1} / {candidateCount}
            </span>
            <button onClick={() => setSelectedIdx(i => Math.min(candidateCount - 1, i + 1))} disabled={selectedIdx >= candidateCount - 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed">
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Auth/error + action buttons */}
        {(actionError || !isMatched) && (
          <div className="px-6 py-3 shrink-0 space-y-2">
            {actionError && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/10 text-xs text-red-400">
                <AlertCircle size={14} className="shrink-0" />
                <span className="flex-1">{actionError}</span>
                {!isAuthenticated && <a href="/login" className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 font-medium hover:bg-blue-500/30 transition-colors"><LogIn size={12} /> Sign In</a>}
              </div>
            )}

            {!isMatched && candidateCount > 0 && (
              <>
                {!isAuthenticated ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 text-xs text-amber-400">
                    <LogIn size={14} className="shrink-0" />
                    <span className="flex-1">Sign in to confirm matches</span>
                    <a href="/login" className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 font-medium hover:bg-blue-500/30 transition-colors">Sign In</a>
                  </div>
                ) : (
                  <button onClick={() => handleAcceptCandidate(candidates[selectedIdx])} disabled={isAccepting}
                    className="w-full py-2.5 rounded-xl bg-green-500/80 hover:bg-green-400 disabled:bg-green-500/40 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                    {confirming ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Accept Selected Match
                  </button>
                )}

                <div className="flex gap-2">
                  <button onClick={() => handleReject(false)} disabled={isAccepting} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/20 text-red-400 text-[11px] font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50">
                    {rejecting ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Skip
                  </button>
                  <button onClick={() => handleReject(true)} disabled={isAccepting} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-red-400/70 text-[11px] font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50">
                    <X size={12} /> Never suggest
                  </button>
                  <div className="flex-1" />
                  <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-[11px] font-semibold transition-all">Close</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
