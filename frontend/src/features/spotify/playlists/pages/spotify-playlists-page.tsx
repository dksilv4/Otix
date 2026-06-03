import { Helmet } from "react-helmet-async"
import { useSpotifyPlaylists } from "../api/spotify-playlists-api"
import { PlaylistList } from "../organisms/playlist-list"

export function SpotifyPlaylistsPage() {
  const { data, isLoading, error } = useSpotifyPlaylists()

  return (
    <div className="container mx-auto py-8 px-4">
      <Helmet>
        <title>Spotify Playlists — Otix</title>
      </Helmet>

      <div className="mb-8">
        <h1 className="text-2xl font-bold">Spotify Playlists</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse your Spotify playlists and import them into Otix
        </p>
      </div>

      {error ? (
        <div className="rounded-xl bg-destructive/10 p-6 text-destructive text-center">
          <p className="font-medium">Failed to load playlists</p>
          <p className="text-sm mt-1">Make sure your Spotify account is linked in Settings.</p>
        </div>
      ) : (
        <PlaylistList
          playlists={data?.items ?? []}
          isLoading={isLoading}
        />
      )}
    </div>
  )
}
