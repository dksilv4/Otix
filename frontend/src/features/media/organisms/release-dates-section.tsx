// TODO: Review this file
import { Calendar, Clock, Download, Film, Globe, Monitor, Star, Tv } from 'lucide-react'
import { Badge } from '@ui/atoms/badge'
import { cn } from '@/lib/utils'
import './release-dates-section.scss'

// ── Types ─────────────────────────────────────────────────────────

interface MediaRelease {
  countryCode: string
  releaseDate: string | null
  certification: string | null
  releaseType: string | null
}

interface ReleaseDatesSectionProps {
  releases: MediaRelease[]
  userCountry: string  // already lowercased (e.g. 'us', 'gb', 'de')
}

// ── Release type config ───────────────────────────────────────────

const RELEASE_TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; important: boolean }
> = {
  digital: {
    label: 'Digital',
    icon: Download,
    color: 'text-cyan-400',
    important: true,
  },
  theatrical: {
    label: 'Theatrical',
    icon: Film,
    color: 'text-amber-400',
    important: false,
  },
  theatrical_limited: {
    label: 'Theatrical (Limited)',
    icon: Film,
    color: 'text-amber-300',
    important: false,
  },
  physical: {
    label: 'Physical',
    icon: Monitor,
    color: 'text-purple-400',
    important: false,
  },
  premiere: {
    label: 'Premiere',
    icon: Star,
    color: 'text-rose-400',
    important: false,
  },
  tv: {
    label: 'TV',
    icon: Tv,
    color: 'text-blue-400',
    important: false,
  },
}

const DISPLAY_ORDER = ['digital', 'theatrical', 'theatrical_limited', 'physical', 'premiere', 'tv']

// ── Helpers ───────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getDaysUntil(dateStr: string): number | null {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  const diff = target.getTime() - now.getTime()
  const days = Math.round(diff / (1000 * 60 * 60 * 24))
  return days >= 0 ? days : null
}

