// TODO: Review this file
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Image } from '@ui/atoms/image'
import { Badge } from '@ui/atoms/badge'
import { PersonCard } from '@person/molecules/person-card'
import './cast-crew-list.scss'

interface CreditItem {
  id: string
  person: { id: string; name: string; photoUrl?: string } | null
  role: string
  characterName?: string
  sortOrder: number
}

interface CastCrewListProps {
  credits: CreditItem[]
  className?: string
}

function groupByRole(credits: CreditItem[]) {
  // Safety: skip credits where person is null (person record was deleted)
  const valid = credits.filter((c) => c.person != null)
  const cast = valid.filter((c) => c.role === 'cast')
  const directors = valid.filter((c) => c.role === 'director')
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
      className="dk-media-cast-crew-list__card"
    >
      <div className="dk-media-cast-crew-list__card-avatar">
        <Image
          src={credit.person.photoUrl}
          alt={credit.person.name}
          className="h-full w-full"
          fallback={credit.person.name[0]}
        />
      </div>
      <div className="dk-media-cast-crew-list__card-info">
        <p className="dk-media-cast-crew-list__card-name">{credit.person.name}</p>
        <Badge variant="secondary" className="dk-media-cast-crew-list__card-role">
          {roleLabel[credit.role] ?? credit.role}
        </Badge>
      </div>
    </Link>
  )
}

function CreditRow({ label, items }: { label: string; items: CreditItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="dk-media-cast-crew-list__row">
      <h4 className="dk-media-cast-crew-list__row-label">
        {label}
      </h4>

      <div
        className="dk-media-cast-crew-list__row-list"
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
    <div className={cn('dk-media-cast-crew-list', className)}>
      {keyCrew.length > 0 && (
        <section>
          <h2 className="dk-media-cast-crew-list__title dk-media-cast-crew-list__title--key">Key Crew</h2>
          <div className="dk-media-cast-crew-list__grid">
            {keyCrew.map((c) => (
              <KeyCrewCard key={c.id} credit={c} />
            ))}
          </div>
        </section>
      )}

      {(cast.length > 0 || composers.length > 0 || crew.length > 0) && (
        <section className="dk-media-cast-crew-list__section--crew">
          <h2 className="dk-media-cast-crew-list__title">Cast & Crew</h2>
          <CreditRow label="Cast" items={cast} />
          <CreditRow label="Composers" items={composers} />
          <CreditRow label="Crew" items={crew} />
        </section>
      )}
    </div>
  )
}
