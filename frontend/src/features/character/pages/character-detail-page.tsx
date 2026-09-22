import { useState } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { User, Gamepad2, Star, Calendar } from 'lucide-react'
import { Image } from '@ui/atoms/image'
import { Skeleton } from '@ui/atoms/skeleton'
import { Badge } from '@ui/atoms/badge'
import { characterQueries } from '../queries/character-queries'
import { cn } from '@/lib/utils'

export function CharacterDetailPage() {
  const params = useParams({ from: '/character/$characterId' })
  const characterId = params.characterId || ''
  const [descExpanded, setDescExpanded] = useState(false)

  const ptClass = 'pt-4 sm:pt-6'
  const { data: character, isLoading, isError } = useQuery(characterQueries.detail(characterId))

  if (isLoading) {
    return (
      <div className={`mx-auto max-w-5xl px-4 ${ptClass} pb-16 sm:px-6 lg:px-8 space-y-8`}>
        <div className="flex flex-col sm:flex-row gap-6 p-6 rounded-3xl bg-zinc-950/40">
          <Skeleton className="w-36 h-48 rounded-2xl shrink-0" />
          <div className="space-y-3 flex-1">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !character) {
    return (
      <div className={`flex min-h-[50vh] items-center justify-center px-4 ${ptClass}`}>
        <div className="text-center space-y-3">
          <h2 className="text-lg font-semibold">Character not found</h2>
          <Link to="/" className="text-sm text-primary hover:underline">
            Go back home
          </Link>
        </div>
      </div>
    )
  }

  const showDescExpand = (character.description?.length ?? 0) > 300
  const games = character.games ?? []

  return (
    <div
      id="character-detail-page"
      className={`mx-auto max-w-5xl px-4 ${ptClass} pb-16 sm:px-6 lg:px-8 space-y-10`}
    >
      <Helmet>
        <title>{`${character.name} - Game Character - Otix`}</title>
        <meta name="description" content={character.description || `Game character profile for ${character.name}`} />
        <meta property="og:title" content={`${character.name} - Otix`} />
        <meta property="og:description" content={character.description || `Game character profile for ${character.name}`} />
        {character.mugShotUrl && <meta property="og:image" content={character.mugShotUrl} />}
      </Helmet>

      {/* ── Hero Banner ── */}
      <div className="relative overflow-hidden rounded-3xl bg-zinc-950/40 p-6 sm:p-8 md:p-10 shadow-[0_32px_80px_rgba(0,0,0,0.5)] backdrop-blur-md border border-white/[0.06]">
        {character.mugShotUrl && (
          <>
            <div
              className="absolute inset-0 -z-10 bg-cover bg-center opacity-15 blur-[40px] scale-110 select-none pointer-events-none"
              style={{ backgroundImage: `url(${character.mugShotUrl})` }}
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-zinc-950/40 pointer-events-none" />
          </>
        )}

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8">
          {/* Portrait / Mugshot */}
          <div className="relative w-36 sm:w-44 aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl bg-zinc-900 border border-white/10 shrink-0">
            {character.mugShotUrl ? (
              <Image
                src={character.mugShotUrl}
                alt={character.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground bg-zinc-900/80">
                <User className="h-12 w-12 stroke-[1.5] mb-2 opacity-50" />
                <span className="text-[11px] font-medium uppercase tracking-wider">No Photo</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 text-center sm:text-left space-y-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="text-xs uppercase font-bold tracking-wider text-primary">
                  Game Character
                </span>
                {character.species && (
                  <Badge variant="outline" className="text-[11px] capitalize border-white/15 bg-white/5">
                    {character.species}
                  </Badge>
                )}
                {character.gender && (
                  <Badge variant="outline" className="text-[11px] capitalize border-white/15 bg-white/5">
                    {character.gender.replace('_', ' ')}
                  </Badge>
                )}
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                {character.name}
              </h1>
            </div>

            {character.description && (
              <div className="text-sm text-white/70 leading-relaxed max-w-2xl">
                <p className={cn(!descExpanded && showDescExpand && 'line-clamp-4')}>
                  {character.description}
                </p>
                {showDescExpand && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded(!descExpanded)}
                    className="mt-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    {descExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Games Appearances Section ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="h-4 w-0.5 rounded-full bg-primary shrink-0" />
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Appears in</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/70">
              {games.length}
            </span>
          </h2>
        </div>

        {games.length === 0 ? (
          <div className="p-8 rounded-2xl glass-card text-center text-sm text-white/50">
            No games recorded for this character yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {games.map((g) => (
              <Link
                key={g.id}
                to="/media/$mediaType/$mediaId"
                params={{ mediaType: g.mediaType || 'game', mediaId: g.slug || g.id }}
                className="group relative rounded-xl overflow-hidden glass-card hover:ring-2 hover:ring-primary/50 transition-all duration-300 flex flex-col"
              >
                <div className="aspect-[2/3] w-full relative overflow-hidden bg-zinc-900">
                  {g.posterUrl ? (
                    <Image
                      src={g.posterUrl}
                      alt={g.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Gamepad2 className="h-8 w-8 opacity-40" />
                    </div>
                  )}
                  {g.avgRating != null && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-md">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span>{g.avgRating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
                <div className="p-2.5 flex-1 flex flex-col justify-between">
                  <h3 className="text-xs font-semibold text-white line-clamp-2 group-hover:text-primary transition-colors">
                    {g.title}
                  </h3>
                  {g.releaseDate && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-white/40">
                      <Calendar className="h-3 w-3" />
                      <span>{g.releaseDate.slice(0, 4)}</span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
