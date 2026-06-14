import "./ratings-section.scss"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import logoSvg from "@/assets/otix-logo.svg?raw"
import igdbLogo from "@/assets/provider-logos/igdb.svg"
import imdbLogo from "@/assets/provider-logos/imdb.svg"
import SteamIcon from "@/assets/provider-logos/steam.svg?react"
import PlexIcon from "@/assets/provider-logos/plex.svg?react"

function isSteamProvider(key: string): boolean {
  return key === "steam_user" || key === "steam_metacritic"
}
import tmdbLogo from "@/assets/provider-logos/tmdb.svg"

interface ExternalRating {
  id: string
  provider: string
  score: number
  maxScore: number
  voteCount?: number
}

interface RatingsSectionProps {
  avgRating?: number | null
  ratingCount?: number
  externalRatings?: ExternalRating[]
  className?: string
}

function scoreColor(score: number): { scoreClass: string; glowClass: string } {
  if (score >= 8) return { scoreClass: "dk-review-ratings__score--positive", glowClass: "dk-review-ratings__glow--positive" }
  if (score >= 6) return { scoreClass: "dk-review-ratings__score--medium", glowClass: "dk-review-ratings__glow--medium" }
  if (score >= 4) return { scoreClass: "dk-review-ratings__score--low", glowClass: "dk-review-ratings__glow--low" }
  return { scoreClass: "dk-review-ratings__score--critical", glowClass: "dk-review-ratings__glow--critical" }
}

function StarRow({ count, filled }: { count: number; filled: number }) {
  return (
    <div className="dk-review-ratings__stars">
      {Array.from({ length: count }).map((_, i) => {
        const fill = Math.min(1, Math.max(0, filled - i))
        return (
          <span key={i} className="dk-review-ratings__star">
            <Star className="w-5 h-5 text-white/[0.06]" fill="currentColor" />
            {fill > 0 && (
              <Star
                className="w-5 h-5 absolute inset-0 text-amber-400"
                fill="currentColor"
                style={{
                  clipPath: fill === 1 ? undefined : `inset(0 ${(1 - fill) * 100}% 0 0)`,
                }}
              />
            )}
          </span>
        )
      })}
    </div>
  )
}

interface ProviderTheme {
  badge: string
  scoreClass: string
  logoInvert?: boolean
}

function providerTheme(provider: string): ProviderTheme {
  const themes: Record<string, ProviderTheme> = {
    imdb:             { badge: 'dk-review-ratings__badge--imdb', scoreClass: 'dk-review-ratings__badge-score--imdb' },
    metacritic:       { badge: 'dk-review-ratings__badge--metacritic', scoreClass: 'dk-review-ratings__badge-score--metacritic' },
    steam_metacritic: { badge: 'dk-review-ratings__badge--steam-metacritic', scoreClass: 'dk-review-ratings__badge-score--steam-metacritic' },
    rotten_tomatoes:  { badge: 'dk-review-ratings__badge--rotten-tomatoes', scoreClass: 'dk-review-ratings__badge-score--rotten-tomatoes' },
    letterboxd:       { badge: 'dk-review-ratings__badge--letterboxd', scoreClass: 'dk-review-ratings__badge-score--letterboxd' },
    plex:             { badge: 'dk-review-ratings__badge--plex', scoreClass: 'dk-review-ratings__badge-score--plex' },
    steam_user:       { badge: 'dk-review-ratings__badge--steam-user', scoreClass: 'dk-review-ratings__badge-score--steam-user', logoInvert: true },
    tmdb:             { badge: 'dk-review-ratings__badge--tmdb', scoreClass: 'dk-review-ratings__badge-score--tmdb', logoInvert: true },
    igdb_critic:      { badge: 'dk-review-ratings__badge--igdb-critic', scoreClass: 'dk-review-ratings__badge-score--igdb-critic', logoInvert: true },
    igdb_user:        { badge: 'dk-review-ratings__badge--igdb-user', scoreClass: 'dk-review-ratings__badge-score--igdb-user', logoInvert: true },
    spotify:          { badge: 'dk-review-ratings__badge--spotify', scoreClass: 'dk-review-ratings__badge-score--spotify' },
    lastfm:           { badge: 'dk-review-ratings__badge--lastfm', scoreClass: 'dk-review-ratings__badge-score--lastfm' },
    musicbrainz:      { badge: 'dk-review-ratings__badge--musicbrainz', scoreClass: 'dk-review-ratings__badge-score--musicbrainz' },
  }
  return themes[provider] ?? { badge: 'dk-review-ratings__badge--default', scoreClass: 'dk-review-ratings__badge-score--default' }
}

