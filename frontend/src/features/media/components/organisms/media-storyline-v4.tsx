import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { MediaItemDetail } from '@media'
import { groupByRole } from '@media'

interface MediaStorylineV4Props {
  detail: MediaItemDetail
  mediaType: string
  className?: string
}

export function MediaStorylineV4({ detail, mediaType, className = '' }: MediaStorylineV4Props) {
  const [expanded, setExpanded] = useState(false)
  const overview = detail.overview || ''
  const isLong = overview.length > 280

  const credits = Array.isArray(detail?.credits) ? detail.credits : []
  const { directors, writers } = groupByRole(credits)

  const topDirectors = directors.filter((d) => Boolean(d.person)).slice(0, 3)
  const topWriters = writers.filter((w) => Boolean(w.person)).slice(0, 3)

  const hasCreatives = topDirectors.length > 0 || topWriters.length > 0

  const genres = Array.isArray(detail?.genres) ? detail.genres : []

  return (
    <div className={`glass-card p-6 sm:p-7 space-y-4 ${className}`}>
      {/* Heading */}
      <div className="flex items-center gap-2.5">
        <div className="h-4 w-0.5 rounded-full bg-primary/60 shrink-0" />
        <h2 className="text-base font-semibold tracking-tight">Storyline</h2>
      </div>

      {/* Overview Text with Line Clamp & Read More */}
      {overview ? (
        <div className="space-y-2">
          <p
            className={`text-sm sm:text-base leading-relaxed text-muted-foreground transition-all duration-200 ${
              !expanded && isLong ? 'line-clamp-3' : ''
            }`}
          >
            {overview}
          </p>

          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline pt-0.5"
            >
              {expanded ? (
                <>
                  Show less <ChevronUp className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Read more <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground/60">
          No overview available for this release.
        </p>
      )}

      {/* ── Key Creatives (Directors & Writers Only, avoiding duplication with Cast & Crew) ── */}
      {hasCreatives && (
        <div className="grid gap-3 pt-4 border-t border-white/[0.06] text-xs sm:grid-cols-2">
          {/* Directors / Creators */}
          {topDirectors.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {topDirectors.length === 1 ? 'Director' : 'Directors'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {topDirectors.map((d, idx) => (
                  <span key={d.id} className="font-medium text-foreground">
                    <Link
                      to="/person/$personId"
                      params={{ personId: d.person!.id }}
                      className="hover:text-primary transition-colors hover:underline"
                    >
                      {d.person!.name}
                    </Link>
                    {idx < topDirectors.length - 1 && ', '}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Writers */}
          {topWriters.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {topWriters.length === 1 ? 'Writer' : 'Writers'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {topWriters.map((w, idx) => (
                  <span key={w.id} className="font-medium text-foreground">
                    <Link
                      to="/person/$personId"
                      params={{ personId: w.person!.id }}
                      className="hover:text-primary transition-colors hover:underline"
                    >
                      {w.person!.name}
                    </Link>
                    {idx < topWriters.length - 1 && ', '}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Genre Chips (with generous padding so pills never touch the border line) ── */}
      {genres.length > 0 && (
        <div className="flex flex-wrap gap-2.5 pt-5 mt-4 border-t border-white/[0.08]">
          {genres.map((g) => (
            <Link
              key={g.id}
              to="/browse/$type"
              params={{ type: mediaType }}
              search={{ genre: g.slug }}
              className="glass-inset px-3 py-1.5 text-xs font-medium text-foreground hover:text-primary hover:bg-white/[0.08] transition-all rounded-full"
            >
              {g.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
