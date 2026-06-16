import React from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@ui/atoms/badge'
import { useAuth } from '@/old-features/auth'
import { ExternalLink, Film, Tv, Gamepad2, Music } from 'lucide-react'
import { MEDIA_TYPE_LABEL } from '@/constants/media'
import {
  formatAlbumDuration,
  formatRuntime,
  formatYear,
  languageName,
  mediaQueries,
  mediaTypeFromParam
} from '@media'

export function MediaGeneralDetails() {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = mediaTypeFromParam(params.mediaType || 'movie')
  const mediaId = params.mediaId || ''

  const { user } = useAuth()
  const { data } = useQuery(mediaQueries.detail(mediaType, mediaId))

  if (!data) return null

  const detail = data
  const {
    genres,
    originalLanguage,
    youtubeVideoId,
    overview,
    isAdult,
    releaseDate,
  } = detail

  const isAnime = detail.movie?.isAnime || detail.show?.isAnime || false
  const status = detail.show?.status || detail.game?.releaseStatus
  const runtime = detail.movie?.runtime
  const albumDurationMs = detail.album?.durationMs
  const duration = formatRuntime(runtime) || formatAlbumDuration(albumDurationMs)
  const year = formatYear(releaseDate)
  const languageDisplay = originalLanguage ? languageName(originalLanguage) : null
  const youtubeUrl = youtubeVideoId ? `https://www.youtube.com/watch?v=${youtubeVideoId}` : null

  const userCountry = (user?.country || 'us').toLowerCase()
  const certification =
    detail.releases?.find(
      (r) => r.countryCode === userCountry && r.certification,
    )?.certification ||
    (userCountry !== 'us'
      ? detail.releases?.find((r) => r.countryCode === 'us' && r.certification)?.certification
      : null) ||
    null

  return (
    <section className="mx-auto w-full lg:max-w-7xl px-6 lg:px-8 space-y-6">
      {/* Overview / Description */}
      <div className="space-y-2 max-w-4xl pt-2">
        <h2 className="text-lg font-bold tracking-tight text-white/90">Overview</h2>
        {overview ? (
          <p className="text-base leading-relaxed text-muted-foreground">
            {overview}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No overview available.
          </p>
        )}
      </div>

      {/* Genres line underneath overview, styled as borderless pills */}
      {genres && genres.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {genres.map((g) => (
            <Link
              key={g.id}
              to="/browse/$type"
              params={{ type: mediaType }}
              search={{ genre: g.slug }}
            >
              <Badge
                variant="secondary"
                className="bg-white/5 hover:bg-white/10 text-white text-xs font-semibold px-3 py-1.5 border-0 transition-colors"
              >
                {g.name}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {youtubeUrl && (
        <div className="pt-2">
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-red-600/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            <ExternalLink size={14} />
            Watch Trailer on YouTube
          </a>
        </div>
      )}
    </section>
  )
}
