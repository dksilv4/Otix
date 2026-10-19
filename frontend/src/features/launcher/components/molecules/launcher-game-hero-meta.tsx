import { useState, useEffect, useRef } from 'react'
import { useParams } from '@tanstack/react-router'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { formatTimeToBeat } from '@/features/launcher/utils'

const AnimatedRoleLabel = () => {
  const [label, setLabel] = useState('Developer')
  const [leaving, setLeaving] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const toggle = () => {
      setLeaving(true)
      timeoutRef.current = setTimeout(() => {
        setLabel((prev) => (prev === 'Developer' ? 'Publisher' : 'Developer'))
        setLeaving(false)
      }, 400)
    }
    const interval = setInterval(toggle, 3000)
    return () => {
      clearInterval(interval)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
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
};

interface CompanyEntry {
  id: string
  company: { id: string; name: string; slug: string; logoUrl?: string | null }
  developer: boolean
  publisher: boolean
}

export const LauncherGameHeroMeta = () => {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { game: g } = useLauncherGame(gameId)
  const d = g?.data

  if (!g) return null

  const releaseDate = d?.releaseDate as string | undefined
  const isFree = d?.isFree as boolean | undefined
  const hasMultiplayer = d?.hasMultiplayer as boolean | undefined
  const genres = d?.genres as { id: string; name: string }[] | undefined
  const ttb = formatTimeToBeat(
    (d as unknown as Record<string, unknown>)?.timeToBeat as Record<string, unknown> | undefined
  )
  const companies = d?.involvedCompanies as CompanyEntry[] | undefined

  // Merge developer & publisher into animated line when same company
  const companyLines = (() => {
    if (!companies || companies.length === 0) return null
    const devCos = companies.filter((c) => c.developer)
    const pubCos = companies.filter((c) => c.publisher)
    const sharedNames = devCos
      .filter((d) => pubCos.some((p) => p.company.name === d.company.name))
      .map((c) => c.company.name)
    const uniqueShared = [...new Set(sharedNames)]
    const onlyDevNames = devCos
      .filter((c) => !uniqueShared.includes(c.company.name))
      .map((c) => c.company.name)
    const onlyPubNames = pubCos
      .filter((c) => !uniqueShared.includes(c.company.name))
      .map((c) => c.company.name)

    const lines: Array<{ isAnimated: boolean; label: string; names: string[] }> = []
    if (uniqueShared.length > 0) lines.push({ isAnimated: true, label: '', names: uniqueShared })
    if (onlyDevNames.length > 0) lines.push({ isAnimated: false, label: 'Developer', names: onlyDevNames })
    if (onlyPubNames.length > 0) lines.push({ isAnimated: false, label: 'Publisher', names: onlyPubNames })
    return lines
  })()

  const hasTags = Boolean(releaseDate || isFree || hasMultiplayer || (genres && genres.length > 0) || ttb)

  if (!companyLines?.length && !hasTags) return null

  return (
    <div className="flex items-center flex-wrap gap-2.5">
      {/* Publisher / Developer Info */}
      {companyLines && companyLines.length > 0 && (
        <div className="flex items-center gap-2 bg-[var(--dk-surface-glass)] backdrop-blur-2xl rounded-2xl px-4 py-3 border border-[var(--dk-separator)] text-xs text-foreground shadow-[var(--dk-shadow-glass)]">
          {companyLines.map((line, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                {line.isAnimated ? <AnimatedRoleLabel /> : line.label}
              </span>
              <span className="text-foreground font-medium">{line.names.join(', ')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Metadata Tags */}
      {hasTags && (
        <div className="flex items-center flex-wrap gap-1.5 bg-[var(--dk-surface-glass)] backdrop-blur-2xl rounded-2xl px-3.5 py-2.5 border border-[var(--dk-separator)] shadow-[var(--dk-shadow-glass)]">
          {releaseDate && (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-xl bg-[var(--dk-surface-ghost)] text-foreground border border-[var(--dk-separator)]">
              {releaseDate.slice(0, 4)}
            </span>
          )}
          {isFree && (
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-xl bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/25">
              Free
            </span>
          )}
          {hasMultiplayer && (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-xl bg-blue-500/15 text-blue-500 dark:text-blue-400 border border-blue-500/25">
              Multiplayer
            </span>
          )}
          {ttb && (
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-xl bg-[var(--dk-surface-ghost)] text-muted-foreground border border-[var(--dk-separator)]">
              ~{ttb}
            </span>
          )}
          {genres?.slice(0, 3).map((genre) => (
            <span
              key={genre.id}
              className="text-xs font-medium px-2.5 py-0.5 rounded-xl bg-[var(--dk-surface-ghost)] text-muted-foreground border border-[var(--dk-separator)]"
            >
              {genre.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
};
