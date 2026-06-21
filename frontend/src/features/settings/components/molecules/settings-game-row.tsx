import { Gamepad2, CheckCircle2, Star } from 'lucide-react'
import type { LocalGame } from '@/old-features/game-scanner/types'

interface GameRowProps {
  game: LocalGame
  selected: boolean
  onClick: (game: LocalGame) => void
}

function getStatusInfo(game: LocalGame): {
  label: string
  color: string
  bg: string
  icon: typeof CheckCircle2
} {
  if (game.data?.id || game.otixMediaId)
    return { label: 'Matched', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle2 }
  if (game.otixMatchSuggestion)
    return { label: 'Suggested', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Star }
  return { label: 'Unmatched', color: 'text-white/30', bg: 'bg-white/5', icon: Gamepad2 }
}

export function GameRow({ game, selected, onClick }: GameRowProps) {
  const status = getStatusInfo(game)
  const StatusIcon = status.icon
  const confidence = game.otixConfidence ? Math.round(game.otixConfidence * 100) : null
  const iconUrl = game.localIconUrl || game.iconUrl

  return (
    <button
      onClick={() => onClick(game)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
        selected ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
    >
      {/* Icon/fallback */}
      <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 overflow-hidden">
        {iconUrl ? (
          <img src={iconUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <Gamepad2 className="h-4 w-4 text-white/40" />
        )}
      </div>

      {/* Title + platform */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-white">{game.title}</p>
        <p className="text-[11px] text-white/40 capitalize">{game.platform}</p>
      </div>

      {/* Status badge */}
      <div className={`flex items-center gap-1 px-2 py-1 rounded-md shrink-0 ${status.bg}`}>
        <StatusIcon className={`h-3 w-3 ${status.color}`} />
        <span className={`text-[11px] font-medium ${status.color}`}>{status.label}</span>
      </div>

      {/* Confidence bar */}
      {confidence !== null && (
        <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden shrink-0">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(confidence, 100)}%` }}
          />
        </div>
      )}
    </button>
  )
}
