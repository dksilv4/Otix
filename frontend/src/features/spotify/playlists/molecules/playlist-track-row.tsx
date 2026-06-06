// TODO: Review this file
import { PauseIcon, PlayIcon } from "lucide-react"
import { cn, formatDuration } from "@/lib/utils"
import type { SpotifyPlaylistTrack } from "../types"
import "./playlist-track-row.scss"

interface PlaylistTrackRowProps {
  track: SpotifyPlaylistTrack
  index: number
  isPlaying?: boolean
  onPlay: (uri: string) => void
  className?: string
}

export function PlaylistTrackRow({ track, index, isPlaying, onPlay, className }: PlaylistTrackRowProps) {
  const t = track.track
  if (!t) return null

  const image = t.album?.images?.[2]?.url ?? t.album?.images?.[0]?.url
  const artists = t.artists?.map(a => a.name).join(", ") ?? "Unknown Artist"

  return (
    <div
      className={cn(
        "dk-playlist-track-row",
        isPlaying && "dk-playlist-track-row--playing",
        className,
      )}
    >
      <button
        onClick={() => onPlay(t.uri)}
        className="dk-playlist-track-row__play-btn"
        title={`Play ${t.name}`}
      >
        <span className="dk-playlist-track-row__index">
          {index + 1}
        </span>
        <span className="dk-playlist-track-row__icon">
          {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        </span>
      </button>

      <div className="dk-playlist-track-row__info">
        {image && (
          <img src={image} alt="" className="dk-playlist-track-row__album-art" />
        )}
        <div className="dk-playlist-track-row__details">
          <p className={cn("dk-playlist-track-row__name", isPlaying && "dk-playlist-track-row__name--playing")}>
            {t.name}
          </p>
          <p className="dk-playlist-track-row__artist">{artists}</p>
        </div>
      </div>

      <span className="dk-playlist-track-row__duration">
        {t.duration_ms ? formatDuration(t.duration_ms) : "—"}
      </span>
    </div>
  )
}
