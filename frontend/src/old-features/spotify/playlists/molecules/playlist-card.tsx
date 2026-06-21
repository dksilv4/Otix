// TODO: Review this file
import { useNavigate } from "@tanstack/react-router"
import { CheckCircle2Icon, MusicIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SpotifyPlaylist } from "../types"
import "./playlist-card.scss"

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
      className={cn("dk-playlist-card", className)}
    >
      <div className="dk-playlist-card__image-wrapper">
        {image ? (
          <img
            src={image}
            alt={playlist.name}
            className="dk-playlist-card__image"
          />
        ) : (
          <div className="dk-playlist-card__placeholder">
            <MusicIcon className="h-12 w-12" />
          </div>
        )}
      </div>
      <div className="dk-playlist-card__content">
        <h3 className="dk-playlist-card__title">{playlist.name}</h3>
        <p className="dk-playlist-card__description">
          {trackCount} track{trackCount !== 1 ? "s" : ""}
          {playlist.owner?.display_name ? ` · ${playlist.owner.display_name}` : ""}
        </p>
        {isSubscribed && (
          <span className="dk-playlist-card__subscription-badge">
            <CheckCircle2Icon className="h-3 w-3" />
            Subscribed
          </span>
        )}
      </div>
    </button>
  )
}
