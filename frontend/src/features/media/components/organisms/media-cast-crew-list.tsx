import { KeyCrewCard } from './media-cast-crew-key-card'
import { CreditRow } from './media-cast-crew-credit-row'
import { Carousel } from '@/old-features/dk-ui/molecules/carousel'
import { groupByRole } from '@media'

export interface CreditItem {
  id: string
  person: { id: string; name: string; photoUrl?: string } | null
  role: string
  characterName?: string
  sortOrder: number
}

interface CastCrewListProps {
  credits?: CreditItem[]
}

export function CastCrewList({ credits = [] }: CastCrewListProps) {
  const keyCrew = credits.filter((c) => c.role === 'cast' && c.sortOrder <= 0)
  const { cast, writers, producers, composers, crew } = groupByRole(credits)

  if (credits.length === 0) return null

  return (
    <div className="p-6 sm:p-8 space-y-6">
      {keyCrew.length > 0 && (
        <Carousel title="Key Crew" minItemWidth={260} gap={10} showArrows={false}>
          {keyCrew.map((c) => (
            <KeyCrewCard key={c.id} credit={c} />
          ))}
        </Carousel>
      )}

      {(cast.length > 0 || composers.length > 0 || writers.length > 0 || producers.length > 0 || crew.length > 0) && (
        <div className="space-y-5">
          {cast.length > 0 && <hr className="border-white/5" />}
          <CreditRow label="Cast" items={cast} />
          {composers.length > 0 && <CreditRow label="Composers" items={composers} />}
          {writers.length > 0 && <CreditRow label="Writers" items={writers} />}
          {producers.length > 0 && <CreditRow label="Producers" items={producers} />}
          {crew.length > 0 && <CreditRow label="Crew" items={crew} />}
        </div>
      )}
    </div>
  )
}
