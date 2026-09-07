"""TMDB API client (port of ``otix.providers.tmdb.client``).

Auth: Bearer token (TMDB v4 read-access token). Rate limit: 40 req/s default,
configurable via ``TMDB_GLOBAL_RPS_LIMIT``.

API docs: https://developer.themoviedb.org/reference

``TMDBProvider`` subclasses ``core.providers.base.BaseProvider``, so every call
runs through the rate limiter, circuit breaker, and (for GETs) the dev/test
response cache from increments 32/33.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

import httpx
from django.conf import settings

from core.providers.base import BaseProvider
from core.providers.types import JSONValue

if TYPE_CHECKING:
    from redis.asyncio import Redis

# Shared client factory — reuse the connection pool across tasks.
_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a process-shared AsyncClient bound to the TMDB base URL."""
    global _shared_client, _shared_client_loop_id

    try:
        current_loop_id = id(asyncio.get_running_loop())
    except RuntimeError:
        current_loop_id = None

    if _shared_client is not None and _shared_client_loop_id != current_loop_id:
        # Event loop changed (Celery prefork child) — discard inherited client.
        try:
            loop = asyncio.new_event_loop()
            loop.run_until_complete(_shared_client.aclose())
        except Exception:
            pass
        _shared_client = None

    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            base_url=TMDBProvider.BASE_URL,
            timeout=settings.TMDB_REQUEST_TIMEOUT_SECONDS,
            headers={
                "Authorization": f"Bearer {settings.TMDB_RAT}",
                "Accept": "application/json",
            },
        )
        _shared_client_loop_id = current_loop_id
    return _shared_client


