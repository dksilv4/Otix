"""TMDB API client for Otix.

Subclasses ``BaseProviderClient`` from the Otix Provider Integration Framework,
handling rate limiting, circuit breaking, local caching, and execution telemetry.

API documentation: https://developer.themoviedb.org/reference
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
from django.conf import settings

from core.providers.framework import (
    BaseProviderClient,
    JSONValue,
    resolve_shared_http_client,
)

if TYPE_CHECKING:
    from redis.asyncio import Redis

# Process-shared HTTP client connection pool
_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a process-shared AsyncClient bound to the TMDB base URL."""
    global _shared_client, _shared_client_loop_id
    try:
        import core.providers.tmdb as tmdb_pkg

        if tmdb_pkg._shared_client is None and _shared_client is not None:
            _shared_client = None
            _shared_client_loop_id = None
    except (ImportError, AttributeError):
        tmdb_pkg = None  # type: ignore[assignment]

    headers = {"Accept": "application/json"}
    if hasattr(settings, "TMDB_RAT"):
        headers["Authorization"] = f"Bearer {settings.TMDB_RAT}"
    _shared_client, _shared_client_loop_id = resolve_shared_http_client(
        _shared_client,
        _shared_client_loop_id,
        base_url=TMDBProvider.BASE_URL,
        timeout=getattr(settings, "TMDB_REQUEST_TIMEOUT_SECONDS", 10.0),
        headers=headers,
    )
    if tmdb_pkg is not None:
        tmdb_pkg._shared_client = _shared_client
        tmdb_pkg._shared_client_loop_id = _shared_client_loop_id
    return _shared_client


async def close_http_client() -> None:
    """Close and reset the process-shared HTTP client."""
    global _shared_client, _shared_client_loop_id
    if _shared_client is not None and not _shared_client.is_closed:
        await _shared_client.aclose()
    _shared_client = None
    _shared_client_loop_id = None
    try:
        import core.providers.tmdb as tmdb_pkg

        tmdb_pkg._shared_client = None
        tmdb_pkg._shared_client_loop_id = None
    except (ImportError, AttributeError):
        pass


