import type { EpisodeOut, ExternalRatingOut } from "../media-queries"
import { cn } from "@/lib/utils"

function getTmdbRating(episode: EpisodeOut): ExternalRatingOut | undefined {
  return episode.externalRatings?.find((r) => r.provider === "tmdb" && r.score > 0)
}

function scoreToColor(score: number, maxScore: number = 10): string {
  const t = Math.max(0, Math.min(1, score / maxScore))
  if (t < 0.25) return "bg-blue-800/60"
  if (t < 0.45) return "bg-blue-600/60"
  if (t < 0.55) return "bg-emerald-600/60"
  if (t < 0.65) return "bg-emerald-500/60"
  if (t < 0.72) return "bg-lime-500/60"
  if (t < 0.78) return "bg-yellow-500/60"
  if (t < 0.84) return "bg-orange-500/60"
  if (t < 0.90) return "bg-orange-600/70"
  return "bg-red-500/70"
}

export function EpisodeHeatmap({ episodes }: { episodes: EpisodeOut[] }) {
  const sorted = [...episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)
  const hasRatings = sorted.some((e) => getTmdbRating(e) !== undefined)
  if (!hasRatings) return null

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {sorted.map((ep) => {
        const rating = getTmdbRating(ep)
        const color = rating ? scoreToColor(rating.score) : "bg-white/[0.03]"
        const tooltip = rating
          ? `E${ep.episodeNumber}: ${rating.score.toFixed(1)}/10${rating.voteCount ? ` (${rating.voteCount} votes)` : ""}`
          : `E${ep.episodeNumber}: no rating`
        return (
          <div
            key={ep.id}
            title={tooltip}
            className={cn(
              "transition-colors w-3 h-3 rounded-[3px]",
              color,
              rating && "cursor-help hover:shadow-[0_0_0_1px_rgb(255_255_255_/_0.3)]",
            )}
          />
        )
      })}
    </div>
  )
}
