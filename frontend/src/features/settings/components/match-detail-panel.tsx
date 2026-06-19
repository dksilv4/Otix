import { CheckCircle2, X, Gamepad2, Folder, Loader2, Check } from 'lucide-react'
import type { LocalGame } from '@/old-features/game-scanner/types'
import { ManualSearch } from './manual-search'
import { getDesktopAPI } from '@/lib/desktop/api'

interface MatchDetailPanelProps {
  game: LocalGame | null
  onAccept: (game: LocalGame) => void
  onReject: (game: LocalGame) => void
  onUnmatch: (game: LocalGame) => void
  onManualMatch: (game: LocalGame, media: { id: string; title: string; posterUrl?: string | null }) => void
  accepting: boolean
  rejecting: boolean
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
  const confidence = game.otixConfidence ? Math.round(game.otixConfidence * 100) : null
  const suggestion = game.otixMatchSuggestion
  const matchedTitle = game.data?.title || game.otixMediaTitle
  const posterUrl = game.data?.posterUrl || game.otixPosterUrl || game.posterUrl

  const handleOpenFolder = async () => {
    const api = getDesktopAPI()
    if (api && game.exePath) {
      await api.showItemInFolder(game.exePath).catch(() => {})
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

      {/* Current match status */}
      <div className="rounded-xl p-4 bg-white/5">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">Current Match</p>
        {isMatched ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{matchedTitle}</p>
                {confidence !== null && (
                  <p className="text-xs text-white/50">{confidence}% confidence</p>
                )}
              </div>
            </div>
            <button
              onClick={() => onUnmatch(game)}
              className="shrink-0 text-xs text-red-400/70 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              Unmatch
            </button>
          </div>
        ) : (
          <p className="text-sm text-white/40">No match set</p>
        )}
      </div>

      {/* Suggestion */}
      {hasSuggestion && suggestion && (
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
              {confidence !== null && (
                <p className="text-xs text-blue-300">{confidence}% confidence</p>
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
      <div className="rounded-xl p-4 bg-white/5">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
          Manual Match
        </p>
        <ManualSearch onSelect={(media) => onManualMatch(game, media)} />
      </div>
    </div>
  )
}
