import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Image } from '@ui/atoms/image'
import { Badge } from '@ui/atoms/badge'
import { PersonCard } from '@person/molecules/person-card'

interface CreditItem {
  id: string
  person: { id: string; name: string; photoUrl?: string }
  role: string
  characterName?: string
  sortOrder: number
}

interface CastCrewListProps {
  credits: CreditItem[]
  className?: string
}

function groupByRole(credits: CreditItem[]) {
  const cast = credits.filter((c) => c.role === 'cast')
  const directors = credits.filter((c) => c.role === 'director')
  const writers = credits.filter((c) => c.role === 'writer')
  const producers = credits.filter((c) => c.role === 'producer')
  const composers = credits.filter((c) => c.role === 'composer')
  const crew = credits.filter(
    (c) => !['cast', 'director', 'writer', 'producer', 'composer'].includes(c.role),
  )
  return { cast, directors, writers, producers, composers, crew }
}

const roleLabel: Record<string, string> = {
  director: 'Director',
  writer: 'Writer',
  producer: 'Producer',
}

function KeyCrewCard({ credit }: { credit: CreditItem }) {
  return (
    <Link
      to="/person/$personId"
      params={{ personId: credit.person.id }}
      className="flex items-center gap-3 rounded-xl bg-card p-3 transition-colors hover:bg-card/80"
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-primary/20">
        <Image
          src={credit.person.photoUrl}
          alt={credit.person.name}
          className="h-full w-full"
          fallback={credit.person.name[0]}
        />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{credit.person.name}</p>
        <Badge variant="secondary" className="mt-0.5 text-[10px]">
          {roleLabel[credit.role] ?? credit.role}
        </Badge>
      </div>
    </Link>
  )
}

function CreditRow({ label, items }: { label: string; items: CreditItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </h4>

      <div
        className="flex gap-3 overflow-x-auto overscroll-x-contain scroll-smooth scrollbar-none pb-2"
        aria-label={`${label} credits`}
      >
        {items.map((c) => (
          <PersonCard
            key={c.id}
            id={c.person.id}
            name={c.person.name}
            imageUrl={c.person.photoUrl}
            role={c.characterName || c.role}
          />
        ))}
      </div>
    </div>
  )
}

export function CastCrewList({ credits, className }: CastCrewListProps) {
  const { cast, directors, writers, producers, composers, crew } = groupByRole(credits)
  const keyCrew = [...directors, ...writers, ...producers]

  if (credits.length === 0) return null

  return (
    <div className={cn('space-y-8', className)}>
      {keyCrew.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Key Crew</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {keyCrew.map((c) => (
              <KeyCrewCard key={c.id} credit={c} />
            ))}
          </div>
        </section>
      )}

      {(cast.length > 0 || composers.length > 0 || crew.length > 0) && (
        <section className="space-y-5">
          <h2 className="text-lg font-semibold">Cast & Crew</h2>
          <CreditRow label="Cast" items={cast} />
          <CreditRow label="Composers" items={composers} />
          <CreditRow label="Crew" items={crew} />
        </section>
      )}
    </div>
  )
}
