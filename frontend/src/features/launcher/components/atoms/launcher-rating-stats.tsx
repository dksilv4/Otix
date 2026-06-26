import { useParams } from '@tanstack/react-router'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherRatingStats() {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('RatingStats')
  if (ThemedComponent) return <ThemedComponent />

  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { game: g } = useLauncherGame(gameId)
  const avgRating = (g?.data?.avgRating as number | undefined) ?? null
  const ratingCount = (g?.data?.ratingCount as number) ?? 0

  if (!avgRating || avgRating <= 0) return null

  return (
    <>
      <div className="w-px self-stretch bg-white/15" />
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-amber-400 text-lg leading-none">★</span>
        <div>
          <p className="text-lg font-black text-amber-400 tracking-tight leading-none">{(avgRating / 10).toFixed(1)}</p>
          <p className="text-[10px] font-semibold text-white/60 tracking-wide">{ratingCount > 0 ? `${ratingCount} ratings` : '—'}</p>
        </div>
      </div>
    </>
  )
}
