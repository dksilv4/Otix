// TODO: Review this file
import "./playlist-detail.scss"
import { PlayIcon, MusicIcon } from "lucide-react"
import type { SpotifyPlaylistDetail, SpotifyPlaylistTrack } from "../types"
import { PlaylistTrackRow } from "../molecules/playlist-track-row"
import { PlaylistSyncPanel } from "./playlist-sync-panel"
import { usePlayer } from "@/old-features/spotify/use-player"

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
    <div className="dk-spotify__detail">
      {/* Header */}
      <div className="dk-spotify__header">
        {image ? (
          <img src={image} alt={playlist.name} className="dk-spotify__cover" />
        ) : (
          <div className="dk-spotify__cover dk-spotify__cover--placeholder">
            <MusicIcon className="h-16 w-16 text-muted-foreground" />
          </div>
        )}
        <div className="dk-spotify__info">
          <p className="dk-spotify__label">Playlist</p>
          <h1 className="dk-spotify__title">{playlist.name}</h1>
          {playlist.description && (
            <p className="dk-spotify__desc">{playlist.description}</p>
          )}
          <p className="dk-spotify__meta">
            {trackCount} track{trackCount !== 1 ? "s" : ""}
            {playlist.owner?.display_name ? ` · ${playlist.owner.display_name}` : ""}
          </p>
          <div className="dk-spotify__actions">
            <button
              onClick={handlePlayAll}
              className="dk-spotify__play-btn"
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
      <div className="dk-spotify__tracklist">
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