class TMDBProvider(BaseProvider):
    BASE_URL = "https://api.themoviedb.org/3"

    def __init__(
        self,
        redis: Redis | None = None,
        http_client: httpx.AsyncClient | None = None,
        *,
        circuit_threshold: int = 5,
        circuit_recovery: float = 30.0,
    ):
        client = http_client or get_http_client()
        super().__init__(
            name="tmdb",
            http_client=client,
            redis=redis,
            rate=settings.TMDB_GLOBAL_RPS_LIMIT,
            burst=settings.TMDB_GLOBAL_RPS_LIMIT,
            circuit_threshold=circuit_threshold,
            circuit_recovery=circuit_recovery,
        )

    # ── Movies ──────────────────────────────────────────────────

    async def get_movie(self, tmdb_id: int, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            f"/movie/{tmdb_id}",
            params={
                "language": language,
                "append_to_response": "credits,external_ids,images,videos,release_dates,keywords",
            },
        )
        return response.json()

    async def get_movie_images(self, tmdb_id: int) -> dict[str, JSONValue]:
        # No language param: language-filtered responses drop null-lang
        # (textless) posters, which we need for the discover artwork filter.
        response = await self._get(f"/movie/{tmdb_id}/images")
        return response.json()

    async def get_movie_changes(
        self, start_date: str, end_date: str, page: int = 1
    ) -> dict[str, JSONValue]:
        response = await self._get(
            "/movie/changes",
            params={"start_date": start_date, "end_date": end_date, "page": page},
        )
        return response.json()

    async def get_movie_popular(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get("/movie/popular", params={"language": language, "page": page})
        return response.json()

    async def get_movie_top_rated(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get("/movie/top_rated", params={"language": language, "page": page})
        return response.json()

    async def get_movie_upcoming(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get("/movie/upcoming", params={"language": language, "page": page})
        return response.json()

    async def get_movie_now_playing(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            "/movie/now_playing", params={"language": language, "page": page}
        )
        return response.json()

    async def get_movie_recommendations(
        self, tmdb_id: int, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            f"/movie/{tmdb_id}/recommendations",
            params={"language": language, "page": page},
        )
        return response.json()

    async def get_movie_similar(
        self, tmdb_id: int, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            f"/movie/{tmdb_id}/similar",
            params={"language": language, "page": page},
        )
        return response.json()

    # ── Shows ───────────────────────────────────────────────────

    async def get_show(self, tmdb_id: int, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            f"/tv/{tmdb_id}",
            params={
                "language": language,
                "append_to_response": (
                    "credits,external_ids,images,videos,keywords,seasons,content_ratings"
                ),
            },
        )
        return response.json()

    async def get_show_changes(
        self, start_date: str, end_date: str, page: int = 1
    ) -> dict[str, JSONValue]:
        response = await self._get(
            "/tv/changes",
            params={"start_date": start_date, "end_date": end_date, "page": page},
        )
        return response.json()

    async def get_show_images(self, tmdb_id: int) -> dict[str, JSONValue]:
        # No language param: language-filtered responses drop null-lang
        # (textless) posters, which we need for the discover artwork filter.
        response = await self._get(f"/tv/{tmdb_id}/images")
        return response.json()

    async def get_show_content_ratings(self, tmdb_id: int) -> dict[str, JSONValue]:
        response = await self._get(f"/tv/{tmdb_id}/content_ratings")
        return response.json()

    async def get_season(
        self, show_tmdb_id: int, season_number: int, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            f"/tv/{show_tmdb_id}/season/{season_number}",
            params={"language": language},
        )
        return response.json()

    async def get_show_popular(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get("/tv/popular", params={"language": language, "page": page})
        return response.json()

    async def get_show_top_rated(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get("/tv/top_rated", params={"language": language, "page": page})
        return response.json()

    async def get_show_on_the_air(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get("/tv/on_the_air", params={"language": language, "page": page})
        return response.json()

    async def get_show_airing_today(
        self, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get("/tv/airing_today", params={"language": language, "page": page})
        return response.json()

    async def get_show_recommendations(
        self, tmdb_id: int, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            f"/tv/{tmdb_id}/recommendations",
            params={"language": language, "page": page},
        )
        return response.json()

    async def get_show_similar(
        self, tmdb_id: int, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            f"/tv/{tmdb_id}/similar",
            params={"language": language, "page": page},
        )
        return response.json()

    # ── People ──────────────────────────────────────────────────

    async def get_person(self, tmdb_id: int, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(
            f"/person/{tmdb_id}",
            params={"language": language, "append_to_response": "external_ids,images"},
        )
        return response.json()

    async def get_person_changes(
        self, start_date: str, end_date: str, page: int = 1
    ) -> dict[str, JSONValue]:
        response = await self._get(
            "/person/changes",
            params={"start_date": start_date, "end_date": end_date, "page": page},
        )
        return response.json()

    async def get_person_combined_credits(
        self, tmdb_id: int, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            f"/person/{tmdb_id}/combined_credits",
            params={"language": language},
        )
        return response.json()

    async def get_trending(
        self, media_type: str, time_window: str, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            f"/trending/{media_type}/{time_window}",
            params={"language": language, "page": page},
        )
        return response.json()

    # ── Collections ─────────────────────────────────────────────

    async def get_collection(self, tmdb_id: int, language: str = "en-US") -> dict[str, JSONValue]:
        response = await self._get(f"/collection/{tmdb_id}", params={"language": language})
        return response.json()

    # ── Companies / Networks ────────────────────────────────────

    async def get_company(self, tmdb_id: int) -> dict[str, JSONValue]:
        response = await self._get(f"/company/{tmdb_id}")
        return response.json()

    async def get_network(self, tmdb_id: int) -> dict[str, JSONValue]:
        response = await self._get(f"/network/{tmdb_id}")
        return response.json()

    # ── Watch Providers ─────────────────────────────────────────

    async def get_movie_watch_providers(self, tmdb_id: int) -> dict[str, JSONValue]:
        response = await self._get(f"/movie/{tmdb_id}/watch/providers")
        return response.json()

    async def get_show_watch_providers(self, tmdb_id: int) -> dict[str, JSONValue]:
        response = await self._get(f"/tv/{tmdb_id}/watch/providers")
        return response.json()

    # ── Keywords ─────────────────────────────────────────────────

    async def get_keyword(self, tmdb_id: int) -> dict[str, JSONValue]:
        response = await self._get(f"/keyword/{tmdb_id}")
        return response.json()

    # ── Search ──────────────────────────────────────────────────

    async def search_multi(
        self, query: str, page: int = 1, language: str = "en-US"
    ) -> dict[str, JSONValue]:
        response = await self._get(
            "/search/multi",
            params={"query": query, "page": page, "language": language},
        )
        return response.json()

    async def find_by_external_id(
        self, external_id: str, external_source: str = "imdb_id", language: str = "en-US"
    ) -> dict[str, JSONValue]:
        """Find TMDB IDs by external ID (imdb_id, tvdb_id, etc).

        Uses TMDB's ``/find/{external_id}`` endpoint; returns movie_results,
        tv_results, etc. https://developer.themoviedb.org/reference/find-by-id
        """
        response = await self._get(
            f"/find/{external_id}",
            params={"external_source": external_source, "language": language},
        )
        return response.json()

    # ── Configuration ───────────────────────────────────────────

    async def get_configuration(self) -> dict[str, JSONValue]:
        response = await self._get("/configuration")
        return response.json()

    async def discover(
        self,
        media_type: str,
        params: dict[str, str] | None = None,
        language: str = "en-US",
    ) -> dict[str, JSONValue]:
        """Generic discover endpoint for movies or tv.

        Pass sort_by, date filters, etc. via ``params``.
        """
        base_params: dict[str, str] = {"language": language}
        if params:
            base_params.update(params)
        response = await self._get(f"/discover/{media_type}", params=base_params)
        return response.json()

    async def get_genres(
        self, media_type: str = "movie", language: str = "en-US"
    ) -> dict[str, JSONValue]:
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

    # Legacy routed these through a raw ``self._client`` attribute that the
    # legacy BaseProvider never set (a latent AttributeError), bypassing the
    # breaker/limiter. Routing them through the throttled ``_post``/``_request``
    # path is the intended behaviour — writes still consume provider quota.

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
