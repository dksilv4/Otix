import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { heroImage } from '@/features/launcher/utils'

export function MinimalHero() {
  const { data: game } = useLauncherGame()

  return (
    <div className="relative w-full h-[30vh] bg-[#111] flex items-center px-8">
      {game?.cover_url && (
        <img
          src={heroImage(game.cover_url)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
      )}
      <div className="relative z-10">
        <h1 className="text-3xl font-bold text-white">{game?.name ?? 'Otix'}</h1>
        {game?.summary && (
          <p className="mt-2 text-sm text-white/60 max-w-lg line-clamp-2">{game.summary}</p>
        )}
      </div>
    </div>
  )
}
