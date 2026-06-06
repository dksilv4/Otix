import { Helmet } from "react-helmet-async"
import { useSpotifyPlaylists } from "../api/spotify-playlists-api"
import { PlaylistList } from "../organisms/playlist-list"
import "./spotify-playlists-page.scss"

export function SpotifyPlaylistsPage() {
  const { data, isLoading, error } = useSpotifyPlaylists()

  return (
    <div className="dk-playlists-page">
      <Helmet>
        <title>Spotify Playlists — Otix</title>
      </Helmet>

      <div className="dk-playlists-page__header">
        <h1 className="dk-playlists-page__title">Spotify Playlists</h1>
        <p className="dk-playlists-page__description">
          Browse your Spotify playlists and import them into Otix
        </p>
      </div>

      {error ? (
        <div className="dk-playlists-page__error">
          <p className="dk-playlists-page__error-title">Failed to load playlists</p>
          <p className="dk-playlists-page__error-description">Make sure your Spotify account is linked in Settings.</p>
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
