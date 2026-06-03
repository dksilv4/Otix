import { Link } from '@tanstack/react-router'
import { Image } from '@ui/atoms/image'
import type { MediaType } from '@/constants/media'
import { MEDIA_TYPE_LABEL, MEDIA_TYPE_COLOR_TINTED } from '@/constants/media'
import type { PersonCredit } from '../person-queries'

interface EpisodeRef {
 episodeNumber: number
 name: string | null
 airDate: string | null
}

interface GroupedCredit {
 mediaId: string
 mediaType: string
 title: string
 slug: string
 posterUrl: string | null
 releaseDate: string | null
 lastAirDate: string | null
 roles: { role: string; characterName?: string }[]
 seasonNumber?: number
 seasonName?: string | null
 episodes: EpisodeRef[]
}

interface TimelineGroup {
 year: string
 credits: GroupedCredit[]
}

function expandCredits(credits: PersonCredit[]): GroupedCredit[] {
 const result: GroupedCredit[] = []

 for (const c of credits) {
   // Skip credits whose mediaItem was deleted (data integrity safety net)
   if (!c.mediaItem) continue
   const seasons = c.mediaItem.seasons
 if (c.mediaItem.mediaType === 'show' && seasons && seasons.length > 0) {
 for (const season of seasons) {
 const episodes = season.episodes ?? []
 // Group episodes by year
 const byYear = new Map<number, EpisodeRef[]>()
 for (const ep of episodes) {
 if (!ep.airDate) continue
 const y = new Date(ep.airDate).getFullYear()
 const existing = byYear.get(y)
 if (existing) {
 existing.push(ep)
 } else {
 byYear.set(y, [{ episodeNumber: ep.episodeNumber, name: ep.name, airDate: ep.airDate }])
 }
 }

 // No episodes with dates â†’ upcoming/announced season
 if (byYear.size === 0) {
 result.push({
 mediaId: c.mediaItem.id,
 mediaType: c.mediaItem.mediaType,
 title: c.mediaItem.title,
 slug: c.mediaItem.slug,
 posterUrl: c.mediaItem.posterUrl,
 releaseDate: season.firstAirDate ?? null,
 lastAirDate: null,
 roles: [{ role: c.role, characterName: c.characterName }],
 seasonNumber: season.seasonNumber,
 seasonName: season.name,
 episodes: [],
 })
 continue
 }

 // Create one entry per year
 const sortedYears = [...byYear.keys()].sort()
 for (const year of sortedYears) {
 const yearEps = byYear.get(year)!
 const airDates = yearEps.map((e) => e.airDate!).filter(Boolean).sort()
 result.push({
 mediaId: c.mediaItem.id,
 mediaType: c.mediaItem.mediaType,
 title: c.mediaItem.title,
 slug: c.mediaItem.slug,
 posterUrl: c.mediaItem.posterUrl,
 releaseDate: airDates[0],
 lastAirDate: airDates[airDates.length - 1],
 roles: [{ role: c.role, characterName: c.characterName }],
 seasonNumber: season.seasonNumber,
 seasonName: season.name,
 episodes: yearEps,
 })
 }
 }
 } else {
 result.push({
 mediaId: c.mediaItem.id,
 mediaType: c.mediaItem.mediaType,
 title: c.mediaItem.title,
 slug: c.mediaItem.slug,
 posterUrl: c.mediaItem.posterUrl,
 releaseDate: c.mediaItem.releaseDate,
 lastAirDate: null,
 roles: [{ role: c.role, characterName: c.characterName }],
 episodes: [],
 })
 }
 }

 return result
}

function groupCredits(credits: PersonCredit[]): TimelineGroup[] {
 const expanded = expandCredits(credits)

 // Merge duplicate (media + season + year) entries with multiple roles
 const byMediaSeasonYear = new Map<string, GroupedCredit>()
 for (const c of expanded) {
 const key = c.seasonNumber != null
 ? `${c.mediaId}-S${c.seasonNumber}-${c.releaseDate ? new Date(c.releaseDate).getFullYear() : '?'}`
 : c.mediaId
 const existing = byMediaSeasonYear.get(key)
 if (existing) {
 for (const r of c.roles) {
 if (!existing.roles.some((er) => er.role === r.role && er.characterName === r.characterName)) {
 existing.roles.push(r)
 }
 }
 } else {
 byMediaSeasonYear.set(key, { ...c })
 }
 }

 const byYear = new Map<string, GroupedCredit[]>()
 for (const credit of byMediaSeasonYear.values()) {
 let year: string
 if (!credit.releaseDate) {
 year = 'Announced'
 } else if (isUpcoming(credit.releaseDate)) {
 year = 'Upcoming'
 } else {
 year = new Date(credit.releaseDate).getFullYear().toString()
 }
 const existing = byYear.get(year)
 if (existing) {
 existing.push(credit)
 } else {
 byYear.set(year, [credit])
 }
 }

 const years = [...byYear.keys()].sort((a, b) => {
 if (a === 'Upcoming') return -1
 if (b === 'Upcoming') return 1
 if (a === 'Announced') return -1
 if (b === 'Announced') return 1
 return parseInt(b) - parseInt(a)
 })

 return years.map((year) => {
 const credits = byYear.get(year)!
 // Sort within year: newest first, then by title for ties
 credits.sort((a, b) => {
 const da = a.releaseDate ? new Date(a.releaseDate).getTime() : 0
 const db = b.releaseDate ? new Date(b.releaseDate).getTime() : 0
 if (db !== da) return db - da
 return a.title.localeCompare(b.title)
 })
 return { year, credits }
 })
}