function getCountryDisplay(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

// ── Countdown badge ───────────────────────────────────────────────

function CountdownBadge({ days }: { days: number }) {
  if (days === 0) {
    return (
      <Badge variant="default" className="dk-media-countdown-badge--today">
        <Clock className="h-3 w-3" />
        Today!
      </Badge>
    )
  }
  if (days <= 7) {
    return (
      <Badge variant="default" className="dk-media-countdown-badge--soon">
        <Clock className="h-3 w-3" />
        {days}d left
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="dk-media-countdown-badge--later">
      <Clock className="h-3 w-3" />
      {days}d left
    </Badge>
  )
}

// ── Main component ────────────────────────────────────────────────

export function ReleaseDatesSection({ releases, userCountry }: ReleaseDatesSectionProps) {
  // Filter to only releases with a date and a known type
  const valid = releases.filter((r) => r.releaseDate && r.releaseType && RELEASE_TYPE_CONFIG[r.releaseType])
  if (valid.length === 0) return null

  // ── Country filtering ──────────────────────────────────────────
  // Strategy: show user's country releases. For release types missing
  // in the user's country, fall back to US data. If neither has any
  // data, show everything.
  const primaryCc = userCountry || 'us'
  const hasUserCountry = valid.some((r) => r.countryCode === primaryCc)
  const hasUs = valid.some((r) => r.countryCode === 'us')
  const showFiltered = hasUserCountry || hasUs

  if (!showFiltered) {
    // No region-specific data at all — show everything
    return <AllCountriesView releases={valid} />
  }

  // Build a deduplicated view: one entry per release type,
  // preferring user's country over US.
  const grouped: Record<string, MediaRelease> = {}
  const seen = new Set<string>()

  // First pass: user's country
  for (const r of valid) {
    if (r.countryCode === primaryCc && !seen.has(r.releaseType!)) {
      grouped[r.releaseType!] = r
      seen.add(r.releaseType!)
    }
  }
  // Second pass: US fallback for types missing in user's country
  if (primaryCc !== 'us') {
    for (const r of valid) {
      if (r.countryCode === 'us' && !seen.has(r.releaseType!)) {
        grouped[r.releaseType!] = r
        seen.add(r.releaseType!)
      }
    }
  }

  const entries = DISPLAY_ORDER
    .filter((t) => grouped[t])
    .map((t) => ({
      type: t,
      config: RELEASE_TYPE_CONFIG[t],
      release: grouped[t],
    }))

  const someUpcoming = entries.some((e) => getDaysUntil(e.release.releaseDate!) !== null)

  return (
    <section className="dk-media-release-dates">
      <div className="dk-media-release-dates__header">
        <h2 className="dk-media-release-dates__heading">Release Dates</h2>
        {hasUserCountry && (
          <Badge variant="secondary" className="dk-media-release-dates__country-badge">
            <Globe className="h-3 w-3" />
            {getCountryDisplay(primaryCc)}
          </Badge>
        )}
      </div>

      <div className="dk-media-release-dates__grid">
        {entries.map(({ type, config, release: r }) => {
          const Icon = config.icon
          const days = getDaysUntil(r.releaseDate!)
          const isFallback = r.countryCode !== primaryCc

          return (
            <div
              key={type}
              className={cn(
                'dk-media-release-dates__card',
                config.important
                  ? 'dk-media-release-dates__card--important'
                  : days !== null
                    ? 'dk-media-release-dates__card--upcoming'
                    : 'dk-media-release-dates__card--default',
              )}
            >
              {/* Header */}
              <div className="dk-media-release-dates__card-header">
                <Icon className={cn('h-4 w-4', config.color)} />
                <h3 className={cn('dk-media-release-dates__card-heading', config.color)}>{config.label}</h3>
                {config.important && (
                  <Badge
                    variant="default"
                    className="dk-media-release-dates__card-important-badge"
                  >
                    Important
                  </Badge>
                )}
              </div>

              {/* Entry */}
              <div className="dk-media-release-dates__entry">
                {/* Country indicator */}
                {isFallback ? (
                  <span className="dk-media-release-dates__country--fallback" title={getCountryDisplay(r.countryCode)}>
                    {r.countryCode.toUpperCase()}
                  </span>
                ) : (
                  <span className="dk-media-release-dates__country">
                    {r.countryCode.toUpperCase()}
                  </span>
                )}

                {/* Date */}
                <span className="dk-media-release-dates__entry-date">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  {formatDate(r.releaseDate!)}
                </span>

                {/* Certification */}
                {r.certification && (
                  <Badge
                    variant="secondary"
                    className="dk-media-release-dates__entry-cert"
                  >
                    {r.certification}
                  </Badge>
                )}

                {/* Countdown */}
                {days !== null && (
                  <div className="dk-media-release-dates__entry-countdown">
                    <CountdownBadge days={days} />
                  </div>
                )}
              </div>

              {/* Fallback note */}
              {isFallback && (
                <p className="dk-media-release-dates__fallback-note">
                  No {config.label.toLowerCase()} release date for {getCountryDisplay(primaryCc)} — showing {getCountryDisplay(r.countryCode)} date
                </p>
              )}
            </div>
          )
        })}
      </div>

      {someUpcoming && (
        <p className="dk-media-release-dates__footnote">
          Countdown shows days until release. Times are approximate.
        </p>
      )}
    </section>
  )
}

// ── Fallback: show all countries ──────────────────────────────────

function AllCountriesView({ valid }: { valid: MediaRelease[] }) {
  // Group by type
  const grouped: Record<string, MediaRelease[]> = {}
  for (const r of valid) {
    if (!grouped[r.releaseType!]) grouped[r.releaseType!] = []
    grouped[r.releaseType!].push(r)
  }
  for (const type of Object.keys(grouped)) {
    grouped[type].sort((a, b) => new Date(a.releaseDate!).getTime() - new Date(b.releaseDate!).getTime())
  }

  const entries = DISPLAY_ORDER.filter((t) => grouped[t]).map((t) => ({
    type: t,
    config: RELEASE_TYPE_CONFIG[t],
    releases: grouped[t],
  }))

  const someUpcoming = entries.some((e) => e.releases.some((r) => getDaysUntil(r.releaseDate!) !== null))

  return (
    <section className="dk-media-release-dates">
      <h2 className="dk-media-release-dates__heading">Release Dates</h2>

      <div className="dk-media-release-dates__grid">
        {entries.map(({ type, config, releases }) => {
          const Icon = config.icon

          return (
            <div
              key={type}
              className={cn(
                'dk-media-release-dates__card',
                config.important
                  ? 'dk-media-release-dates__card--important'
                  : 'dk-media-release-dates__card--default',
              )}
            >
              {/* Header */}
              <div className="dk-media-release-dates__card-header">
                <Icon className={cn('h-4 w-4', config.color)} />
                <h3 className={cn('dk-media-release-dates__card-heading', config.color)}>{config.label}</h3>
                {config.important && (
                  <Badge
                    variant="default"
                    className="dk-media-release-dates__card-important-badge"
                  >
                    Important
                  </Badge>
                )}
              </div>

              {/* All countries */}
              <div className="dk-media-release-dates__all-list">
                {releases.map((r, i) => {
                  const days = getDaysUntil(r.releaseDate!)

                  return (
                    <div
                      key={`${r.countryCode}-${i}`}
                      className="dk-media-release-dates__entry"
                    >
                      <span className="dk-media-release-dates__country">
                        {r.countryCode.toUpperCase()}
                      </span>

                      <span className="dk-media-release-dates__entry-date">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {formatDate(r.releaseDate!)}
                      </span>

                      {r.certification && (
                        <Badge
                          variant="secondary"
                          className="dk-media-release-dates__entry-cert"
                        >
                          {r.certification}
                        </Badge>
                      )}

                      {days !== null && (
                        <div className="dk-media-release-dates__entry-countdown">
                          <CountdownBadge days={days} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
