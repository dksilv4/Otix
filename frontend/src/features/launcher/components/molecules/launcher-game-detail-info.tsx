import { useParams } from '@tanstack/react-router'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { MediaLogo } from '@/lib/media/media-logo'

const LogoImage = ({ src, alt, colorGuess }: { src: string; alt: string; colorGuess?: string | null }) => {
  return (
    <MediaLogo
      src={src}
      alt={alt}
      colorGuess={colorGuess ?? null}
      background="dark"
      shadow="drop-shadow(0 8px 40px rgba(0,0,0,0.8))"
      className="h-36 sm:h-44 md:h-48 object-contain mb-4 max-w-sm"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none'
        const sib = (e.target as HTMLImageElement).nextSibling as HTMLElement
        if (sib) sib.style.display = 'block'
      }}
    />
  )
};

export const LauncherGameDetailInfo = () => {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { game: g } = useLauncherGame(gameId)
  const d = g?.data

  if (!g) return null

  const logoSrc = (d?.logoUrl as string | undefined)
  const title = (d?.title as string) || g.title
  const overview = (d?.overview as string | undefined) || g.description

  return (
    <div className="flex flex-col items-end text-right">
      {logoSrc ? (
        <LogoImage src={logoSrc} alt={title} colorGuess={d?.logoColorGuess as string | null | undefined} />
      ) : (
        <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-4 uppercase drop-shadow-lg">
          {title}
        </h2>
      )}

      <p className="text-sm text-white/75 leading-relaxed font-normal max-w-sm sm:max-w-md mb-6 line-clamp-3 select-text drop-shadow">
        {overview || 'No description available.'}
      </p>
    </div>
  )
};
