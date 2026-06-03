import { useNavigate } from "@tanstack/react-router"
import { CheckCircle2Icon, MusicIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SpotifyPlaylist } from "../types"

interface PlaylistCardProps {
  playlist: SpotifyPlaylist
  className?: string
}

export function PlaylistCard({ playlist, className }: PlaylistCardProps) {
  const navigate = useNavigate()
  const image = playlist.images?.[0]?.url
  const trackCount = playlist.items?.total ?? 0
  const isSubscribed = playlist._subscription?.subscribed ?? false

  return (
    <button
      onClick={() => navigate({ to: "/library/spotify/playlists/$id", params: { id: playlist.id } })}
      className={cn(
        "group relative flex flex-col rounded-xl overflow-hidden transition-all duration-200",
        "bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-hover)]",
        "border border-transparent hover:border-primary/20",
        "text-left",
        className,
      )}
    >
      <div className="aspect-square overflow-hidden">
        {image ? (
          <img
            src={image}
            alt={playlist.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-muted text-muted-foreground">
            <MusicIcon className="h-12 w-12" />
          </div>
        )}
      </div>
      <div className="p-3 space-y-1">
        <h3 className="font-semibold text-sm truncate">{playlist.name}</h3>
        <p className="text-xs text-muted-foreground truncate">
          {trackCount} track{trackCount !== 1 ? "s" : ""}
          {playlist.owner?.display_name ? ` · ${playlist.owner.display_name}` : ""}
        </p>
        {isSubscribed && (
          <span className="inline-flex items-center gap-1 text-xs text-primary">
            <CheckCircle2Icon className="h-3 w-3" />
            Subscribed
          </span>
        )}
      </div>
    </button>
  )
}
