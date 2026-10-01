import { Gamepad2, Clock, Star, ExternalLink } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useMatchedRunningGame } from '@/features/launcher'
import { formatDuration } from '@/lib/utils'

export function UserProfileNowPlaying() {
  const { runningGame, elapsedMs, matchedGame } = useMatchedRunningGame()

  if (!runningGame) return null

  const displayTitle = matchedGame?.title || runningGame.game.title
  const posterUrl = matchedGame?.posterUrl || runningGame.game.posterUrl || runningGame.game.iconUrl
  const releaseYear = matchedGame?.releaseDate ? new Date(matchedGame.releaseDate).getFullYear() : null
  const genresStr = matchedGame?.genres?.slice(0, 3).join(' · ')
  const dev = matchedGame?.developer

  return (
    <div
      className="mb-4 relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-xl p-3.5 sm:p-4 shadow-[0_4px_24px_rgba(16,185,129,0.15)] max-w-xl"
      style={{ animation: 'profileFadeIn 0.4s ease-out both', animationDelay: '120ms' }}
    >
      {/* Background glow */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex items-start gap-4">
        {/* Game Poster */}
        <div className="relative w-16 h-22 sm:w-20 sm:h-28 rounded-xl overflow-hidden shrink-0 bg-white/[0.04] shadow-lg border border-white/10">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={displayTitle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-emerald-950/40">
              <Gamepad2 size={28} className="text-emerald-400/60" />
            </div>
          )}
          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-md px-1.5 py-0.5 border border-emerald-500/40">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[9px] font-extrabold text-emerald-300 tracking-wider">LIVE</span>
          </div>
        </div>

        {/* Game Metadata & Live Performance */}
        <div className="min-w-0 flex-1 flex flex-col justify-between self-stretch">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Gamepad2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                Currently Playing
              </span>
              <span className="text-white/20">·</span>
              <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-emerald-300">
                <Clock size={11} />
                {formatDuration(elapsedMs)}
              </span>
            </div>

            {matchedGame?.id ? (
              <Link
                to="/launcher/$gameId"
                params={{ gameId: matchedGame.id }}
                className="group inline-flex items-center gap-1.5 text-base sm:text-lg font-bold text-white hover:text-emerald-400 transition-colors leading-tight"
              >
                <span className="truncate">{displayTitle}</span>
                <ExternalLink size={13} className="shrink-0 text-white/30 group-hover:text-emerald-400 transition-colors" />
              </Link>
            ) : (
              <h3 className="text-base sm:text-lg font-bold text-white leading-tight truncate">
                {displayTitle}
              </h3>
            )}

            <div className="flex flex-wrap items-center gap-x-2 text-xs text-white/60 mt-1">
              {dev && <span>{dev}</span>}
              {dev && releaseYear && <span className="text-white/20">·</span>}
              {releaseYear && <span>{releaseYear}</span>}
              {genresStr && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="text-white/40">{genresStr}</span>
                </>
              )}
              {matchedGame?.rating != null && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                    <Star size={11} className="fill-amber-400 text-amber-400" />
                    {matchedGame.rating.toFixed(1)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Live Performance metrics badge */}
          {runningGame.fpsSnapshot && runningGame.fpsSnapshot.currentFps > 0 && (
            <div className="mt-2.5 inline-flex items-center gap-2 rounded-lg bg-white/[0.06] border border-white/10 px-2.5 py-1 text-xs text-white/80 self-start">
              <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Performance</span>
              <span className="text-white/20">|</span>
              <span className="font-mono font-bold text-emerald-400">
                {Math.round(runningGame.fpsSnapshot.currentFps)} FPS
              </span>
              {runningGame.fpsSnapshot.frameCount > 0 && (
                <span className="text-[10px] text-white/40 font-mono">
                  ({runningGame.fpsSnapshot.frameCount.toLocaleString()} frames)
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
