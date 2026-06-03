import { PauseIcon, PlayIcon } from "lucide-react"
import { cn, formatDuration } from "@/lib/utils"
import type { SpotifyPlaylistTrack } from "../types"

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
        "group grid grid-cols-[auto_1fr_auto] gap-3 items-center px-3 py-2 rounded-lg transition-colors",
        "hover:bg-[var(--dk-surface-glass)]",
        isPlaying && "bg-primary/5",
        className,
      )}
    >
      <button
        onClick={() => onPlay(t.uri)}
        className="relative flex items-center justify-center w-8 h-8 shrink-0"
        title={`Play ${t.name}`}
      >
        <span className="group-hover:hidden text-sm text-muted-foreground w-4 text-right">
          {index + 1}
        </span>
        <span className="hidden group-hover:flex items-center justify-center w-full h-full text-foreground">
          {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        </span>
      </button>

      <div className="flex items-center gap-3 min-w-0">
        {image && (
          <img src={image} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
        )}
        <div className="min-w-0">
          <p className={cn("text-sm font-medium truncate", isPlaying && "text-primary")}>
            {t.name}
          </p>
          <p className="text-xs text-muted-foreground truncate">{artists}</p>
        </div>
      </div>

      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {t.duration_ms ? formatDuration(t.duration_ms) : "—"}
      </span>
    </div>
  )
}
