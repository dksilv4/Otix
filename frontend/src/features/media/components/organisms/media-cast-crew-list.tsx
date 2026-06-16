import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { KeyCrewCard } from './media-cast-crew-key-card'
import { CreditRow } from './media-cast-crew-credit-row'
import { groupByRole, mediaQueries, mediaTypeFromParam } from '@media'

interface CreditItem {
  id: string
  person: { id: string; name: string; photoUrl?: string } | null
  role: string
  characterName?: string
  sortOrder: number
}

export function CastCrewList({ className }: { className?: string } = {}) {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = mediaTypeFromParam(params.mediaType || 'movie')
  const mediaId = params.mediaId || ''

  const { data } = useQuery(mediaQueries.detail(mediaType, mediaId))
  if (!data || !data.credits || data.credits.length === 0) return null
  const credits = data.credits

  const { cast, directors, writers, producers, composers, crew } = groupByRole(credits)
  const keyCrew = [...directors, ...writers, ...producers]

  return (
    <div className={`space-y-8 ${className || ''}`}>
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
