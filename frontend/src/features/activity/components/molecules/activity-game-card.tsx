import { Gamepad2, Clock, Star, ExternalLink, Activity, Zap, ArrowRightLeft } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useMatchedRunningGame, useGamingSessionXp, useCs2GameState, isCs2Game } from '@/features/launcher'
import { formatDuration } from '@/lib/utils'
import type { RunningGameData } from '@/lib/desktop/api'
import { formatFpsBadge } from '../../utils/game-activity'
import { ActivityModuleSection } from './activity-module-section'
import { ActivityModuleCs2Telemetry } from './activity-module-cs2-telemetry'

export interface ActivityGameCardProps {
  game: RunningGameData
  isFocused: boolean
  onFocus?: () => void
  onClose?: () => void
}

/** Full container card for an individual running game session. */
export const ActivityGameCard = ({
  game,
  isFocused,
  onFocus,
  onClose,
}: ActivityGameCardProps) => {
  const { matchedGame, elapsedMs } = useMatchedRunningGame(game)
  const { sessionXp } = useGamingSessionXp()
  const isCs2 = Boolean(
    isCs2Game(game.game.title || game.game.exePath || game.game.processName),
  )
  const { gameState } = useCs2GameState({ enabled: isCs2 })

  const displayTitle = matchedGame?.title || game.game.title || 'Game Session'
  const posterUrl = matchedGame?.posterUrl || game.game.posterUrl || game.game.iconUrl
  const releaseYear = matchedGame?.releaseDate ? new Date(matchedGame.releaseDate).getFullYear() : null
  const genresStr = matchedGame?.genres?.slice(0, 2).join(' · ')
  const subtitle = genresStr
    ? `${genresStr}${releaseYear ? ` (${releaseYear})` : ''}`
    : releaseYear
      ? `${releaseYear}`
      : null
  const currentFps = game.fpsSnapshot?.currentFps ?? 0
  const fpsBadge = formatFpsBadge(currentFps)
  const gamePlatform = game.game.platform ? game.game.platform.toUpperCase() : 'PC'

  return (
    <ActivityModuleSection className={`relative overflow-hidden group transition-all ${isFocused ? 'ring-1 ring-primary/25' : 'opacity-90 hover:opacity-100'}`}>
      {/* Subtle ambient backdrop glow */}
      {posterUrl && (
        <div
          className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-20 blur-2xl pointer-events-none transition-opacity duration-500 group-hover:opacity-30"
          style={{ backgroundImage: `url(${posterUrl})`, backgroundSize: 'cover' }}
        />
      )}

      <div className="relative flex items-start gap-3">
        <div className="relative w-14 h-20 rounded-xl overflow-hidden shrink-0 bg-muted shadow-md transition-colors">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={displayTitle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Gamepad2 size={24} className="text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">
                Now Playing
              </span>
              <span className={`text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded-md ${isFocused ? 'bg-primary text-primary-foreground' : 'bg-[var(--dk-surface-field)] text-muted-foreground'}`}>
                {isFocused ? 'Focused' : 'Background'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {matchedGame?.rating != null && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-foreground">
                  <Star size={10} className="fill-primary text-primary" />
                  {matchedGame.rating.toFixed(1)}
                </span>
              )}
              {!isFocused && onFocus && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onFocus()
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground bg-[var(--dk-surface-field)] hover:bg-primary/20 hover:text-primary px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                  title={`Focus ${displayTitle}`}
                >
                  <ArrowRightLeft className="h-2.5 w-2.5" />
                  <span>Focus</span>
                </button>
              )}
            </div>
          </div>

          {matchedGame?.id ? (
            <Link
              to="/launcher/$gameId"
              params={{ gameId: matchedGame.id }}
              onClick={onClose}
              className="group/link flex items-center gap-1 text-[15px] font-bold text-foreground hover:text-primary transition-colors truncate leading-tight"
            >
              <span className="truncate">{displayTitle}</span>
              <ExternalLink className="h-3 w-3 opacity-0 group-hover/link:opacity-80 transition-opacity shrink-0" />
            </Link>
          ) : (
            <h3 className="text-[15px] font-bold text-foreground truncate leading-tight">
              {displayTitle}
            </h3>
          )}

          {subtitle && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5 font-medium">
              {subtitle}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 mt-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-muted text-muted-foreground font-mono shrink-0">
                {gamePlatform}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums font-mono text-foreground shrink-0">
                <Clock size={10} />
                {formatDuration(elapsedMs)}
              </span>
              {fpsBadge.text && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono shrink-0 ${fpsBadge.className}`}
                >
                  <Activity size={10} />
                  {fpsBadge.text}
                </span>
              )}
            </div>
            {isFocused && sessionXp > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold text-primary bg-primary/10 shrink-0 ml-auto">
                <Zap size={10} className="fill-primary" />
                +{sessionXp} XP
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Live CS2 GSI Telemetry if this game is CS2 */}
      {gameState && (
        <div className="w-full mt-3">
          <ActivityModuleCs2Telemetry state={gameState} />
        </div>
      )}
    </ActivityModuleSection>
  )
};
