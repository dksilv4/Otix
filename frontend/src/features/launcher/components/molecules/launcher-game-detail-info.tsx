import { useParams } from '@tanstack/react-router'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

function LogoImage({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className="h-52 object-contain mb-6 drop-shadow-[0_8px_40px_rgba(0,0,0,0.8)] max-w-[600px]"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none'
        const sib = (e.target as HTMLImageElement).nextSibling as HTMLElement
        if (sib) sib.style.display = 'block'
      }}
    />
  )
}

function formatTimeToBeat(ttb: Record<string, unknown> | undefined): string | null {
  if (!ttb) return null
  const main = ttb.mainStory as number | undefined
  const extras = ttb.mainPlusExtras as number | undefined
  const comp = ttb.completionist as number | undefined
  if (main && extras) return `${Math.round(main / 3600)}h`
  if (main) return `${Math.round(main / 3600)}h`
  if (extras) return `${Math.round(extras / 3600)}h`
  if (comp) return `${Math.round(comp / 3600)}h`
  return null
}

export function LauncherGameDetailInfo() {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { game: g } = useLauncherGame(gameId)
  const d = g?.data

  if (!g) return null

  const logoSrc = (d?.logoUrl as string | undefined)
  const title = (d?.title as string) || g.title
  const overview = (d?.overview as string | undefined) || g.description
  const releaseDate = d?.releaseDate as string | undefined
  const isFree = d?.isFree as boolean | undefined
  const hasMultiplayer = d?.hasMultiplayer as boolean | undefined
  const genres = d?.genres as { id: string; name: string }[] | undefined
  const ttb = formatTimeToBeat((d as unknown as Record<string, unknown>)?.timeToBeat as Record<string, unknown> | undefined)

  // Read from g.data (hydrated) or from the LocalGame directly
  const avgRating = (d?.avgRating as number | undefined) ?? null
  const ratingCount = (d?.ratingCount as number) ?? 0

  const { component } = useLauncherTheme()
  const ThemedComponent = component('GameDetailInfo')
  if (ThemedComponent) return <ThemedComponent />

  return (
    <>
      {logoSrc ? <LogoImage src={logoSrc} alt={title} /> : null}

      <h2
        className="text-4xl font-black tracking-tight text-white mb-3 uppercase drop-shadow-md"
        style={{ display: logoSrc ? 'none' : 'block' }}
      >
        {title}
      </h2>

      <p className="text-[11px] text-white/60 leading-relaxed font-normal max-w-xs mb-3 line-clamp-3">
        {overview || 'No description available.'}
      </p>

      <div className="flex flex-wrap gap-1.5 justify-end max-w-xs mb-4">
        {releaseDate && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/8 text-white/50 border border-white/5">
            {releaseDate.slice(0, 4)}
          </span>
        )}

        {avgRating && avgRating > 0 ? (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-400 border border-amber-500/20 flex items-center gap-1">
            ★ {(avgRating / 10).toFixed(1)}
            {ratingCount > 0 && <span className="text-[9px] text-amber-400/60 font-normal">({ratingCount})</span>}
          </span>
        ) : null}

        {ttb && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/8 text-white/50 border border-white/5">
            ~{ttb}
          </span>
        )}

        {isFree && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-accent)]/12 text-[var(--color-accent)] border border-[var(--color-accent)]/20">Free</span>
        )}
        {hasMultiplayer && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/15">Multiplayer</span>
        )}
        {genres?.slice(0, 3).map((genre) => (
          <span key={genre.id} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/8 text-white/50 border border-white/5">{genre.name}</span>
        ))}
      </div>
    </>
  )
}
