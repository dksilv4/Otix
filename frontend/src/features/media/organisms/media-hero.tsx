import { Link } from '@tanstack/react-router'
import { Badge } from '@ui/atoms/badge'
import { Image } from '@ui/atoms/image'
import { cn } from '@/lib/utils'
import { MEDIA_TYPE_LABEL } from '@/constants/media'
import { Calendar, Clock, ExternalLink, Languages } from 'lucide-react'

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
  avgRating?: number | null
  ratingCount?: number
  tagline?: string | null
  overview?: string | null
  runtime?: number | null
  albumDurationMs?: number | null
  status?: string | null
  originalLanguage?: string | null
  isAnime?: boolean
  isAdult?: boolean
  certification?: string | null
  className?: string
  youtubeVideoId?: string | null
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

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
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
  tagline,
  overview,
  runtime,
  albumDurationMs,
  status,
  originalLanguage,
  isAnime,
  isAdult,
  certification,
  className,
  youtubeVideoId,
}: MediaHeroProps) {
  const year = formatYear(releaseDate)
  const formattedRuntime = formatRuntime(runtime)
  const formattedAlbumLength = formatAlbumDuration(albumDurationMs)
  const logo: string | undefined = logoUrl || textlessPosterUrl || undefined
  const hasLogo = Boolean(logo)
  const heroBackdrop =
    backdropUrl || (mediaType === 'music' && posterUrl ? posterUrl : null)

  const youtubeUrl = youtubeVideoId
    ? `https://www.youtube.com/watch?v=${youtubeVideoId}`
    : null

  const languageDisplay = originalLanguage ? languageName(originalLanguage) : null

  return (
    <div className={cn('relative flex min-h-[65vh] items-end overflow-hidden lg:min-h-[75vh] rounded-3xl ', className)}>
      {/* Backdrop with cinematic gradient */}
      {heroBackdrop && (<>
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <img
            src={backdropSrc(heroBackdrop)}
            alt=""
            className="h-full w-full object-cover object-[center_20%] animate-ken-burns"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-background/40 via-30% to-background/10" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,var(--primary)_0%,transparent_40%)] opacity-10" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,var(--accent)_0%,transparent_40%)] opacity-10" />
        </div>
        {/* Image darken for text readability */}
        <div className="pointer-events-none absolute inset-0 z-[1] bg-background/25" />
      </>)}

      {/* Content */}
      <div className="relative z-10 mx-auto w-full lg:max-w-7xl px-4 pb-12 pt-24 sm:px-6 lg:px-8 animate-hero-fade-in">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8 lg:gap-12">
          {/* Poster */}
          <div className="w-40 shrink-0 sm:w-44 lg:w-56 xl:w-64">
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
          <div className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center sm:items-start sm:text-left">
            {/* Logo or title */}
            {hasLogo ? (
              <img
                src={logo}
                alt={title}
                className="mb-2 max-h-24 sm:max-h-24 lg:max-h-28 max-w-[85%] sm:max-w-[55%] lg:max-w-[45%] object-contain"
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
              <p
                className="max-w-[60ch] text-base italic text-muted-foreground sm:text-lg"
                style={{ textShadow: '0 1px 12px rgba(0,0,0,0.5)' }}
              >
                {tagline}
              </p>
            )}

            {/* Meta tags row */}
            <div className="flex flex-wrap gap-2">
              {certification && (
                <Link
                  to="/browse/$type"
                  params={{ type: mediaType }}
                  search={{ certification }}
                >
                  <Badge
                    variant="secondary"
                    className="gap-1.5 border-0 bg-white/10 px-3 py-1.5 text-sm font-semibold backdrop-blur hover:bg-white/20 transition-colors"
                  >
                    {certification}
                  </Badge>
                </Link>
              )}
              {isAdult && (
                <Badge
                  variant="destructive"
                  className="gap-1.5 border-0 bg-red-600 px-3 py-1.5 text-sm font-bold backdrop-blur"
                >
                  18+
                </Badge>
              )}
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
                  {MEDIA_TYPE_LABEL[mediaType]}
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
              {languageDisplay && (
                <Badge variant="secondary" className="gap-1.5 border-0 bg-white/10 px-3 py-1.5 text-sm font-semibold backdrop-blur">
                  <Languages className="h-3.5 w-3.5" />
                  {languageDisplay}
                </Badge>
              )}
            </div>

            {/* Overview */}
            {overview && (
              <p
                className="max-w-2xl text-sm leading-relaxed text-foreground/85 sm:text-left"
                style={{ textShadow: '0 2px 16px rgba(0,0,0,0.7)' }}
              >
                {overview.length > 400 ? overview.slice(0, 400) + '…' : overview}
              </p>
            )}

            {/* Genres + YouTube link */}
            <div className="flex flex-wrap items-center gap-1.5">
              {genres && genres.length > 0 &&
                genres.map((g) => (
                  <Link
                    key={g.id}
                    to="/browse/$type"
                    params={{ type: mediaType }}
                    search={{ genre: g.slug }}
                  >
                    <Badge variant="secondary" className="border-white/10 bg-white/5 hover:bg-white/10 transition-colors">
                      {g.name}
                    </Badge>
                  </Link>
                ))}
              {youtubeUrl && (
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 transition-colors"
                >
                  Watch on YouTube
                  <ExternalLink size={12} />
                </a>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
