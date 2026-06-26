import { useParams } from '@tanstack/react-router'
import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'

interface CompanyEntry {
  id: string
  company: { id: string; name: string; slug: string; logoUrl?: string | null }
  developer: boolean
  publisher: boolean
}

export function LauncherGameCompanies() {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { game: g } = useLauncherGame(gameId)
  const companies = g?.data?.involvedCompanies as CompanyEntry[] | undefined

  if (!companies || companies.length === 0) return null

  const roles: Array<{ key: 'developer' | 'publisher'; label: string }> = [
    { key: 'developer', label: 'Developer' },
    { key: 'publisher', label: 'Publisher' },
  ]

  return (
    <div className="absolute bottom-8 right-8 pointer-events-auto">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 justify-end max-w-xs">
        {roles.filter(r => companies.some(c => c[r.key])).map((role) => (
          <span key={role.key} className="text-[10px] text-white/35">
            <span className="uppercase tracking-wider">{role.label}</span>{' '}
            <span className="text-white/60">
              {companies.filter(c => c[role.key]).map(c => c.company.name).join(", ")}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