function isUpcoming(dateStr: string): boolean {
 return new Date(dateStr) > new Date()
}

function formatCountdown(dateStr: string): string {
 const now = new Date()
 const target = new Date(dateStr)
 const diffMs = target.getTime() - now.getTime()
 const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

 if (diffDays <= 0) return 'Releases today'
 if (diffDays === 1) return 'Releases tomorrow'
 if (diffDays < 7) return `In ${diffDays} days`
 if (diffDays < 14) return 'Next week'
 const diffWeeks = Math.round(diffDays / 7)
 if (diffWeeks < 8) return `In ${diffWeeks} weeks`
 const diffMonths = Math.round(diffDays / 30)
 if (diffMonths < 6) return `In ${diffMonths} months`
 return target.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateRange(start: string | null, end: string | null, isSeason: boolean): string | null {
 if (!start) return isSeason ? 'Announced' : null
 if (!isSeason) {
 return new Date(start).getFullYear().toString()
 }
 const monthDay = (d: string) =>
 new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
 if (!end || start === end) return monthDay(start)
 return `${monthDay(start)} â€“ ${monthDay(end)}`
}

function formatRole(role: string): string {
 const labels: Record<string, string> = {
 cast: 'Actor',
 director: 'Director',
 producer: 'Producer',
 writer: 'Writer',
 composer: 'Composer',
 crew: 'Crew',
 voice: 'Voice',
 }
 return labels[role] || role
}

interface PersonTimelineProps {
 credits: PersonCredit[]
 mediaTypeFilter: string
 roleFilter: string
}

export function PersonTimeline({ credits, mediaTypeFilter, roleFilter }: PersonTimelineProps) {
 let filtered = credits

 // Safety: skip credits whose mediaItem or person was deleted
 filtered = filtered.filter((c) => c.mediaItem != null)

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
 <div className="relative">
 {/* Main vertical timeline line */}
 <div
 className="absolute left-[23px] top-4 bottom-4 w-px bg-border"
 aria-hidden="true"
 />

 <div className="space-y-10">
 {groups.map((group) => (
 <div key={group.year}>
 {/* Year marker — sticky */}
 <div className="sticky top-0 z-20 -mt-4 pt-4 pb-2 mb-3 bg-background/80 backdrop-blur-sm">
 <div className="relative flex items-center gap-5">
 <div className="relative z-10 flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-card ring-2 ring-border">
 <div className="h-3 w-3 rounded-full bg-primary" />
 </div>
 <h3 className={`text-lg font-bold tracking-tight ${
 group.year === 'Upcoming' ? 'text-emerald-400' :
 group.year === 'Announced' ? 'text-amber-400' : ''
 }`}>
 {group.year}
 </h3>
 </div>
 </div>

 {/* Media nodes */}
 <div className="space-y-3 pl-[69px]">
 {group.credits.map((credit) => {
 const isSeason = credit.seasonNumber != null
 const displayTitle = isSeason
 ? `${credit.title} — S${credit.seasonNumber}${credit.seasonName ? `: ${credit.seasonName}` : ''}`
 : credit.title
 const upcoming = credit.releaseDate ? isUpcoming(credit.releaseDate) : false
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
 className="inline-flex items-start gap-3 rounded-xl /60 bg-card/40 p-3 hover:border-border hover:bg-card/80 transition-colors group max-w-lg"
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
 <span className="text-sm font-medium group-hover:text-primary transition-colors truncate">
 {displayTitle}
 </span>
 {(() => {
 const mt = credit.mediaType as MediaType
 return (
 <span
 className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset ${MEDIA_TYPE_COLOR_TINTED[mt] ?? 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20'}`}
 >
 {MEDIA_TYPE_LABEL[mt] ?? credit.mediaType}
 </span>
 )
 })()}
 </div>

 {dateLabel && (
 <span
 className={`mt-0.5 inline-block rounded px-1.5 py-px text-[10px] font-medium ${
 upcoming
 ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20'
 : dateLabel === 'Announced'
 ? 'bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20'
 : 'text-muted-foreground/60'
 }`}
 >
 {dateLabel}
 </span>
 )}
 <div className="mt-1.5 flex flex-wrap items-center gap-1">
 {credit.roles.map((r, i) => (
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
 {credit.episodes.map((ep) => (
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
 <span className="text-[10px] font-medium text-muted-foreground/60 w-8 shrink-0 tabular-nums text-right">
 {ep.episodeNumber}
 </span>
 <span className="text-[11px] text-muted-foreground/80 truncate">
 {ep.name || `Episode ${ep.episodeNumber}`}
 </span>
 {ep.airDate && (
 <span className="text-[10px] text-muted-foreground/40 shrink-0">
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
}
