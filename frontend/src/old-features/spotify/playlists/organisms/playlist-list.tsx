// TODO: Review this file
import { MusicIcon } from "lucide-react"
import type { SpotifyPlaylist } from "../types"
import { PlaylistCard } from "../molecules/playlist-card"
import "./playlist-list.scss"

interface PlaylistListProps {
  playlists: SpotifyPlaylist[]
  isLoading?: boolean
}

export function PlaylistList({ playlists, isLoading }: PlaylistListProps) {
  if (isLoading) {
    return (
      <div className="dk-playlist-list__grid">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="dk-playlist-list__skeleton" />
        ))}
      </div>
    )
  }

  if (!playlists.length) {
    return (
      <div className="dk-playlist-list__empty">
        <MusicIcon className="h-12 w-12 mb-4 opacity-40" />
        <p className="dk-playlist-list__empty-heading">No playlists found</p>
        <p className="dk-playlist-list__empty-subtitle">Create a playlist on Spotify to see it here.</p>
      </div>
    )
  }

  return (
    <div className="dk-playlist-list__grid">
      {playlists.map((playlist) => (
        <PlaylistCard key={playlist.id} playlist={playlist} />
      ))}
    </div>
  )
}
