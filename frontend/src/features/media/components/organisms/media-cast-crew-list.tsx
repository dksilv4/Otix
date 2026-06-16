import { cn } from '@/lib/utils'
import { KeyCrewCard } from './media-cast-crew-key-card'
import { CreditRow } from './media-cast-crew-credit-row'
import { groupByRole } from '@media'

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

export function CastCrewList({ credits, className }: CastCrewListProps) {
  const { cast, directors, writers, producers, composers, crew } = groupByRole(credits)
  const keyCrew = [...directors, ...writers, ...producers]

  if (credits.length === 0) return null

  return (
    <div className={cn('space-y-8', className)}>
      {keyCrew.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Key Crew</h2>
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
