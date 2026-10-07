import { useState } from 'react'
import { Gamepad2, Clock, Gauge, Server } from 'lucide-react'
import type { NormalizedPlaySession } from '../../hooks/use-user-game-sessions'
import { relativeDate, humanPlaytime } from '../../utils'
import { formatHours } from '../../utils/game-activity-stats'

interface GameSessionIconTileProps {
  session: NormalizedPlaySession
  totalPlaytimeSeconds?: number
  sessionCount?: number
  onClick: () => void
}

export const GameSessionIconTile = ({
  session,
  totalPlaytimeSeconds,
  sessionCount,
  onClick,
}: GameSessionIconTileProps) => {
  const [imgError, setImgError] = useState(false)
  const hasArt = session.posterUrl && !imgError

  return (
    <div className="relative group shrink-0">
      <button
        type="button"
        data-testid="user-profile-game-icon-tile"
        onClick={onClick}
        aria-label={`View stats for ${session.gameTitle}`}
        className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border border-border/60 hover:border-primary/60 bg-card shadow-sm hover:shadow-md transition-all duration-200 group-hover:scale-105 cursor-pointer relative flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {hasArt ? (
          <img
            src={session.posterUrl!}
            alt={session.gameTitle}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-secondary/50 flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
            <Gamepad2 size={24} />
          </div>
        )}
      </button>

      {/* Rich Hover Floating Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-xl bg-popover/95 border border-border/80 text-popover-foreground shadow-xl backdrop-blur-md opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 pointer-events-none transition-all duration-200 z-30 flex flex-col gap-1.5">
        <h5 className="font-bold text-xs text-foreground truncate">
          {session.gameTitle}
        </h5>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock size={11} className="text-muted-foreground/70" />
            {totalPlaytimeSeconds !== undefined
              ? formatHours(totalPlaytimeSeconds)
              : humanPlaytime(session.durationSeconds)}
            {sessionCount !== undefined && sessionCount > 1 ? ` · ${sessionCount} runs` : ''}
          </span>
          <span>{relativeDate(session.startTime)}</span>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[10px] text-muted-foreground font-mono">
          {session.avgFps ? (
            <span className="inline-flex items-center gap-1">
              <Gauge size={10} className="text-primary" />
              <span>{Math.round(session.avgFps)} FPS</span>
            </span>
          ) : (
            <span>No FPS data</span>
          )}

          {session.node?.name && (
            <span className="inline-flex items-center gap-1 truncate max-w-[100px]">
              <Server size={10} className="text-muted-foreground/60" />
              <span>{session.node.name}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
};
