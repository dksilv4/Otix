import { useState } from 'react'
import { Gamepad2, Clock, Gauge, Flame, Server, Cpu, Radio } from 'lucide-react'
import type { NormalizedPlaySession } from '../../hooks/use-user-game-sessions'
import { relativeDate, humanPlaytime } from '../../utils'
import { formatLiveElapsed } from '../../utils/game-activity-stats'

interface GameSessionCardProps {
  session: NormalizedPlaySession
  isLive?: boolean
  onClick: () => void
  featured?: boolean
}

export const GameSessionCard = ({
  session,
  isLive = false,
  onClick,
  featured = false,
}: GameSessionCardProps) => {
  const [imgError, setImgError] = useState(false)
  const displayArt = session.backdropUrl || session.bannerUrl || session.posterUrl
  const hasArt = displayArt && !imgError

  return (
    <button
      type="button"
      data-testid={isLive ? 'user-profile-active-session' : 'user-profile-game-session-card'}
      onClick={onClick}
      className={`group relative text-left rounded-2xl overflow-hidden border transition-all duration-300 hover:scale-[1.01] cursor-pointer flex flex-col justify-between p-4 sm:p-5 ${
        featured ? 'min-h-[220px] sm:min-h-[250px]' : 'min-h-[190px] sm:min-h-[210px]'
      } ${
        isLive
          ? 'border-primary shadow-md shadow-primary/10 bg-card'
          : 'border-border/60 hover:border-primary/50 bg-card hover:bg-card/90 shadow-sm'
      }`}
    >
      {/* Vibrant background artwork */}
      {hasArt ? (
        <img
          src={displayArt!}
          alt={session.gameTitle}
          onError={() => setImgError(true)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-85 group-hover:opacity-100"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-muted/20 flex items-center justify-center pointer-events-none">
          <Gamepad2 size={64} className="text-muted-foreground/10" />
        </div>
      )}

      {/* Atmospheric directional vignettes — keeps center bright while ensuring text contrast */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/80 via-background/30 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-background/95 via-background/70 to-transparent pointer-events-none" />

      {/* Top Header: Live / Duration Badge + Performance Pills */}
      <div className="relative z-10 flex items-center justify-between gap-2 w-full">
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/20 border border-primary/40 text-[10px] font-bold uppercase tracking-wider text-primary backdrop-blur-md shadow-sm">
            <Radio className="h-3 w-3 animate-pulse" />
            Live
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary/85 border border-border/40 text-[11px] font-medium text-secondary-foreground backdrop-blur-md shadow-sm">
            <Clock size={11} className="text-muted-foreground" />
            {humanPlaytime(session.durationSeconds)}
          </span>
        )}

        <div className="flex items-center gap-1.5">
          {session.avgFps ? (
            <div className="inline-flex items-baseline gap-1 px-2.5 py-1 rounded-full bg-secondary/85 border border-border/40 backdrop-blur-md shadow-sm">
              <Gauge size={11} className="text-primary self-center mr-0.5" />
              <span className="font-mono font-bold text-xs text-foreground tabular-nums">
                {Math.round(session.avgFps)}
              </span>
              <span className="text-[9px] text-muted-foreground font-semibold uppercase">
                FPS
              </span>
            </div>
          ) : null}

          {session.low1Percent ? (
            <div className="hidden sm:inline-flex items-baseline gap-1 px-2 py-1 rounded-full bg-secondary/70 border border-border/30 backdrop-blur-md shadow-sm">
              <Flame size={10} className="text-muted-foreground self-center" />
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {Math.round(session.low1Percent)}
              </span>
              <span className="text-[8px] text-muted-foreground/70 font-medium">1%</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom Area: Title, Timing & Hardware Badge */}
      <div className="relative z-10 mt-auto pt-4">
        <h4
          className={`font-bold tracking-tight text-foreground drop-shadow-sm transition-colors group-hover:text-primary line-clamp-1 ${
            featured ? 'text-lg sm:text-xl' : 'text-base sm:text-lg'
          }`}
        >
          {session.gameTitle}
        </h4>

        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground drop-shadow-sm">
          <span>
            {isLive
              ? formatLiveElapsed(session.durationSeconds)
              : relativeDate(session.startTime)}
          </span>

          {(session.hardwareSummary || session.node?.name) && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground/90 truncate max-w-[180px]">
                {session.node?.name ? (
                  <>
                    <Server size={11} className="shrink-0 text-muted-foreground/60" />
                    <span>{session.node.name}</span>
                  </>
                ) : (
                  <>
                    <Cpu size={11} className="shrink-0 text-muted-foreground/60" />
                    <span>{session.hardwareSummary}</span>
                  </>
                )}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  )
};
