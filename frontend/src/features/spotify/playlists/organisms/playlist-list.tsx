import { MusicIcon } from "lucide-react"
import type { SpotifyPlaylist } from "../types"
import { PlaylistCard } from "../molecules/playlist-card"

interface PlaylistListProps {
  playlists: SpotifyPlaylist[]
  isLoading?: boolean
}

export function PlaylistList({ playlists, isLoading }: PlaylistListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] rounded-xl bg-[var(--dk-surface-glass)] animate-pulse" />
        ))}
      </div>
    )
  }

  if (!playlists.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <MusicIcon className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-lg font-medium">No playlists found</p>
        <p className="text-sm">Create a playlist on Spotify to see it here.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {playlists.map((playlist) => (
        <PlaylistCard key={playlist.id} playlist={playlist} />
      ))}
    </div>
  )
}
