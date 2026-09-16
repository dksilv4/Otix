import { useNavigate } from '@tanstack/react-router'
import { MediaCard } from '@ui/molecules/media-card'
import { cn } from '@/lib/utils'
import type { DisplayGame, LocalGame } from '@/features/launcher/types'

type LauncherCardGame = LocalGame | DisplayGame

function asLocal(game: LauncherCardGame): LocalGame | null {
  if ('rawGame' in game && game.rawGame) return game.rawGame
  if ('exePath' in game && 'installDir' in game && 'platform' in game) return game
  return null
}

export function launcherMediaCardProps(game: LauncherCardGame) {
  const raw = asLocal(game)
  const data = raw?.data
  const display = game as DisplayGame
  const textless = raw?.otixTextlessPosterUrl || data?.textlessPosterUrl || display.textlessPosterUrl || null
  const backdrop = raw?.otixBackdropUrl || data?.backdropUrl || display.backdropUrl || null
  const poster = raw?.otixPosterUrl || data?.posterUrl || raw?.posterUrl || display.posterUrl || null
  const hasCleanArt = Boolean(textless || backdrop)
  const logo = hasCleanArt
    ? (raw?.otixLogoUrl || data?.logoUrl || display.logoUrl || null)
    : null

  return {
    id: raw?.otixMediaId || data?.id || display.otixMediaId || game.id,
    title: data?.title || raw?.otixMediaTitle || game.title,
    posterUrl: poster,
    textlessPosterUrl: textless || backdrop || poster,
    backdropUrl: backdrop,
    logoUrl: logo,
    logoColorGuess: data?.logoColorGuess ?? display.logoColorGuess ?? null,
    avgRating: data?.avgRating ?? null,
    ratingCount: data?.ratingCount,
    releaseDate: data?.releaseDate ?? null,
  }
}

interface LauncherMediaCardProps {
  game: LauncherCardGame
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  className?: string
  showTypeBadge?: boolean
}

export function LauncherMediaCard({
  game,
  onClick,
  onMouseEnter,
  onMouseLeave,
  className,
  showTypeBadge = true,
}: LauncherMediaCardProps) {
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
}
