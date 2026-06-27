import { useState } from 'react'
import { CheckCircle2, X, Gamepad2, Folder, Loader2, Check, Star, Import, ExternalLink } from 'lucide-react'
import type { LocalGame } from '@/features/launcher/types'
import { ManualSearch } from './settings-manual-search'
import { getDesktopAPI } from '@/lib/desktop/api'
import { confirmMatch, rejectMatch, unlinkMatch } from '@/features/plugins/utils/matching'

interface MatchCandidateExtra {
  media_item_id: string | null
  title: string
  poster_url: string | null
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

interface MatchDetailPanelProps {
  game: LocalGame | null
  onAccept: (game: LocalGame) => void
  onReject: (game: LocalGame) => void
  onUnmatch: (game: LocalGame) => void
  onManualMatch: (game: LocalGame, media: { id: string; title: string; posterUrl?: string | null }) => void
  accepting: boolean
  rejecting: boolean
}

const MATCH_LABELS: Record<string, string> = {
  direct: 'Direct ID match',
  exact_title: 'Exact title',
  ilike: 'Title match',
  trigram: 'Fuzzy match',
  igdb_crossref: 'IGDB cross-ref',
  igdb_search: 'IGDB search',
  igdb_fuzzy: 'IGDB fuzzy',
}

const CONFIDENCE_COLORS: Record<string, string> = {
  direct: 'text-green-400',
  exact_title: 'text-green-400',
  ilike: 'text-blue-400',
  igdb_crossref: 'text-blue-400',
  igdb_search: 'text-amber-400',
  igdb_fuzzy: 'text-amber-400',
  trigram: 'text-red-400',
}

export function MatchDetailPanel({
  game,
  onAccept,
  onReject,
  onUnmatch,
  onManualMatch,
  accepting,
  rejecting,
}: MatchDetailPanelProps) {
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number>(0)
  const [confirming, setConfirming] = useState(false)

  if (!game) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
        <Gamepad2 className="h-12 w-12 text-white/10 mb-4" />
        <p className="text-sm text-white/40">Select a game to view match details</p>
      </div>
    )
  }

  const isMatched = !!(game.data?.id || game.otixMediaId)
  const hasSuggestion = !!game.otixMatchSuggestion
  const suggestion = game.otixMatchSuggestion
  const matchedTitle = game.data?.title || game.otixMediaTitle
  const posterUrl = game.data?.posterUrl || game.otixPosterUrl || game.posterUrl

  // Extract candidates from suggestion (new format) or build single-candidate fallback
  const candidates: MatchCandidateExtra[] =
    (suggestion as any)?._candidates?.length
      ? (suggestion as any)._candidates
      : suggestion
        ? [{ media_item_id: suggestion.id, title: suggestion.title, poster_url: suggestion.posterUrl || null, confidence: game.otixConfidence || 0, match_type: 'unknown' }]
        : []

  const queryId = game.platform + ':' + (game.id || '')

  const handleOpenFolder = async () => {
    const api = getDesktopAPI()
    if (api && game.exePath) {
      await api.showItemInFolder(game.exePath).catch(() => {})
    }
  }

  const handleSelectCandidate = async (candidate: MatchCandidateExtra) => {
    setConfirming(true)
    try {
      const result = await confirmMatch(
        queryId,
        candidate.media_item_id,
        candidate.provider_id ? parseInt(candidate.provider_id) : null,
      )
      if (result.success) {
        onAccept(game)
      } else {
        console.error('confirmMatch failed:', result.error)
      }
    } catch (err) {
      console.error('handleSelectCandidate error:', err)
    } finally {
      setConfirming(false)
    }
  }

  const handleRejectPermanent = async () => {
    setConfirming(true)
    try {
      await rejectMatch(queryId, true)
      onReject(game)
    } catch (err) {
      console.error('handleRejectPermanent error:', err)
    } finally {
      setConfirming(false)
    }
  }

  const handleUnlink = async () => {
    try {
      await unlinkMatch(queryId)
      onUnmatch(game)
    } catch (err) {
      console.error('handleUnlink error:', err)
    }
  }

  return (
    <div className="space-y-5">
      {/* Preview card */}
      <div className="flex gap-4 p-4 rounded-xl bg-white/5">
        <div className="w-20 h-28 rounded-lg overflow-hidden shrink-0 bg-white/10">
          {posterUrl ? (
            <img src={posterUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Gamepad2 className="h-6 w-6 text-white/20" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{matchedTitle || game.title}</p>
          <p className="text-xs text-white/50 mt-0.5 capitalize">{game.platform}</p>
          {game.exePath && (
            <button
              onClick={handleOpenFolder}
              className="flex items-center gap-1.5 mt-3 text-[11px] text-white/40 hover:text-white/60 transition-colors"
            >
              <Folder className="h-3 w-3" />
              <span className="truncate">{game.exePath}</span>
            </button>
          )}
        </div>
      </div>

      {/* Side-by-side comparison */}
      <div className="rounded-xl p-4 bg-white/5">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Comparison</p>
        <div className="grid grid-cols-2 gap-4">
          {/* Scanned Game */}
          <div>
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">Scanned</p>
            <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-white/10 mb-2">
              {game.iconUrl || game.posterUrl ? (
                <img src={game.iconUrl || game.posterUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Gamepad2 className="h-6 w-6 text-white/20" />
                </div>
              )}
            </div>
            <p className="text-sm font-medium text-white truncate">{game.title}</p>
            <p className="text-[10px] text-white/40 capitalize">{game.platform}</p>
            <p className="text-[10px] text-white/30 truncate">ID: {game.id}</p>
          </div>

          {/* Otix Match */}
          <div>
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">Otix</p>
            {isMatched ? (
              <>
                <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-white/10 mb-2">
                  {posterUrl ? (
                    <img src={posterUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Gamepad2 className="h-6 w-6 text-white/20" />
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium text-white truncate">{matchedTitle}</p>
                {game.otixConfidence !== null && game.otixConfidence !== undefined && (
                  <p className="text-[10px] text-green-400">{Math.round(game.otixConfidence * 100)}% match</p>
                )}
                <button
                  onClick={handleUnlink}
                  className="mt-2 text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
                >
                  Unmatch
                </button>
              </>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[120px]">
                <p className="text-xs text-white/30">No match</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Candidates list */}
      {!isMatched && candidates.length > 0 && (
        <div className="rounded-xl p-4 bg-blue-500/5 border border-blue-500/10">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">
            {candidates.length > 1 ? `Match Candidates (${candidates.length})` : 'Suggested Match'}
          </p>

          <div className="space-y-2 mb-4">
            {candidates.map((c, idx) => {
              const confidencePct = Math.round((c.confidence || 0) * 100)
              const posterSrc = c.poster_url || (suggestion as any)?._epic_poster_url || game.posterUrl
              const confColor = CONFIDENCE_COLORS[c.match_type] || 'text-white/50'
              const label = MATCH_LABELS[c.match_type] || c.match_type

              return (
                <button
                  key={c.media_item_id || c.provider_id || idx}
                  onClick={() => {
                    setSelectedCandidateIdx(idx)
                    handleSelectCandidate(c)
                  }}
                  disabled={confirming}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-all text-left ${
                    selectedCandidateIdx === idx
                      ? 'bg-blue-500/10 border border-blue-500/20'
                      : 'bg-white/5 hover:bg-white/10 border border-transparent'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {/* Poster thumbnail */}
                  <div className="w-10 h-14 rounded overflow-hidden shrink-0 bg-white/10">
                    {posterSrc ? (
                      <img
                        src={posterSrc}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Gamepad2 className="h-4 w-4 text-white/30" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white truncate">{c.title}</p>
                      {c.needs_import && (
                        <Import className="h-3 w-3 text-amber-400 shrink-0" title="Needs import from IGDB" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[11px] font-medium ${confColor}`}>
                        {confidencePct}%
                      </span>
                      <span className="text-[10px] text-white/30">{label}</span>
                      {c.release_year && (
                        <span className="text-[10px] text-white/20">{c.release_year}</span>
                      )}
                    </div>
                    {c.platforms && c.platforms.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {c.platforms.slice(0, 4).map((p) => (
                          <span key={p} className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/40">
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Confidence badge */}
                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    confidencePct >= 90 ? 'bg-green-500/20 text-green-400' :
                    confidencePct >= 70 ? 'bg-blue-500/20 text-blue-400' :
                    confidencePct >= 40 ? 'bg-amber-500/20 text-amber-400' :
                    'bg-white/10 text-white/40'
                  }`}>
                    {confidencePct}
                  </div>

                  {/* Action indicator */}
                  {confirming && selectedCandidateIdx === idx ? (
                    <Loader2 className="h-4 w-4 text-blue-400 animate-spin shrink-0" />
                  ) : (
                    <Check className="h-4 w-4 text-white/20 shrink-0" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Reject all */}
          <div className="flex gap-2">
            <button
              onClick={() => onReject(game)}
              disabled={rejecting || confirming}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rejecting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
              Skip this time
            </button>
            <button
              onClick={handleRejectPermanent}
              disabled={confirming}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400/70 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="h-3 w-3" />
              Never suggest again
            </button>
          </div>
        </div>
      )}

      {/* Old-style single suggestion (backward compat) */}
      {!isMatched && hasSuggestion && suggestion && candidates.length === 0 && (
        <div className="rounded-xl p-4 bg-blue-500/5 border border-blue-500/10">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">
            Suggested Match
          </p>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-14 rounded overflow-hidden shrink-0 bg-white/10">
              {suggestion.posterUrl ? (
                <img src={suggestion.posterUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Gamepad2 className="h-4 w-4 text-white/30" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{suggestion.title}</p>
              {game.otixConfidence !== null && game.otixConfidence !== undefined && (
                <p className="text-xs text-blue-300">{Math.round(game.otixConfidence * 100)}% confidence</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onAccept(game)}
              disabled={accepting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {accepting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Accept
            </button>
            <button
              onClick={() => onReject(game)}
              disabled={rejecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rejecting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Manual search */}
      {!isMatched && (
        <div className="rounded-xl p-4 bg-white/5">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
            Manual Match
          </p>
          <ManualSearch
            key={game.id}
            onSelect={(media) => onManualMatch(game, media)}
            defaultQuery={game.title}
            gameContext={{
              title: game.title,
              developer: (game as any).developer,
              platform: game.platform,
            }}
          />
        </div>
      )}
    </div>
  )
}
