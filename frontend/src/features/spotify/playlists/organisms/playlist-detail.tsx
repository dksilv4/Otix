import { PlayIcon, MusicIcon } from "lucide-react"
import type { SpotifyPlaylistDetail, SpotifyPlaylistTrack } from "../types"
import { PlaylistTrackRow } from "../molecules/playlist-track-row"
import { PlaylistSyncPanel } from "./playlist-sync-panel"
import { usePlayer } from "@/features/spotify/use-player"

interface PlaylistDetailProps {
  playlist: SpotifyPlaylistDetail
  onSubscribe: () => void
  onUnsubscribe: () => void
  onSync: () => void
  isSubscribed: boolean
  isSyncing?: boolean
}

export function PlaylistDetail({ playlist, onSubscribe, onUnsubscribe, onSync, isSubscribed, isSyncing }: PlaylistDetailProps) {
  const { playSpotify, currentTrack } = usePlayer()
  const image = playlist.images?.[0]?.url
  const trackCount = playlist.tracks?.total ?? 0
  const tracks: SpotifyPlaylistTrack[] = playlist.tracks?.items ?? []

  const handlePlayTrack = (uri: string) => {
    playSpotify(uri)
  }

  const handlePlayAll = () => {
    const uris = tracks.map(t => t.track?.uri).filter(Boolean) as string[]
    if (uris.length > 0) {
      playSpotify(uris[0])
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex gap-6 items-end">
        {image ? (
          <img src={image} alt={playlist.name} className="h-48 w-48 rounded-xl object-cover shadow-lg" />
        ) : (
          <div className="h-48 w-48 rounded-xl bg-muted flex items-center justify-center">
            <MusicIcon className="h-16 w-16 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Playlist</p>
          <h1 className="text-3xl font-bold truncate mt-1">{playlist.name}</h1>
          {playlist.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{playlist.description}</p>
          )}
          <p className="text-sm text-muted-foreground mt-2">
            {trackCount} track{trackCount !== 1 ? "s" : ""}
            {playlist.owner?.display_name ? ` · ${playlist.owner.display_name}` : ""}
          </p>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handlePlayAll}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <PlayIcon className="h-4 w-4" />
              Play all
            </button>
            <PlaylistSyncPanel
              isSubscribed={isSubscribed}
              isSyncing={isSyncing}
              onSubscribe={onSubscribe}
              onUnsubscribe={onUnsubscribe}
              onSync={onSync}
              lastSyncedAt={playlist._subscription?.last_synced_at ?? null}
            />
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="space-y-1">
        {tracks.map((track, i) => (
          <PlaylistTrackRow
            key={`${track.track?.id}-${i}`}
            track={track}
            index={i}
            isPlaying={currentTrack?.id === track.track?.id}
            onPlay={handlePlayTrack}
          />
        ))}
      </div>
    </div>
  )
}
