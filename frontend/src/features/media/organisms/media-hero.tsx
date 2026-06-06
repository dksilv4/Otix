// TODO: Review this file
import { Link } from '@tanstack/react-router'
import { Badge } from '@ui/atoms/badge'
import { Image } from '@ui/atoms/image'
import { cn } from '@/lib/utils'
import { MEDIA_TYPE_LABEL } from '@/constants/media'
import { Calendar, Clock, ExternalLink, Languages } from 'lucide-react'
import './media-hero.scss'

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
    <div className={cn('dk-media-hero', className)}>
      {/* Backdrop with cinematic gradient */}
      {heroBackdrop && (<>
        <div className="dk-media-hero__backdrop">
          <img
            src={backdropSrc(heroBackdrop)}
            alt=""
            className="dk-media-hero__backdrop-image"
          />
          <div className="dk-media-hero__backdrop-gradient" />
          <div className="dk-media-hero__backdrop-radial--primary" />
          <div className="dk-media-hero__backdrop-radial--accent" />
        </div>
        {/* Image darken for text readability */}
        <div className="dk-media-hero__darken" />
      </>)}

      {/* Content */}
      <div className="dk-media-hero__content">
        <div className="dk-media-hero__inner">
          {/* Poster */}
          <div className="dk-media-hero__poster">
            <div className="dk-media-hero__poster-inner">
              <Image
                src={posterUrl || undefined}
                alt={`${title} poster`}
                className={cn('dk-media-hero__poster-image', mediaType === 'music' ? 'dk-media-hero__poster-image--square' : 'dk-media-hero__poster-image--portrait')}
                fallback={title[0]}
              />
            </div>
          </div>

          {/* Info */}
          <div className="dk-media-hero__info">
            {/* Logo or title */}
            {hasLogo ? (
              <img
                src={logo}
                alt={title}
                className="dk-media-hero__logo"
                style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}
              />
            ) : (
              <h1
                className="dk-media-hero__title"
                style={{ textShadow: '0 2px 20px rgba(0,0,0,0.4)' }}
              >
                {title}
              </h1>
            )}

            {/* Tagline */}
            {tagline && (
              <p
                className="dk-media-hero__tagline"
                style={{ textShadow: '0 1px 12px rgba(0,0,0,0.5)' }}
              >
                {tagline}
              </p>
            )}

            {/* Meta tags row */}
            <div className="dk-media-hero__meta-tags">
              {certification && (
                <Link
                  to="/browse/$type"
                  params={{ type: mediaType }}
                  search={{ certification }}
                >
                  <Badge
                    variant="secondary"
                    className="dk-media-hero__badge dk-media-hero__badge--interactive"
                  >
                    {certification}
                  </Badge>
                </Link>
              )}
              {isAdult && (
                <Badge
                  variant="destructive"
                  className="dk-media-hero__badge dk-media-hero__badge--adult"
                >
                  18+
                </Badge>
              )}
              {isAnime ? (
                <Badge
                  variant="secondary"
                  className="dk-media-hero__badge dk-media-hero__badge--anime"
                >
                  Anime
                </Badge>
              ) : (
                <Badge
                  variant={mediaType}
                  className="dk-media-hero__badge"
                >
                  {MEDIA_TYPE_LABEL[mediaType]}
                </Badge>
              )}
              {year && (
                <Badge variant="secondary" className="dk-media-hero__badge">
                  <Calendar className="h-3.5 w-3.5" />
                  {year}
                </Badge>
              )}
              {formattedRuntime && (
                <Badge variant="secondary" className="dk-media-hero__badge">
                  <Clock className="h-3.5 w-3.5" />
                  {formattedRuntime}
                </Badge>
              )}
              {formattedAlbumLength && (
                <Badge variant="secondary" className="dk-media-hero__badge">
                  <Clock className="h-3.5 w-3.5" />
                  {formattedAlbumLength}
                </Badge>
              )}
              {status && (
                <Badge variant="secondary" className="dk-media-hero__badge dk-media-hero__badge--status">
                  {status.replace(/_/g, ' ')}
                </Badge>
              )}
              {languageDisplay && (
                <Badge variant="secondary" className="dk-media-hero__badge">
                  <Languages className="h-3.5 w-3.5" />
                  {languageDisplay}
                </Badge>
              )}
            </div>

            {/* Overview */}
            {overview && (
              <p
                className="dk-media-hero__overview"
                style={{ textShadow: '0 2px 16px rgba(0,0,0,0.7)' }}
              >
                {overview.length > 400 ? overview.slice(0, 400) + '…' : overview}
              </p>
            )}

            {/* Genres + YouTube link */}
            <div className="dk-media-hero__actions">
              {genres && genres.length > 0 &&
                genres.map((g) => (
                  <Link
                    key={g.id}
                    to="/browse/$type"
                    params={{ type: mediaType }}
                    search={{ genre: g.slug }}
                  >
                    <Badge variant="secondary" className="dk-media-hero__badge--genre">
                      {g.name}
                    </Badge>
                  </Link>
                ))}
              {youtubeUrl && (
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dk-media-hero__youtube-link"
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
