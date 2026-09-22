# Supported Providers Sample Data

This directory contains representative mock and sample response payloads for all 12 external providers and integrations supported in **Otix**.

Files are organized by provider directory, with subdirectories and file paths mirroring the provider's API endpoints or query resources.

---

## Supported Providers

| Provider | Purpose in Otix | API Base URL / Transport | Directory |
| :--- | :--- | :--- | :--- |
| **TMDB** | Movies, TV series, episodes, people, credits, collections, genres, trending | `https://api.themoviedb.org/3` | [`tmdb/`](./tmdb/) |
| **IGDB** | Video game metadata, covers, screenshots, franchises, age ratings | `https://api.igdb.com/v4` | [`igdb/`](./igdb/) |
| **SteamGridDB** | Game visual assets (grids, heroes, transparent logos, icons) | `https://www.steamgriddb.com/api/v2` | [`steamgrid/`](./steamgrid/) |
| **MusicBrainz** | Music releases (albums), artists, recordings (tracks), Cover Art Archive | `https://musicbrainz.org/ws/2` | [`musicbrainz/`](./musicbrainz/) |
| **Fanart.tv** | Supplementary visual assets (clear logos, backgrounds, disc art, banners) | `https://webservice.fanart.tv/v3` | [`fanart/`](./fanart/) |
| **Last.fm** | Album metadata, wiki summaries, playcounts, user tags | `https://ws.audioscrobbler.com/2.0/` | [`lastfm/`](./lastfm/) |
| **LRCLIB** | Plain text and time-synchronized lyrics for music tracks | `https://lrclib.net/api` | [`lrclib/`](./lrclib/) |
| **OMDb** | IMDb, Rotten Tomatoes, and Metacritic ratings and awards | `https://www.omdbapi.com` | [`omdb/`](./omdb/) |
| **Steam** | Owned games, wishlists, store details, review scores, player counts | `https://api.steampowered.com` & Store API | [`steam/`](./steam/) |
| **Plex** | Media server libraries, sections, items, sessions, Plex.tv watchlist | `https://plex.tv` & Local PMS | [`plex/`](./plex/) |
| **YouTube** | Liked music videos, channels, playlists | `https://www.googleapis.com/youtube/v3` | [`youtube/`](./youtube/) |
| **Epic Games** | Owned game library scan and store promotions | Otix Game Server & Epic API | [`epic/`](./epic/) |

---

## Endpoint Mapping Summary

### TMDB (`tmdb/`)
- `movie/id.json` – `GET /movie/{id}` (includes `append_to_response=credits,external_ids,images,videos,release_dates,keywords`)
- `movie/trending/week.json` & `trending/movie/week.json` – `GET /trending/movie/week`
- `movie/trending/day.json` & `trending/movie/day.json` – `GET /trending/movie/day`
- `movie/popular.json` – `GET /movie/popular`
- `movie/top_rated.json` – `GET /movie/top_rated`
- `movie/upcoming.json` – `GET /movie/upcoming`
- `movie/now_playing.json` – `GET /movie/now_playing`
- `movie/images.json` – `GET /movie/{id}/images`
- `movie/watch_providers.json` & `movie/watch/providers.json` – `GET /movie/{id}/watch/providers`
- `tv/id.json` – `GET /tv/{id}` (includes seasons, credits, external_ids, images, ratings)
- `tv/trending/week.json` & `trending/tv/week.json` – `GET /trending/tv/week`
- `tv/popular.json` – `GET /tv/popular`
- `tv/season/id.json` – `GET /tv/{id}/season/{season_number}`
- `tv/watch_providers.json` & `tv/watch/providers.json` – `GET /tv/{id}/watch/providers`
- `person/id.json` – `GET /person/{id}`
- `person/combined_credits.json` – `GET /person/{id}/combined_credits`
- `search/movie.json` – `GET /search/movie`
- `search/tv.json` – `GET /search/tv`
- `search/multi.json` – `GET /search/multi`
- `discover/movie.json` – `GET /discover/movie`
- `discover/tv.json` – `GET /discover/tv`
- `genre/movie/list.json` – `GET /genre/movie/list`
- `genre/tv/list.json` – `GET /genre/tv/list`
- `configuration.json` – `GET /configuration`
- `find/id.json` – `GET /find/{external_id}`

