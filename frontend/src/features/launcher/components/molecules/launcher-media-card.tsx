import { useNavigate } from '@tanstack/react-router'
import { MediaCard } from '@ui/molecules/media-card'
import { cn } from '@/lib/utils'
import { asLocal, launcherMediaCardProps, type LauncherCardGame } from '@/features/launcher/utils'

interface LauncherMediaCardProps {
  game: LauncherCardGame
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  className?: string
  showTypeBadge?: boolean
}

export const LauncherMediaCard = ({
  game,
  onClick,
  onMouseEnter,
  onMouseLeave,
  className,
  showTypeBadge = true,
}: LauncherMediaCardProps) => {
  const navigate = useNavigate()
  const art = launcherMediaCardProps(game)
  const raw = asLocal(game)

  const open = () => {
    if (onClick) {
      onClick()
      return
    }
    void navigate({ to: '/launcher/$gameId', params: { gameId: game.id } })
  }

  return (
    <button
      type="button"
      onClick={open}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn('block text-left cursor-pointer', className)}
      title={raw?.description || art.title}
    >
      <MediaCard
        id={art.id}
        mediaType="game"
        title={art.title}
        posterUrl={art.posterUrl}
        textlessPosterUrl={art.textlessPosterUrl}
        backdropUrl={art.backdropUrl}
        logoUrl={art.logoUrl}
        logoColorGuess={art.logoColorGuess}
        avgRating={art.avgRating}
        ratingCount={art.ratingCount}
        releaseDate={art.releaseDate}
        interactive={false}
        showTypeBadge={showTypeBadge}
        className="w-full"
      />
    </button>
  )
};
