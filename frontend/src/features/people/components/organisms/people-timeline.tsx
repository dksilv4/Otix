import { Link } from '@tanstack/react-router'
import { Image } from '@ui/atoms/image'
import type { MediaType } from '@/constants/media'
import { MEDIA_TYPE_LABEL, MEDIA_TYPE_COLOR_TINTED } from '@/constants/media'
import type { PersonCredit } from '@people/types'
import { formatCountdown, formatDateRange, formatRole, groupCredits } from '@people/utils'
import { cn } from '@/lib/utils'

interface PeopleTimelineProps {
  credits: PersonCredit[]
  mediaTypeFilter: string
  roleFilter: string
}

export const PeopleTimeline = ({ credits, mediaTypeFilter, roleFilter }: PeopleTimelineProps) => {
  let filtered = credits.filter((c) => c.mediaItem != null)

  if (mediaTypeFilter !== 'all') {
    filtered = filtered.filter((c) => c.mediaItem!.mediaType === mediaTypeFilter)
  }
  if (roleFilter !== 'all') {
    filtered = filtered.filter((c) => c.role === roleFilter)
  }

  const groups = groupCredits(filtered)

  if (groups.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        No credits match the selected filters.
      </div>
    )
  }

  return (
    <div id="people-timeline" className="relative">
      <div className="absolute left-[23px] top-4 bottom-4 w-px bg-border" aria-hidden="true" />

      <div className="space-y-10">
        {(Array.isArray(groups) ? groups.filter(Boolean) : []).map((group) => (
          <div key={group.year}>
            {/* Year marker — sticky */}
            <div className="sticky top-0 z-20 -mt-4 pt-4 pb-2 mb-3 bg-background/80 backdrop-blur-sm">
              <div className="relative flex items-center gap-5">
                <div className="relative z-10 flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-card ring-2 ring-border">
                  <div className="h-3 w-3 rounded-full bg-primary" />
                </div>
                <h3
                  className={cn(
                    'text-lg font-bold tracking-tight',
                    group.year === 'Upcoming' && 'text-emerald-400',
                    group.year === 'Announced' && 'text-amber-400',
                  )}
                >
                  {group.year}
                </h3>
              </div>
            </div>

            {/* Media nodes */}
            <div className="space-y-3 pl-[69px]">
              {(Array.isArray(group.credits) ? group.credits.filter(Boolean) : []).map((credit) => {
                const isSeason = credit.seasonNumber != null
                const displayTitle = isSeason
                  ? `${credit.title} — S${credit.seasonNumber}${credit.seasonName ? `: ${credit.seasonName}` : ''}`
                  : credit.title
                const upcoming = credit.releaseDate ? new Date(credit.releaseDate) > new Date() : false
                const dateLabel = upcoming
                  ? formatCountdown(credit.releaseDate!)
                  : formatDateRange(credit.releaseDate, credit.lastAirDate, isSeason)

                return (
                  <div key={`${credit.mediaId}-S${credit.seasonNumber ?? '-'}-${credit.releaseDate ?? '?'}`}>
                    {/* Media node with connector from main timeline */}
                    <div className="relative">
                      <svg
                        className="absolute top-0 pointer-events-none"
                        style={{ width: '46px', left: '-46px', height: '28px', overflow: 'visible' }}
                        aria-hidden="true"
                      >
                        <path
                          d="M 0,0 C 18,0 28,28 46,28"
                          stroke="currentColor"
                          className="text-border"
                          fill="none"
                          strokeWidth="1"
                        />
                      </svg>

                      <Link
                        to="/media/$mediaType/$mediaId"
                        params={{ mediaType: credit.mediaType, mediaId: credit.mediaId }}
                        className="inline-flex items-start gap-3 rounded-xl bg-card/40 p-3 max-w-lg hover:border-border hover:bg-card/80 transition-colors"
                      >
                        <div className="h-[68px] w-[45px] shrink-0 overflow-hidden rounded-md ring-1 ring-border/50">
                          <Image
                            src={credit.posterUrl ?? undefined}
                            alt={credit.title}
                            className="h-full w-full"
                            fallback={
                              <div className="flex h-full w-full items-center justify-center bg-muted text-[11px] text-muted-foreground">
                                {credit.title[0]}
                              </div>
                            }
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                              {displayTitle}
                            </span>
                            {(() => {
                              const mt = credit.mediaType as MediaType
                              return (
                                <span
                                  className={cn(
                                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset',
                                    MEDIA_TYPE_COLOR_TINTED[mt] ?? 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20',
                                  )}
                                >
                                  {MEDIA_TYPE_LABEL[mt] ?? credit.mediaType}
                                </span>
                              )
                            })()}
                          </div>

                          {dateLabel && (
                            <span
                              className={cn(
                                'mt-0.5 inline-block rounded px-1.5 py-px text-[10px] font-medium',
                                upcoming && 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20',
                                !upcoming && dateLabel === 'Announced' && 'bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20',
                                !upcoming && dateLabel !== 'Announced' && 'text-muted-foreground/60',
                              )}
                            >
                              {dateLabel}
                            </span>
                          )}

                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {(Array.isArray(credit.roles) ? credit.roles.filter(Boolean) : []).map((r, i) => (
                              <span key={i} className="inline-flex items-center gap-1">
                                {i > 0 && <span className="text-muted-foreground/40">·</span>}
                                <span className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-white/5 text-white/60">
                                  {formatRole(r.role)}
                                </span>
                                {r.characterName && (
                                  <span className="text-[11px] text-muted-foreground">
                                    as {r.characterName}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      </Link>
                    </div>

                    {/* Episode sub-nodes */}
                    {credit.episodes.length > 0 && (
                      <div className="relative ml-10">
                        <div className="absolute left-[10px] -top-1 bottom-0 w-px bg-border/40" aria-hidden="true" />

                        <div className="space-y-0">
                          {(Array.isArray(credit.episodes) ? credit.episodes.filter(Boolean) : []).map((ep) => (
                            <div key={ep.episodeNumber} className="relative flex items-center gap-1.5 pl-6 py-0.5">
                              <svg
                                className="absolute left-[10px] top-1/2 pointer-events-none -translate-y-1/2"
                                style={{ width: '14px', height: '8px', overflow: 'visible' }}
                                aria-hidden="true"
                              >
                                <path
                                  d="M 0,4 Q 7,4 14,4"
                                  stroke="currentColor"
                                  className="text-border/40"
                                  fill="none"
                                  strokeWidth="1"
                                />
                              </svg>
                              <span className="w-8 shrink-0 text-right text-[10px] font-medium text-muted-foreground/60 tabular-nums">
                                {ep.episodeNumber}
                              </span>
                              <span className="truncate text-[11px] text-muted-foreground/80">
                                {ep.name || `Episode ${ep.episodeNumber}`}
                              </span>
                              {ep.airDate && (
                                <span className="shrink-0 text-[10px] text-muted-foreground/40">
                                  {new Date(ep.airDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
};

