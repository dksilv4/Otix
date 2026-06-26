import { useParams } from '@tanstack/react-router'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { heroImage } from '@/features/launcher/utils'

export function RetroHero() {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { data: game } = useLauncherGame(gameId)

  return (
    <div className="relative w-full h-[40vh] overflow-hidden bg-black font-mono">
      {/* CRT scanlines overlay */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background: 'repeating-linear-gradient(0deg, rgba(0,255,65,0.03) 0px, rgba(0,255,65,0.03) 1px, transparent 1px, transparent 3px)',
        }}
      />
      {/* Phosphor glow */}
      <div className="absolute inset-0 z-[5] pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(0,255,65,0.08)_0%,transparent_70%)]" />
      {/* Background image */}
      {game?.cover_url && (
        <img
          src={heroImage(game.cover_url)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-30"
          style={{ filter: 'grayscale(100%) brightness(0.6)' }}
        />
      )}
      {/* Game title */}
      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <div className="text-center">
          <h1
            className="text-4xl font-bold tracking-[0.2em] uppercase"
            style={{
              color: '#00ff41',
              fontFamily: '"Courier New", monospace',
              textShadow: '0 0 10px rgba(0,255,65,0.5), 0 0 40px rgba(0,255,65,0.2)',
            }}
          >
            {game?.name ?? 'Otix Launcher'}
          </h1>
          <div className="mt-2 text-[#00ff41]/60 text-sm tracking-[0.15em] animate-pulse">
            PRESS START
          </div>
        </div>
      </div>
    </div>
  )
}
