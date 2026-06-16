import { type EpisodeOut, getTmdbRating, scoreToColor } from "@media"

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
            className={`transition-colors w-3 h-3 rounded-[3px] ${color} ${
              rating ? "cursor-help hover:shadow-[0_0_0_1px_rgb(255_255_255_/_0.3)]" : ""
            }`}
          />
        )
      })}
    </div>
  )
}
