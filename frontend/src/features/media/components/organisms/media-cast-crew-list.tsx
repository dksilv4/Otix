import { useQuery } from '@tanstack/react-query'
import { KeyCrewCard } from './media-cast-crew-key-card'
import { CreditRow } from './media-cast-crew-credit-row'
import { Carousel } from '@/old-features/dk-ui/molecules/carousel'
import { groupByRole, mediaQueries, useMediaParams } from '@media'

interface CreditItem {
  id: string
  person: { id: string; name: string; photoUrl?: string } | null
  role: string
  characterName?: string
  sortOrder: number
}

export function CastCrewList({ className }: { className?: string } = {}) {
  const { mediaType, mediaId } = useMediaParams()

  const { data } = useQuery(mediaQueries.detail(mediaType, mediaId))
  if (!data || !data.credits || data.credits.length === 0) return null
  const credits = data.credits

  const { cast, directors, writers, producers, composers, crew } = groupByRole(credits)
  const keyCrew = [...directors, ...writers, ...producers]

  return (
    <div className={`glass-card p-6 sm:p-8 space-y-6 ${className || ''}`}>
      <h2 className="text-lg font-semibold">Cast & Crew</h2>

      {keyCrew.length > 0 && (
        <section>
          <Carousel title="Key Crew" minItemWidth={260} gap={10} showArrows={false}>
            {keyCrew.map((c) => (
              <KeyCrewCard key={c.id} credit={c} />
            ))}
          </Carousel>
        </section>
      )}

      {(cast.length > 0 || composers.length > 0 || crew.length > 0) && (
        <section className="space-y-5">
          {keyCrew.length > 0 && <hr className="border-white/5" />}
          <CreditRow label="Cast" items={cast} />
          <CreditRow label="Composers" items={composers} />
          <CreditRow label="Crew" items={crew} />
        </section>
      )}
    </div>
  )
}