### IGDB (`igdb/`)
- `games/id.json` – `POST /games` (Full game record matching `GAME_HYDRATION_FIELDS`)
- `games/popular.json` – `POST /games` (Top rated games sorted by `aggregated_rating`)
- `games/recent.json` – `POST /games` (Recently released main games)
- `games/upcoming.json` – `POST /games` (Upcoming games with `hypes > 5`)
- `games/search.json` – `POST /games` (Search query by relevance or name)
- `covers/id.json` – `POST /covers`
- `artworks/id.json` – `POST /artworks`
- `screenshots/id.json` – `POST /screenshots`
- `game_videos/id.json` – `POST /game_videos`
- `companies/id.json` – `POST /companies`
- `involved_companies/id.json` – `POST /involved_companies`
- `age_ratings/id.json` – `POST /age_ratings`
- `franchises/id.json` – `POST /franchises`
- `external_games/id.json` – `POST /external_games`

### SteamGridDB (`steamgrid/`)
- `games/id.json` – `GET /games/id/{id}`
- `games/steam/id.json` – `GET /games/steam/{platform_id}`
- `search/autocomplete.json` – `GET /search/autocomplete/{query}`
- `grids/game/id.json` – `GET /grids/game/{game_id}`
- `heroes/game/id.json` – `GET /heroes/game/{game_id}`
- `logos/game/id.json` – `GET /logos/game/{game_id}`
- `icons/game/id.json` – `GET /icons/game/{game_id}`

### MusicBrainz (`musicbrainz/`)
- `release/id.json` – `GET /release/{mbid}` (artists, recordings, genres, labels)
- `release/search.json` – `GET /release?query={query}`
- `release/by_artist.json` – `GET /release?artist={mbid}`
- `artist/id.json` – `GET /artist/{mbid}`
- `artist/search.json` – `GET /artist?query={query}`
- `recording/id.json` – `GET /recording/{mbid}`
- `recording/by_release.json` – `GET /recording?release={mbid}`
- `coverartarchive/release/id.json` – `GET https://coverartarchive.org/release/{mbid}`

### Fanart.tv (`fanart/`)
- `movies/id.json` – `GET /movies/{tmdb_id}`
- `tv/id.json` – `GET /tv/{tvdb_id}`

### Last.fm (`lastfm/`)
- `album/getinfo.json` – `GET /?method=album.getinfo`

### LRCLIB (`lrclib/`)
- `get.json` – `GET /get` (Plain and synchronized lyrics)

### OMDb (`omdb/`)
- `id.json` – `GET /?i={imdb_id}`

### Steam (`steam/`)
- `IPlayerService/GetOwnedGames/v1.json` – `GET /IPlayerService/GetOwnedGames/v1/`
- `player_service/get_owned_games.json` – Alias for convenience
- `wishlist/wishlistdata.json` & `wishlistdata.json` – `GET /wishlist/profiles/{steam_id}/wishlistdata`
- `api/appdetails.json` – `GET /api/appdetails`
- `appreviews/id.json` – `GET /appreviews/{app_id}`
- `ISteamUserStats/GetNumberOfCurrentPlayers/v1.json` – `GET /ISteamUserStats/GetNumberOfCurrentPlayers/v1/`
- `api/storesearch.json` – `GET /api/storesearch`

### Plex (`plex/`)
- `api/v2/resources.json` – `GET https://plex.tv/api/v2/resources`
- `library/sections.json` – `GET /library/sections`
- `library/sections/all.json` – `GET /library/sections/{section_key}/all`
- `library/metadata/id.json` – `GET /library/metadata/{rating_key}`
- `status/sessions.json` – `GET /status/sessions`
- `library/sections/watchlist/all.json` – `GET https://discover.provider.plex.tv/library/sections/watchlist/all`

### YouTube (`youtube/`)
- `videos/list.json` & `videos/id.json` – `GET /videos`
- `channels/id.json` – `GET /channels`
- `playlistItems/list.json` – `GET /playlistItems`

### Epic Games (`epic/`)
- `library/scan.json` & `scan.json` – Proxy scan output from Otix Game Server
- `promotions/free_games.json` – Epic Store free games promotions endpoint
