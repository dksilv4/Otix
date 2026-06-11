// TODO: Review this file
import { useState } from "react"
import { Helmet } from "react-helmet-async"
import { useParams, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useSpotifyPlaylist, useSubscribePlaylist, useUnsubscribePlaylist, useSyncPlaylist } from "../api/spotify-playlists-api"
import { PlaylistDetail } from "../organisms/playlist-detail"
import { LoadingPage } from "@ui/pages/loading-page"

export function SpotifyPlaylistDetailPage() {
  const { id } = useParams({ from: "/library/spotify/playlists/$id" })
  const navigate = useNavigate()
  const { data: playlist, isLoading, error } = useSpotifyPlaylist(id)
  const subscribeMutation = useSubscribePlaylist()
  const unsubscribeMutation = useUnsubscribePlaylist()
  const syncMutation = useSyncPlaylist()

  const [isSyncing, setIsSyncing] = useState(false)

  if (isLoading) return <LoadingPage />

  if (error || !playlist) {
    return (
      <div className="dk-spotify-playlist-detail-page">
        <div className="dk-spotify-playlist-detail-page__error">
          <p className="dk-spotify-playlist-detail-page__error-text">Failed to load playlist</p>
        </div>
      </div>
    )
  }

  const isSubscribed = playlist._subscription?.subscribed ?? false

  const handleSubscribe = async () => {
    await subscribeMutation.mutateAsync(id)
  }

  const handleUnsubscribe = async () => {
    await unsubscribeMutation.mutateAsync(id)
  }

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await syncMutation.mutateAsync(id)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="dk-spotify-playlist-detail-page">
      <Helmet>
        <title>{playlist.name} — Spotify Playlists — Otix</title>
      </Helmet>

      <button
        onClick={() => navigate({ to: "/library/spotify/playlists" })}
        className="dk-spotify-playlist-detail-page__back-button"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to playlists
      </button>

      <PlaylistDetail
        playlist={playlist}
        isSubscribed={isSubscribed}
        isSyncing={isSyncing || subscribeMutation.isPending}
        onSubscribe={handleSubscribe}
        onUnsubscribe={handleUnsubscribe}
        onSync={handleSync}
      />
    </div>
  )
}
