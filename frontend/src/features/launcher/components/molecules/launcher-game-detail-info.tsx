import { useState, useEffect, useRef } from 'react'
import { useParams } from '@tanstack/react-router'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { MediaLogo } from '@/lib/media/media-logo'

function AnimatedRoleLabel() {
  const [label, setLabel] = useState('Developer')
  const [leaving, setLeaving] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const toggle = () => {
      setLeaving(true)
      timeoutRef.current = setTimeout(() => {
        setLabel(prev => prev === 'Developer' ? 'Publisher' : 'Developer')
        setLeaving(false)
      }, 400)
    }
    const interval = setInterval(toggle, 3000)
    return () => { clearInterval(interval); if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [])

  return (
    <span className="relative inline-block overflow-hidden h-[1em] leading-[1em] align-middle">
      <span
        className={`uppercase tracking-wider font-semibold inline-block transition-all duration-[400ms] ease-in-out ${
          leaving ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'
        }`}
      >
        {label}
      </span>
    </span>
  )
}

function LogoImage({ src, alt, colorGuess }: { src: string; alt: string; colorGuess?: string | null }) {
  return (
    <MediaLogo
      src={src}
      alt={alt}
      colorGuess={colorGuess ?? null}
      background="dark"
      shadow="drop-shadow(0 8px 40px rgba(0,0,0,0.8))"
      className="h-52 object-contain mb-3 max-w-xs"
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

interface CompanyEntry {
  id: string
  company: { id: string; name: string; slug: string; logoUrl?: string | null }
  developer: boolean
  publisher: boolean
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
  const companies = d?.involvedCompanies as CompanyEntry[] | undefined

  // Read from g.data (hydrated) or from the LocalGame directly
  const avgRating = (d?.avgRating as number | undefined) ?? null
  const ratingCount = (d?.ratingCount as number) ?? 0

  // Merge developer & publisher into animated line when same company
  const companyLines = (() => {
    if (!companies || companies.length === 0) return null
    const devCos = companies.filter(c => c.developer)
    const pubCos = companies.filter(c => c.publisher)
    const sharedNames = devCos
      .filter(d => pubCos.some(p => p.company.name === d.company.name))
      .map(c => c.company.name)
    const uniqueShared = [...new Set(sharedNames)]
    const onlyDevNames = devCos.filter(c => !uniqueShared.includes(c.company.name)).map(c => c.company.name)
    const onlyPubNames = pubCos.filter(c => !uniqueShared.includes(c.company.name)).map(c => c.company.name)

    const lines: Array<{ isAnimated: boolean; label: string; names: string[] }> = []
    if (uniqueShared.length > 0) lines.push({ isAnimated: true, label: '', names: uniqueShared })
    if (onlyDevNames.length > 0) lines.push({ isAnimated: false, label: 'Developer', names: onlyDevNames })
    if (onlyPubNames.length > 0) lines.push({ isAnimated: false, label: 'Publisher', names: onlyPubNames })
    return lines
  })()

  if (!g) return null

  return (
    <>
      {logoSrc ? <LogoImage src={logoSrc} alt={title} colorGuess={d?.logoColorGuess as string | null | undefined} /> : null}

      <h2
        className="text-4xl font-black tracking-tight text-white mb-3 uppercase drop-shadow-md"
        style={{ display: logoSrc ? 'none' : 'block' }}
      >
        {title}
      </h2>

      <p className="text-sm text-white/80 leading-relaxed font-normal max-w-xs mb-3 line-clamp-3">
        {overview || 'No description available.'}
      </p>

      <div className="flex flex-wrap gap-1.5 justify-end max-w-xs mb-3">
        {releaseDate && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/8 text-white/70 border border-white/5">
            {releaseDate.slice(0, 4)}
          </span>
        )}

        {avgRating && avgRating > 0 ? (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-400 border border-amber-500/20 flex items-center gap-1">
            ★ {(avgRating / 10).toFixed(1)}
            {ratingCount > 0 && <span className="text-[11px] text-amber-400/70 font-normal">({ratingCount})</span>}
          </span>
        ) : null}

        {ttb && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/8 text-white/70 border border-white/5">
            ~{ttb}
          </span>
        )}

        {isFree && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--color-accent)]/12 text-[var(--color-accent)] border border-[var(--color-accent)]/20">Free</span>
        )}
        {hasMultiplayer && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/15">Multiplayer</span>
        )}
        {genres?.slice(0, 3).map((genre) => (
          <span key={genre.id} className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/8 text-white/70 border border-white/5">{genre.name}</span>
        ))}
      </div>

      {companyLines && companyLines.length > 0 && (
        <div className="flex flex-col gap-0.5 items-end text-xs text-white/50 mb-4 max-w-xs">
          {companyLines.map((line, i) => (
            <span key={i}>
              {line.isAnimated ? <AnimatedRoleLabel /> : <span className="uppercase tracking-wider font-semibold">{line.label}</span>}
              {' '}
              <span className="text-white/80">{line.names.join(', ')}</span>
            </span>
          ))}
        </div>
      )}
    </>
  )
}
