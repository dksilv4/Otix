import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Play } from 'lucide-react'
import {
  mediaQueries,
  useMediaParams
} from '@media'

export function MediaGeneralDetails() {
  const { mediaType, mediaId } = useMediaParams()

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
      {overview ? (
        <p className="text-sm sm:text-base leading-relaxed text-muted-foreground max-w-4xl">
          {overview}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground/60">
          No overview available.
        </p>
      )}

      {/* Genre pills */}
      {genres && genres.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {genres.map((g) => (
            <Link
              key={g.id}
              to="/browse/$type"
              params={{ type: mediaType }}
              search={{ genre: g.slug }}
              className="glass-inset inline-flex items-center px-3 py-1.5 text-xs font-medium text-white/80 hover:text-white transition-colors rounded-full"
            >
              {g.name}
            </Link>
          ))}
        </div>
      )}

      {/* Trailer link */}
      {youtubeUrl && (
        <div>
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-inset inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white/90 transition-all hover:text-white group"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-red-400 group-hover:bg-red-500/30 transition-colors">
              <Play className="h-3 w-3 fill-current" />
            </div>
            Watch Trailer
            <ExternalLink size={12} className="text-muted-foreground/60" />
          </a>
        </div>
      )}
    </section>
  )
}
