import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import logoSvg from "@/assets/otix-logo.svg?raw"
import igdbLogo from "@/assets/provider-logos/igdb.svg"
import imdbLogo from "@/assets/provider-logos/imdb.svg"
import { SteamIcon } from "@/features/dk-ui/atoms/steam-icon"
import { PlexIcon } from "@/features/dk-ui/atoms/plex-icon"

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

function scoreColor(score: number): { text: string; glow: string } {
  if (score >= 8) return { text: "text-emerald-400", glow: "from-emerald-500/15" }
  if (score >= 6) return { text: "text-sky-400", glow: "from-sky-500/15" }
  if (score >= 4) return { text: "text-amber-400", glow: "from-amber-500/15" }
  return { text: "text-red-400", glow: "from-red-500/15" }
}

function StarRow({ count, filled }: { count: number; filled: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: count }).map((_, i) => {
        const fill = Math.min(1, Math.max(0, filled - i))
        return (
          <span key={i} className="relative inline-block">
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
  bg: string
  text: string
  star: string
  score: string
  logoInvert?: boolean
}

function providerTheme(provider: string): ProviderTheme {
  const themes: Record<string, ProviderTheme> = {
    imdb:             { bg: 'bg-[#f5c518]', text: 'text-black', star: 'text-black', score: 'text-black' },
    metacritic:       { bg: 'bg-[#1c1c1c]', text: 'text-white', star: 'text-[#66cc33]', score: 'text-[#66cc33]' },
    steam_metacritic: { bg: 'bg-[#1c1c1c]', text: 'text-white', star: 'text-[#66cc33]', score: 'text-[#66cc33]' },
    rotten_tomatoes:  { bg: 'bg-[#fa320a]', text: 'text-white', star: 'text-white', score: 'text-white' },
    letterboxd:       { bg: 'bg-[#00e054]', text: 'text-black', star: 'text-black', score: 'text-black' },
    plex:             { bg: 'bg-[#e5a00d]', text: 'text-black', star: 'text-black', score: 'text-black' },
    steam_user:       { bg: 'bg-[#1a9fff]', text: 'text-white', star: 'text-white', score: 'text-white', logoInvert: true },
    tmdb:             { bg: 'bg-[#01b4e4]', text: 'text-white', star: 'text-white', score: 'text-white', logoInvert: true },
    igdb_critic:      { bg: 'bg-[#c8943e]', text: 'text-white', star: 'text-white', score: 'text-white', logoInvert: true },
    igdb_user:        { bg: 'bg-[#5450d5]', text: 'text-white', star: 'text-white', score: 'text-white', logoInvert: true },
    spotify:          { bg: 'bg-[#1DB954]', text: 'text-black', star: 'text-black', score: 'text-black' },
    lastfm:           { bg: 'bg-[#d51007]', text: 'text-white', star: 'text-white', score: 'text-white' },
    musicbrainz:      { bg: 'bg-[#ba478f]', text: 'text-white', star: 'text-white', score: 'text-white' },
  }
  return themes[provider] ?? { bg: 'bg-muted', text: 'text-muted-foreground', star: 'text-amber-400', score: 'text-foreground' }
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
  const colors = hasOtixRating ? scoreColor(otixScore) : { text: "text-muted-foreground/30", glow: "from-primary/10" }

  return (
    <section className={cn(className)}>
      <div className="space-y-4">
        {/* ── Otix Community Rating — always shown ── */}
        <div className="relative overflow-hidden rounded-3xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)]">
          {/* Ambient glow */}
          <div
            className={cn(
              "absolute inset-0 opacity-40 pointer-events-none bg-[radial-gradient(circle_at_30%_50%,var(--tw-gradient-from),transparent_70%)]",
              colors.glow,
            )}
          />

          {/* Oversized Otix logo watermark */}
          <div
            className="absolute -inset-[30%] pointer-events-none select-none flex items-center justify-center opacity-[0.05]"
            style={{ color: "var(--foreground)" }}
            dangerouslySetInnerHTML={{
              __html: logoSvg.replace(
                /<svg /,
                '<svg class="w-[140%] h-[140%] max-w-none" ',
              ),
            }}
          />

          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
              {/* Big score */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <span
                  className={cn(
                    "text-5xl sm:text-6xl font-extrabold tabular-nums tracking-tight",
                    colors.text,
                  )}
                  style={{ fontFamily: "var(--dk-font-mono)" }}
                >
                  {hasOtixRating ? otixScore.toFixed(1) : "—"}
                </span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                  out of 10
                </span>
              </div>

              {/* Stars + meta */}
              <div className="flex flex-col items-center sm:items-start gap-3 min-w-0">
                <StarRow count={5} filled={hasOtixRating ? otixScore / 2 : 0} />

                <div className="flex flex-col items-center sm:items-start gap-1">
                  <span className="text-sm font-semibold">Otix Community</span>
                  <span className="text-xs text-muted-foreground">
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
          <div className="flex flex-wrap gap-1.5">
            {externalRatings.map((r) => {
              const theme = providerTheme(r.provider)
              const logo = providerLogo(r.provider)
              return (
                <div
                  key={r.id}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold',
                    theme.bg,
                    theme.text,
                  )}
                  title={`${r.score}/${r.maxScore}${r.voteCount ? ` (${r.voteCount.toLocaleString()} votes)` : ''}`}
                >
                  {isSteamProvider(r.provider) ? (
                    <SteamIcon className="h-3.5 w-3.5 opacity-90 shrink-0" />
                  ) : r.provider === "plex" ? (
                    <PlexIcon className="h-3.5 w-3.5 opacity-90 shrink-0" />
                  ) : logo ? (
                    <img
                      src={logo}
                      alt=""
                      className={cn(
                        'h-3.5 w-auto max-w-[3.5rem] object-contain opacity-90 shrink-0',
                        theme.logoInvert && 'invert brightness-0',
                      )}
                    />
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                      {providerLabel(r.provider)}
                    </span>
                  )}
                  <span className={cn('tabular-nums', theme.score)}>
                    {Math.round(r.score)}
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
