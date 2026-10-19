import { useParams } from '@tanstack/react-router'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'

export const LauncherRatingStats = () => {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { game: g } = useLauncherGame(gameId)
  const avgRating = (g?.data?.avgRating as number | undefined) ?? null
  const ratingCount = (g?.data?.ratingCount as number) ?? 0

  if (!avgRating || avgRating <= 0) return null

  return (
    <>
      <div className="w-px self-stretch bg-[var(--dk-separator)]" />
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-amber-500 dark:text-amber-400 text-lg leading-none">★</span>
        <div>
          <p className="text-lg font-black text-amber-500 dark:text-amber-400 tracking-tight leading-none">{(avgRating / 10).toFixed(1)}</p>
          <p className="text-[10px] font-semibold text-muted-foreground tracking-wide">{ratingCount > 0 ? `${ratingCount} ratings` : '—'}</p>
        </div>
      </div>
    </>
  )
};
