import { useState, useEffect } from 'react'
import { useParams } from '@tanstack/react-router'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { MediaLogo } from '@/lib/media/media-logo'

export const LauncherGameDetailInfo = () => {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { game: g } = useLauncherGame(gameId)
  const d = g?.data

  const logoSrc = d?.logoUrl as string | undefined
  const [logoFailed, setLogoFailed] = useState(false)

  useEffect(() => {
    setLogoFailed(false)
  }, [logoSrc])

  if (!g) return null

  const title = (d?.title as string) || g.title
  const overview = (d?.overview as string | undefined) || g.description

  return (
    <div className="flex flex-col items-end text-right">
      {logoSrc && !logoFailed ? (
        <MediaLogo
          src={logoSrc}
          alt={title}
          colorGuess={d?.logoColorGuess as string | null | undefined}
          background="dark"
          shadow="drop-shadow(0 8px 40px rgba(0,0,0,0.8))"
          className="h-36 sm:h-44 md:h-48 object-contain mb-4 max-w-sm"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-foreground mb-4 uppercase drop-shadow-lg">
          {title}
        </h2>
      )}

      <p className="text-sm text-foreground/80 leading-relaxed font-normal max-w-sm sm:max-w-md mb-6 line-clamp-3 select-text drop-shadow">
        {overview || 'No description available.'}
      </p>
    </div>
  )
};
