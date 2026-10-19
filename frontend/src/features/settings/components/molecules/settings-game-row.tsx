import { Gamepad2 } from 'lucide-react'
import type { LocalGame } from '@/features/launcher/types'
import { getStatusInfo } from '../../utils/catalog'

interface GameRowProps {
  game: LocalGame
  selected: boolean
  onClick: (game: LocalGame) => void
}

export const GameRow = ({ game, selected, onClick }: GameRowProps) => {
  const status = getStatusInfo(game)
  const StatusIcon = status.icon
  const confidence = game.otixConfidence ? Math.round(game.otixConfidence * 100) : null
  const iconUrl = game.localIconUrl || game.iconUrl

  return (
    <button
      onClick={() => onClick(game)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
        selected ? 'bg-[var(--dk-surface-overlay)] text-foreground' : 'hover:bg-[var(--dk-surface-hover)]'
      }`}
    >
      {/* Icon/fallback */}
      <div className="h-8 w-8 rounded-lg bg-[var(--dk-surface-field)] flex items-center justify-center shrink-0 overflow-hidden">
        {iconUrl ? (
          <img src={iconUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <Gamepad2 className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Title + platform */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-foreground">{game.title}</p>
        <p className="text-[11px] text-muted-foreground capitalize">{game.platform}</p>
      </div>

      {/* Status badge */}
      <div className={`flex items-center gap-1 px-2 py-1 rounded-md shrink-0 ${status.bg}`}>
        <StatusIcon className={`h-3 w-3 ${status.color}`} />
        <span className={`text-[11px] font-medium ${status.color}`}>{status.label}</span>
      </div>

      {/* Confidence bar */}
      {confidence !== null && (
        <div className="w-16 h-1.5 rounded-full bg-[var(--dk-surface-field)] overflow-hidden shrink-0">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(confidence, 100)}%` }}
          />
        </div>
      )}
    </button>
  )
};
