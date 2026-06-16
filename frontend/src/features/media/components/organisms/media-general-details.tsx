import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@ui/atoms/badge'
import { ExternalLink } from 'lucide-react'
import {
  mediaQueries,
  mediaTypeFromParam
} from '@media'

export function MediaGeneralDetails() {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = mediaTypeFromParam(params.mediaType || 'movie')
  const mediaId = params.mediaId || ''

  const { data } = useQuery(mediaQueries.detail(mediaType, mediaId))

  if (!data) return null

  const detail = data
  const {
    genres,
    youtubeVideoId,
    overview,
  } = detail

  const youtubeUrl = youtubeVideoId ? `https://www.youtube.com/watch?v=${youtubeVideoId}` : null

  return (
    <section className="space-y-5">
      {/* Overview / Description */}
      <div className="space-y-2 max-w-4xl pt-2">
        <h2 className="text-lg font-semibold">Overview</h2>
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
                className="bg-white/5 hover:bg-white/10 text-white text-xs font-semibold px-3 py-1.5 border-0 backdrop-blur transition-colors"
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
            className="glass-inset inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white/90 transition-all"
          >
            <ExternalLink size={14} />
            Watch Trailer on YouTube
          </a>
        </div>
      )}
    </section>
  )
}
