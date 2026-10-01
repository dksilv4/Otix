import { Gamepad2, Clock, Star } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useMatchedRunningGame } from '@/features/launcher'
import { formatDuration } from '@/lib/utils'
import { ActivityModuleSection } from './activity-module-section'

/** Molecule displaying the currently running game with matched Otix catalog info and elapsed time. */
export function ActivityModuleGame() {
  const { runningGame, elapsedMs, matchedGame } = useMatchedRunningGame()

  if (!runningGame) return null

  const displayTitle = matchedGame?.title || runningGame.game.title
  const posterUrl = matchedGame?.posterUrl || runningGame.game.posterUrl || runningGame.game.iconUrl
  const releaseYear = matchedGame?.releaseDate ? new Date(matchedGame.releaseDate).getFullYear() : null
  const genresStr = matchedGame?.genres?.slice(0, 2).join(' · ')
  const devOrGenre = matchedGame?.developer || genresStr

  return (
    <ActivityModuleSection>
      <div className="flex items-start gap-3">
        <div className="relative w-14 h-18 rounded-xl overflow-hidden shrink-0 bg-white/[0.04] shadow-md border border-white/10">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={displayTitle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Gamepad2 size={24} className="text-white/30" />
            </div>
          )}
          <div className="absolute top-1 right-1">
            <span className="block w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">
              Now Playing
            </p>
            {matchedGame?.rating != null && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400">
                <Star size={10} className="fill-amber-400 text-amber-400" />
                {matchedGame.rating.toFixed(1)}
              </span>
            )}
          </div>

          {matchedGame?.id ? (
            <Link
              to="/launcher/$gameId"
              params={{ gameId: matchedGame.id }}
              className="block text-[15px] font-bold text-white/95 hover:text-primary transition-colors truncate leading-tight"
            >
              {displayTitle}
            </Link>
          ) : (
            <h3 className="text-[15px] font-bold text-white/95 truncate leading-tight">
              {displayTitle}
            </h3>
          )}

          {devOrGenre && (
            <p className="text-[11px] text-white/50 truncate mt-0.5">
              {devOrGenre}
              {releaseYear ? ` (${releaseYear})` : ''}
            </p>
          )}

          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-white/65">
            <span className="font-bold tracking-wider">{runningGame.game.platform.toUpperCase()}</span>
            <span className="opacity-30">·</span>
            <span className="inline-flex items-center gap-1 tabular-nums font-mono text-emerald-300">
              <Clock size={10} />
              {formatDuration(elapsedMs)}
            </span>
            {runningGame.fpsSnapshot && runningGame.fpsSnapshot.currentFps > 0 && (
              <>
                <span className="opacity-30">·</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {Math.round(runningGame.fpsSnapshot.currentFps)} FPS
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </ActivityModuleSection>
  )
}