class TMDBProvider(BaseProviderClient):
    """Async TMDB API client wrapped with rate limiting and circuit breaking."""

    BASE_URL = "https://api.themoviedb.org/3"

    def __init__(
        self,
        redis: Redis | None = None,
        http_client: httpx.AsyncClient | None = None,
        *,
        circuit_threshold: int = 5,
        circuit_recovery: float = 30.0,
    ) -> None:
        client = http_client or get_http_client()
        rps_limit = getattr(settings, "TMDB_GLOBAL_RPS_LIMIT", 40.0)
        super().__init__(
            name="tmdb",
            http_client=client,
            redis=redis,
            rate=rps_limit,
            burst=rps_limit,
            circuit_threshold=circuit_threshold,
            circuit_recovery=circuit_recovery,
        )

    # ── Movies ──────────────────────────────────────────────────

    async def get_movie(self, tmdb_id: int, language: str = "en-US") -> dict[str, JSONValue]:
        """Fetch movie details with appended credits, external_ids, images, and releases."""
        lang = language.split("-")[0]
        response = await self._get(
            f"/movie/{tmdb_id}",
            params={
                "language": language,
                "append_to_response": "credits,external_ids,images,videos,release_dates,keywords",
                "include_image_language": f"{lang},null",
            },
        )
        return response.json()

    async def get_movie_images(self, tmdb_id: int) -> dict[str, JSONValue]:
        """Fetch all image assets for a movie (no language filter for textless posters)."""
        response = await self._get(f"/movie/{tmdb_id}/images")
        return response.json()

    async def get_movie_changes(
        self, start_date: str, end_date: str, page: int = 1
    ) -> dict[str, JSONValue]:
        """Fetch changed movie IDs in a date range."""
        response = await self._get(
            "/movie/changes",
            params={"start_date": start_date, "end_date": end_date, "page": page},
        )
        return response.json()

    async def get_movie_popular(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch currently popular movies."""
        response = await self._get("/movie/popular", params={"language": language, "page": page})
        return response.json()

    async def get_movie_top_rated(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch top-rated movies."""
        response = await self._get("/movie/top_rated", params={"language": language, "page": page})
        return response.json()

    async def get_movie_upcoming(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch upcoming movies."""
        response = await self._get("/movie/upcoming", params={"language": language, "page": page})
        return response.json()

    async def get_movie_now_playing(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch movies currently playing in theaters."""
        response = await self._get(
            "/movie/now_playing", params={"language": language, "page": page}
        )
        return response.json()

    async def get_movie_recommendations(
        self, tmdb_id: int, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch recommended movies for a given movie."""
        response = await self._get(
            f"/movie/{tmdb_id}/recommendations",
            params={"language": language, "page": page},
        )
        return response.json()

    async def get_movie_similar(
        self, tmdb_id: int, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch similar movies for a given movie."""
        response = await self._get(
            f"/movie/{tmdb_id}/similar",
            params={"language": language, "page": page},
        )
        return response.json()

    # ── Collections ─────────────────────────────────────────────

    async def get_collection(self, tmdb_id: int, language: str = "en-US") -> dict[str, JSONValue]:
        """Fetch collection details by TMDB collection ID."""
        response = await self._get(
            f"/collection/{tmdb_id}",
            params={"language": language},
        )
        return response.json()

    # ── Shows ───────────────────────────────────────────────────

    async def get_show(self, tmdb_id: int, language: str = "en-US") -> dict[str, JSONValue]:
        """Fetch TV series details with appended seasons, ratings, and credits."""
        lang = language.split("-")[0]
        response = await self._get(
            f"/tv/{tmdb_id}",
            params={
                "language": language,
                "append_to_response": (
                    "credits,external_ids,images,videos,keywords,seasons,content_ratings"
                ),
                "include_image_language": f"{lang},null",
            },
        )
        return response.json()

    async def get_show_changes(
        self, start_date: str, end_date: str, page: int = 1
    ) -> dict[str, JSONValue]:
        """Fetch changed show IDs in a date range."""
        response = await self._get(
            "/tv/changes",
            params={"start_date": start_date, "end_date": end_date, "page": page},
        )
        return response.json()

    async def get_show_images(self, tmdb_id: int) -> dict[str, JSONValue]:
        """Fetch all image assets for a show."""
        response = await self._get(f"/tv/{tmdb_id}/images")
        return response.json()

    async def get_show_content_ratings(self, tmdb_id: int) -> dict[str, JSONValue]:
        """Fetch content ratings by country for a show."""
        response = await self._get(f"/tv/{tmdb_id}/content_ratings")
        return response.json()

    async def get_season(
        self, show_tmdb_id: int, season_number: int, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch details and episodes for a TV season."""
        response = await self._get(
            f"/tv/{show_tmdb_id}/season/{season_number}",
            params={"language": language},
        )
        return response.json()

    async def get_show_popular(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch popular TV shows."""
        response = await self._get("/tv/popular", params={"language": language, "page": page})
        return response.json()

    async def get_show_top_rated(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch top-rated TV shows."""
        response = await self._get("/tv/top_rated", params={"language": language, "page": page})
        return response.json()

    async def get_show_on_the_air(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch TV shows currently on the air."""
        response = await self._get("/tv/on_the_air", params={"language": language, "page": page})
        return response.json()

    async def get_show_airing_today(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch TV shows airing today."""
        response = await self._get("/tv/airing_today", params={"language": language, "page": page})
        return response.json()

    async def get_show_recommendations(
        self, tmdb_id: int, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch recommendations for a TV show."""
        response = await self._get(
            f"/tv/{tmdb_id}/recommendations",
            params={"language": language, "page": page},
        )
        return response.json()

    async def get_show_similar(
        self, tmdb_id: int, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch similar TV shows for a given show."""
        response = await self._get(
            f"/tv/{tmdb_id}/similar",
            params={"language": language, "page": page},
        )
        return response.json()

    # ── People ──────────────────────────────────────────────────

    async def get_person(self, tmdb_id: int, language: str = "en-US") -> dict[str, JSONValue]:
        """Fetch person details with appended external IDs and images."""
        response = await self._get(
            f"/person/{tmdb_id}",
            params={"language": language, "append_to_response": "external_ids,images"},
        )
        return response.json()

    async def get_person_changes(
        self, start_date: str, end_date: str, page: int = 1
    ) -> dict[str, JSONValue]:
        """Fetch changed person IDs in a date range."""
        response = await self._get(
            "/person/changes",
            params={"start_date": start_date, "end_date": end_date, "page": page},
        )
        return response.json()

    async def get_person_combined_credits(
        self, tmdb_id: int, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch all movie and TV credits for a person."""
        response = await self._get(
            f"/person/{tmdb_id}/combined_credits",
            params={"language": language},
        )
        return response.json()

    # ── Companies / Networks ────────────────────────────────────

    async def get_company(self, tmdb_id: int) -> dict[str, JSONValue]:
        """Fetch production company details."""
        response = await self._get(f"/company/{tmdb_id}")
        return response.json()

    async def get_network(self, tmdb_id: int) -> dict[str, JSONValue]:
        """Fetch TV network details."""
        response = await self._get(f"/network/{tmdb_id}")
        return response.json()

    # ── Watch Providers ─────────────────────────────────────────

    async def get_watch_providers(self, media_type: str, tmdb_id: int) -> dict[str, JSONValue]:
        """Fetch streaming watch providers for a movie or show."""
        endpoint = "movie" if media_type in ("movie", "movies") else "tv"
        response = await self._get(f"/{endpoint}/{tmdb_id}/watch/providers")
        return response.json()

    async def get_movie_watch_providers(self, tmdb_id: int) -> dict[str, JSONValue]:
        """Fetch streaming watch providers for a movie."""
        return await self.get_watch_providers("movie", tmdb_id)

    async def get_show_watch_providers(self, tmdb_id: int) -> dict[str, JSONValue]:
        """Fetch streaming watch providers for a show."""
        return await self.get_watch_providers("tv", tmdb_id)

    # ── Keywords ─────────────────────────────────────────────────

    async def get_keyword(self, tmdb_id: int) -> dict[str, JSONValue]:
        """Fetch keyword details."""
        response = await self._get(f"/keyword/{tmdb_id}")
        return response.json()

    # ── Search ──────────────────────────────────────────────────

    async def search_multi(
        self, query: str, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Multi-search across movies, TV shows, and people."""
        response = await self._get(
            "/search/multi",
            params={"query": query, "page": page, "language": language},
        )
        return response.json()

    async def search_movies(
        self,
        query: str,
        *,
        year: int | None = None,
        page: int = 1,
        language: str = "en-US",
    ) -> dict[str, JSONValue]:
        """Search movies by title."""
        params: dict[str, str | int] = {"query": query, "page": page, "language": language}
        if year is not None:
            params["year"] = int(year)
        response = await self._get("/search/movie", params=params)
        return response.json()

    # Backwards compatibility alias
    search_movie = search_movies

    async def search_shows(
        self,
        query: str,
        *,
        first_air_date_year: int | None = None,
        page: int = 1,
        language: str = "en-US",
    ) -> dict[str, JSONValue]:
        """Search TV shows by title."""
        params: dict[str, str | int] = {"query": query, "page": page, "language": language}
        if first_air_date_year is not None:
            params["first_air_date_year"] = int(first_air_date_year)
        response = await self._get("/search/tv", params=params)
        return response.json()

    # Backwards compatibility alias
    search_tv = search_shows

    async def search_people(
        self, query: str, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Search people by name."""
        response = await self._get(
            "/search/person",
            params={"query": query, "page": page, "language": language},
        )
        return response.json()

    async def search_companies(self, query: str, page: int = 1) -> dict[str, JSONValue]:
        """Search production companies by name."""
        response = await self._get("/search/company", params={"query": query, "page": page})
        return response.json()

    # Backwards compatibility alias
    search_company = search_companies

    async def find_by_external_id(
        self, external_id: str, external_source: str = "imdb_id", language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Find TMDB IDs by external ID (imdb_id, tvdb_id, etc.)."""
        response = await self._get(
            f"/find/{external_id}",
            params={"external_source": external_source, "language": language},
        )
        return response.json()

    # ── Discover ────────────────────────────────────────────────

    async def discover(
        self,
        media_type: str,
        params: dict[str, str] | None = None,
        language: str = "en-US",
    ) -> dict[str, JSONValue]:
        """Generic discover endpoint for movies or tv."""
        base_params: dict[str, str] = {"language": language}
        if params:
            base_params.update(params)
        response = await self._get(f"/discover/{media_type}", params=base_params)
        return response.json()

    async def discover_movies(
        self,
        params: dict[str, str] | None = None,
        page: int = 1,
        language: str = "en-US",
    ) -> dict[str, JSONValue]:
        """Discover movies with custom filtering and pagination."""
        query_params: dict[str, str] = {"page": str(page)}
        if params:
            query_params.update(params)
        return await self.discover("movie", params=query_params, language=language)

    async def discover_shows(
        self,
        params: dict[str, str] | None = None,
        page: int = 1,
        language: str = "en-US",
    ) -> dict[str, JSONValue]:
        """Discover TV shows with custom filtering and pagination."""
        query_params: dict[str, str] = {"page": str(page)}
        if params:
            query_params.update(params)
        return await self.discover("tv", params=query_params, language=language)

    # ── Trending & Changes ──────────────────────────────────────

    async def trending(
        self,
        media_type: str = "all",
        time_window: str = "day",
        page: int = 1,
        language: str = "en-US",
    ) -> dict[str, JSONValue]:
        """Fetch trending media items (all, movie, tv, or person) over day or week."""
        response = await self._get(
            f"/trending/{media_type}/{time_window}",
            params={"language": language, "page": page},
        )
        return response.json()

    # Backwards compatibility alias
    get_trending = trending

    async def changes(
        self, media_type: str, start_date: str, end_date: str, page: int = 1
    ) -> dict[str, JSONValue]:
        """Fetch changed entity IDs for movie, tv, or person."""
        endpoint = "tv" if media_type in ("show", "tv") else media_type
        response = await self._get(
            f"/{endpoint}/changes",
            params={"start_date": start_date, "end_date": end_date, "page": page},
        )
        return response.json()

    # ── Configuration & Genres ──────────────────────────────────

    async def get_configuration(self) -> dict[str, JSONValue]:
        """Fetch system-wide TMDB API configuration (base URLs, image sizes)."""
        response = await self._get("/configuration")
        return response.json()

    async def get_genres(
        self, media_type: str = "movie", language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Fetch canonical genre list for movie or tv."""
        response = await self._get(f"/genre/{media_type}/list", params={"language": language})
        return response.json()

    # ── User ratings / watchlists / favorites (session auth) ─────

    async def get_rated_movies(
        self, account_id: int, session_id: str, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            f"/account/{account_id}/rated/movies",
            params={
                "api_key": settings.TMDB_API_KEY,
                "session_id": session_id,
                "language": language,
                "page": page,
                "sort_by": "created_at.desc",
            },
        )
        return response.json()

    async def get_rated_tv(
        self, account_id: int, session_id: str, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            f"/account/{account_id}/rated/tv",
            params={
                "api_key": settings.TMDB_API_KEY,
                "session_id": session_id,
                "language": language,
                "page": page,
                "sort_by": "created_at.desc",
            },
        )
        return response.json()

    async def get_rated_tv_episodes(
        self, account_id: int, session_id: str, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            f"/account/{account_id}/rated/tv/episodes",
            params={
                "api_key": settings.TMDB_API_KEY,
                "session_id": session_id,
                "language": language,
                "page": page,
                "sort_by": "created_at.desc",
            },
        )
        return response.json()

    async def get_movie_watchlist(
        self, account_id: int, session_id: str, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            f"/account/{account_id}/watchlist/movies",
            params={
                "api_key": settings.TMDB_API_KEY,
                "session_id": session_id,
                "language": language,
                "page": page,
            },
        )
        return response.json()

    async def get_tv_watchlist(
        self, account_id: int, session_id: str, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            f"/account/{account_id}/watchlist/tv",
            params={
                "api_key": settings.TMDB_API_KEY,
                "session_id": session_id,
                "language": language,
                "page": page,
            },
        )
        return response.json()

    async def get_favorite_movies(
        self, account_id: int, session_id: str, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            f"/account/{account_id}/favorite/movies",
            params={
                "api_key": settings.TMDB_API_KEY,
                "session_id": session_id,
                "language": language,
                "page": page,
            },
        )
        return response.json()

    async def get_favorite_tv(
        self, account_id: int, session_id: str, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            f"/account/{account_id}/favorite/tv",
            params={
                "api_key": settings.TMDB_API_KEY,
                "session_id": session_id,
                "language": language,
                "page": page,
            },
        )
        return response.json()

    # ── Write endpoints (session auth) ──────────────────────────

    async def rate_movie(
        self, movie_id: int, rating: float, session_id: str
    ) -> dict[str, JSONValue]:
        response = await self._post(
            f"/movie/{movie_id}/rating",
            params={"api_key": settings.TMDB_API_KEY, "session_id": session_id},
            json={"value": rating},
        )
        response.raise_for_status()
        return response.json()

    async def rate_tv(self, tv_id: int, rating: float, session_id: str) -> dict[str, JSONValue]:
        response = await self._post(
            f"/tv/{tv_id}/rating",
            params={"api_key": settings.TMDB_API_KEY, "session_id": session_id},
            json={"value": rating},
        )
        response.raise_for_status()
        return response.json()

    async def delete_movie_rating(self, movie_id: int, session_id: str) -> dict[str, JSONValue]:
        response = await self._request(
            "DELETE",
            f"/movie/{movie_id}/rating",
            params={"api_key": settings.TMDB_API_KEY, "session_id": session_id},
        )
        response.raise_for_status()
        return response.json()

    async def delete_tv_rating(self, tv_id: int, session_id: str) -> dict[str, JSONValue]:
        response = await self._request(
            "DELETE",
            f"/tv/{tv_id}/rating",
            params={"api_key": settings.TMDB_API_KEY, "session_id": session_id},
        )
        response.raise_for_status()
        return response.json()

    async def add_to_watchlist(
        self, account_id: int, session_id: str, media_type: str, media_id: int
    ) -> dict[str, JSONValue]:
        response = await self._post(
            f"/account/{account_id}/watchlist",
            params={"api_key": settings.TMDB_API_KEY, "session_id": session_id},
            json={"media_type": media_type, "media_id": media_id, "watchlist": True},
        )
        response.raise_for_status()
        return response.json()
