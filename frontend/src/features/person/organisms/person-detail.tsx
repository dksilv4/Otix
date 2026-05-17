import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { Image } from '@ui/atoms/image'
import { MediaCard } from '@ui/molecules/media-card'
import { personQueries } from '../person-queries'
import { Skeleton } from '@ui/atoms/skeleton'

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function PersonDetail() {
  const params = useParams({ strict: false }) as { personId?: string }
  const personId = params.personId || ''

  const { data: person, isLoading, isError } = useQuery(personQueries.detail(personId))
  const { data: relatedArtists } = useQuery(personQueries.related(personId))

  if (isLoading) {
    return (
      <div className="mx-auto lg:max-w-5xl space-y-8 px-4 pt-24 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <Skeleton className="h-40 w-40 rounded-full" />
          <div className="space-y-3 text-center sm:text-left">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-20 w-96" />
          </div>
        </div>
      </div>
    )
  }

  if (isError || !person) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 pt-24">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Person not found</h2>
          <a href="/" className="text-sm text-primary hover:underline">Go back home</a>
        </div>
      </div>
    )
  }

  const groupedCredits = person.credits.reduce<Record<string, typeof person.credits>>((acc, c) => {
    const type = c.mediaItem.mediaType || 'other'
    if (!acc[type]) acc[type] = []
    acc[type].push(c)
    return acc
  }, {})

  const creditOrder = ['music', 'movie', 'show', 'game', 'other']
  const creditLabels: Record<string, string> = {
    music: 'Music',
    movie: 'Movies',
    show: 'Shows',
    game: 'Games',
    other: 'Other',
  }

  return (
    <div className="mx-auto lg:max-w-5xl space-y-10 px-4 pt-24 pb-16 sm:px-6 lg:px-8">
      <Helmet>
        <title>{`${person.name} - Otix`}</title>
        <meta name="description" content={person.bio?.slice(0, 200) || `Credits for ${person.name}`} />
        {person.photoUrl && <meta property="og:image" content={person.photoUrl} />}
      </Helmet>

      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <div className="h-36 w-36 shrink-0 overflow-hidden rounded-full ring-2 ring-border sm:h-44 sm:w-44">
          <Image
            src={person.photoUrl ?? undefined}
            alt={person.name}
            className="h-full w-full"
            fallback={person.name[0]}
          />
        </div>

        <div className="min-w-0 text-center sm:text-left">
          <h1 className="text-2xl font-bold sm:text-3xl">{person.name}</h1>
          {person.knownFor && (
            <p className="mt-1 text-sm text-muted-foreground">{person.knownFor}</p>
          )}
          <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground sm:justify-start">
            {person.birthDate && <span>{formatDate(person.birthDate)}</span>}
            {person.deathDate && <span>– {formatDate(person.deathDate)}</span>}
            {person.birthplace && <span>{person.birthplace}</span>}
          </div>
          {person.bio && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {person.bio.length > 500 ? person.bio.slice(0, 500) + '…' : person.bio}
            </p>
          )}
        </div>
      </div>

      {creditOrder.map((type) => {
        const items = groupedCredits[type]
        if (!items || items.length === 0) return null

        return (
          <section key={type}>
            <h2 className="mb-3 text-lg font-semibold">{creditLabels[type] ?? type}</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {items.map((c) => (
                <div key={c.id} className="w-36 shrink-0">
                  <MediaCard
                    id={c.mediaItem.id}
                    mediaType={c.mediaItem.mediaType as 'movie' | 'show' | 'game' | 'music'}
                    title={c.mediaItem.title}
                    posterUrl={c.mediaItem.posterUrl}
                    releaseDate={c.mediaItem.releaseDate}
                    showTypeBadge={false}
                    zoomed={false}
                  />
                  <p className="mt-1 text-center text-[11px] text-muted-foreground truncate">
                    {c.characterName || c.role}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )
      })}

      {relatedArtists && relatedArtists.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Fans Also Like</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {relatedArtists.map((artist) => (
              <div key={artist.spotify_artist_id || artist.name} className="w-36 shrink-0 text-center">
                <div className="aspect-square w-full overflow-hidden rounded-full ring-1 ring-border">
                  {artist.image_url ? (
                    <img
                      src={artist.image_url}
                      alt={artist.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[var(--dk-surface-glass)] text-2xl font-bold text-muted-foreground">
                      {artist.name[0]}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs font-medium truncate">{artist.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