function providerLogo(key: string): string | null {
  const logos: Record<string, string> = {
    imdb: imdbLogo,
    tmdb: tmdbLogo,
    igdb_critic: igdbLogo,
    igdb_user: igdbLogo,
  }
  return logos[key] ?? null
}

function providerLabel(key: string): string {
  const map: Record<string, string> = {
    imdb: "IMDb",
    metacritic: "Metacritic",
    rotten_tomatoes: "RT",
    letterboxd: "Letterboxd",
    plex: "Plex",
    rawg: "RAWG",
    steam_user: "Steam",
    steam_metacritic: "Steam MC",
    tmdb: "TMDb",
    igdb_critic: "IGDB Critic",
    igdb_user: "IGDB User",
    spotify: "Spotify",
    lastfm: "Last.fm",
    musicbrainz: "MusicBrainz",
  }
  return map[key] ?? key
}

function RatingsSection({ avgRating, ratingCount, externalRatings, className }: RatingsSectionProps) {
  const hasOtixRating = avgRating != null && ratingCount != null && ratingCount > 0
  const hasExternalRatings = externalRatings && externalRatings.length > 0
  const otixScore = avgRating ?? 0
  const otixCount = ratingCount ?? 0
  const colors = hasOtixRating
    ? scoreColor(otixScore)
    : { scoreClass: "dk-review-ratings__score--muted", glowClass: "dk-review-ratings__glow--muted" }

  return (
    <section className={cn(className)}>
      <div className="dk-review-ratings__inner">
        {/* ── Otix Community Rating — always shown ── */}
        <div className="dk-review-ratings__card">
          {/* Ambient glow */}
          <div
            className={cn(
              "dk-review-ratings__glow",
              colors.glowClass,
            )}
          />

          {/* Oversized Otix logo watermark */}
          <div
            className="dk-review-ratings__watermark"
            style={{ color: "var(--foreground)" }}
            dangerouslySetInnerHTML={{
              __html: logoSvg.replace(
                /<svg /,
                '<svg class="w-[140%] h-[140%] max-w-none" ',
              ),
            }}
          />

          <div className="dk-review-ratings__body">
            <div className="dk-review-ratings__row">
              {/* Big score */}
              <div className="dk-review-ratings__score-section">
                <span
                  className={cn(
                    "dk-review-ratings__score",
                    colors.scoreClass,
                  )}
                >
                  {hasOtixRating ? (otixScore * 10).toFixed(0) : "—"}
                </span>
                <span className="dk-review-ratings__score-label">
                  out of 100
                </span>
              </div>

              {/* Stars + meta */}
              <div className="dk-review-ratings__meta">
                <StarRow count={5} filled={hasOtixRating ? otixScore / 2 : 0} />

                <div className="dk-review-ratings__meta-text">
                  <span className="dk-review-ratings__label">Otix Community</span>
                  <span className="dk-review-ratings__count">
                    {hasOtixRating
                      ? `Based on ${otixCount.toLocaleString()} ${otixCount === 1 ? "rating" : "ratings"}`
                      : "No ratings yet"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── External Ratings — compact row ── */}
        {hasExternalRatings && (
          <div className="dk-review-ratings__externals">
            {externalRatings.map((r) => {
              const theme = providerTheme(r.provider)
              const logo = providerLogo(r.provider)
              const normalized = Math.round((r.score / r.maxScore) * 100)
              return (
                <div
                  key={r.id}
                  className={cn(
                    "dk-review-ratings__badge",
                    theme.badge,
                  )}
                  title={`${r.score}/${r.maxScore} → ${normalized}/100${r.voteCount ? ` · ${r.voteCount.toLocaleString()} votes` : ''}`}
                >
                  {isSteamProvider(r.provider) ? (
                    <SteamIcon className="h-4 w-4 opacity-90 shrink-0" />
                  ) : r.provider === "plex" ? (
                    <PlexIcon className="h-4 w-4 opacity-90 shrink-0" />
                  ) : logo ? (
                    <img
                      src={logo}
                      alt=""
                      className={cn(
                        "dk-review-ratings__badge-logo",
                        theme.logoInvert && "dk-review-ratings__badge-logo--invert",
                      )}
                    />
                  ) : (
                    <span className="dk-review-ratings__badge-label">
                      {providerLabel(r.provider)}
                    </span>
                  )}
                  <span className={cn("dk-review-ratings__badge-score", theme.scoreClass)}>
                    {normalized}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export { RatingsSection }
