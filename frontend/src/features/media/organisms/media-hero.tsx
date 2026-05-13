import { Badge } from '@ui/atoms/badge'
import { Image } from '@ui/atoms/image'
import { cn } from '@/lib/utils'
import { Calendar, Clock } from 'lucide-react'

interface ExternalRating {
  id: string
  provider: string
  score: number
  maxScore: number
  voteCount?: number
}

interface Genre {
  id: string
  name: string
  slug: string
}

interface MediaHeroProps {
  mediaType: 'movie' | 'show' | 'game' | 'music'
  title: string
  backdropUrl?: string | null
  posterUrl?: string | null
  logoUrl?: string | null
  textlessPosterUrl?: string | null
  releaseDate?: string | null
  genres?: Genre[]
  externalRatings?: ExternalRating[]
  avgRating?: number | null
  ratingCount?: number
  tagline?: string | null
  overview?: string | null
  runtime?: number | null
  /** Album / music total length in milliseconds */
  albumDurationMs?: number | null
  status?: string | null
  isAnime?: boolean
  className?: string
}

function formatYear(dateStr?: string | null): string {
  if (!dateStr) return ''
  return dateStr.slice(0, 4)
}

function formatRuntime(minutes?: number | null): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatAlbumDuration(ms?: number | null): string {
  if (ms == null || ms <= 0) return ''
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const rem = m % 60
    return `${h}h ${rem}m`
  }
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`
}

function backdropSrc(url: string): string {
  if (url.includes('/w500/')) return url.replace(/\/w500\//, '/w1280/')
  return url
}

function providerLabel(key: string): string {
  const map: Record<string, string> = {
    imdb: 'IMDb',
    metacritic: 'Metacritic',
    rotten_tomatoes: 'RT',
    letterboxd: 'Letterboxd',
    rawg: 'RAWG',
    steam_user: 'Steam',
    steam_metacritic: 'Steam MC',
    tmdb: 'TMDb',
    igdb_critic: 'IGDB Critic',
    igdb_user: 'IGDB User',
    spotify: 'Spotify',
    lastfm: 'Last.fm',
    musicbrainz: 'MusicBrainz',
  }
  return map[key] ?? key
}

interface ProviderStyle {
  bg: string
  text: string
  star: string
  score: string
}

function providerStyle(key: string): ProviderStyle {
  const s: Record<string, ProviderStyle> = {
    imdb:         { bg: 'bg-[#f5c518]', text: 'text-black', star: 'text-black', score: 'text-black' },
    metacritic:   { bg: 'bg-[#1c1c1c]', text: 'text-white', star: 'text-[#66cc33]', score: 'text-[#66cc33]' },
    steam_metacritic: { bg: 'bg-[#1c1c1c]', text: 'text-white', star: 'text-[#66cc33]', score: 'text-[#66cc33]' },
    rotten_tomatoes:  { bg: 'bg-[#fa320a]', text: 'text-white', star: 'text-white', score: 'text-white' },
    letterboxd:   { bg: 'bg-[#00e054]', text: 'text-black', star: 'text-black', score: 'text-black' },
    steam_user:   { bg: 'bg-[#1a9fff]', text: 'text-white', star: 'text-white', score: 'text-white' },
    tmdb:         { bg: 'bg-[#01b4e4]', text: 'text-white', star: 'text-white', score: 'text-white' },
    igdb_critic:  { bg: 'bg-[#c8943e]', text: 'text-white', star: 'text-white', score: 'text-white' },
    igdb_user:    { bg: 'bg-[#5450d5]', text: 'text-white', star: 'text-white', score: 'text-white' },
    spotify:      { bg: 'bg-[#1DB954]', text: 'text-black', star: 'text-black', score: 'text-black' },
    lastfm:       { bg: 'bg-[#d51007]', text: 'text-white', star: 'text-white', score: 'text-white' },
    musicbrainz:  { bg: 'bg-[#ba478f]', text: 'text-white', star: 'text-white', score: 'text-white' },
  }
  return s[key] ?? { bg: 'bg-muted', text: 'text-muted-foreground', star: 'text-amber-400', score: 'text-foreground' }
}

function mediaTypeLabel(type: string): string {
  if (type === 'movie') return 'Movie'
  if (type === 'show') return 'TV'
  if (type === 'music') return 'Music'
  return 'Game'
}

export function MediaHero({
  mediaType,
  title,
  backdropUrl,
  posterUrl,
  logoUrl,
  textlessPosterUrl,
  releaseDate,
  genres,
  externalRatings,
  tagline,
  overview,
  runtime,
  albumDurationMs,
  status,
  isAnime,
  className,
}: MediaHeroProps) {
  const year = formatYear(releaseDate)
  const formattedRuntime = formatRuntime(runtime)
  const formattedAlbumLength = formatAlbumDuration(albumDurationMs)
  const logo: string | undefined = logoUrl || textlessPosterUrl || undefined
  const hasLogo = Boolean(logo)
  const heroBackdrop =
    backdropUrl || (mediaType === 'music' && posterUrl ? posterUrl : null)

  return (
    <div className={cn('relative flex min-h-[65vh] items-end overflow-hidden lg:min-h-[75vh] rounded-3xl shadow-[var(--dk-shadow-glass)]', className)}>
      {/* Backdrop with cinematic gradient */}
      {heroBackdrop && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <img
            src={backdropSrc(heroBackdrop)}
            alt=""
            className="h-full w-full object-cover object-[center_20%]"
          />
          {/* Gradient overlays — fade to background */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 via-30% to-background/20" />
          {/* Subtle accent glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,var(--primary)_0%,transparent_40%)] opacity-10" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,var(--accent)_0%,transparent_40%)] opacity-10" />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-12 pt-24 sm:px-6 lg:px-8">
        <div className="flex flex-row items-end justify-between gap-6 sm:gap-8 lg:gap-12">
          {/* Poster */}
          <div className="w-28 shrink-0 sm:w-44 lg:w-56 xl:w-64">
            <div className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
              <Image
                src={posterUrl || undefined}
                alt={`${title} poster`}
                className={cn('w-full', mediaType === 'music' ? 'aspect-square' : 'aspect-[2/3]')}
                fallback={title[0]}
              />
            </div>
          </div>

          {/* Info */}
          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:items-start lg:text-left">
            {/* Logo or title */}
            {hasLogo ? (
              <img
                src={logo}
                alt={title}
                className="mb-2 max-h-20 sm:max-h-24 lg:max-h-28 max-w-[70%] sm:max-w-[55%] lg:max-w-[45%] object-contain"
                style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}
              />
            ) : (
              <h1
                className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl"
                style={{ textShadow: '0 2px 20px rgba(0,0,0,0.4)' }}
              >
                {title}
              </h1>
            )}

            {/* Tagline */}
            {tagline && (
              <p className="max-w-[60ch] text-base italic text-muted-foreground sm:text-lg">
                {tagline}
              </p>
            )}

            {/* Meta tags row */}
            <div className="flex flex-wrap gap-2">
              {isAnime ? (
                <Badge
                  variant="secondary"
                  className="gap-1.5 border-0 bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_0_12px_rgba(236,72,153,0.3)] backdrop-blur"
                >
                  Anime
                </Badge>
              ) : (
                <Badge
                  variant={mediaType}
                  className="gap-1.5 border-0 bg-white/10 px-3 py-1.5 text-sm font-semibold backdrop-blur"
                >
                  {mediaTypeLabel(mediaType)}
                </Badge>
              )}
              {year && (
                <Badge variant="secondary" className="gap-1.5 border-0 bg-white/10 px-3 py-1.5 text-sm font-semibold backdrop-blur">
                  <Calendar className="h-3.5 w-3.5" />
                  {year}
                </Badge>
              )}
              {formattedRuntime && (
                <Badge variant="secondary" className="gap-1.5 border-0 bg-white/10 px-3 py-1.5 text-sm font-semibold backdrop-blur">
                  <Clock className="h-3.5 w-3.5" />
                  {formattedRuntime}
                </Badge>
              )}
              {formattedAlbumLength && (
                <Badge variant="secondary" className="gap-1.5 border-0 bg-white/10 px-3 py-1.5 text-sm font-semibold backdrop-blur">
                  <Clock className="h-3.5 w-3.5" />
                  {formattedAlbumLength}
                </Badge>
              )}
              {status && (
                <Badge variant="secondary" className="border-0 bg-white/10 px-3 py-1.5 text-sm font-semibold capitalize backdrop-blur">
                  {status.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>

            {/* External ratings */}
            {externalRatings && externalRatings.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {externalRatings.map((r) => {
                  const style = providerStyle(r.provider)
                  return (
                    <span
                      key={r.id}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold',
                        style.bg,
                        style.text,
                      )}
                    >
                      {providerLabel(r.provider)}
                      <span className="tabular-nums">{Math.round(r.score)}</span>
                    </span>
                  )
                })}
              </div>
            )}

            {/* Overview */}
            {overview && (
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {overview.length > 400 ? overview.slice(0, 400) + '…' : overview}
              </p>
            )}

            {/* Genres */}
            {genres && genres.length > 0 && (
              <div className="flex gap-1.5">
                {genres.map((g) => (
                  <Badge key={g.id} variant="secondary" className="border-white/10 bg-white/5">
                    {g.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
