"""Tests for TMDB client — API request construction and error handling."""

from __future__ import annotations

import httpx
import pytest

from otix.providers.tmdb.client import TMDBProvider


@pytest.fixture
def tmdb_provider(mock_httpx_client: httpx.AsyncClient, fakeredis) -> TMDBProvider:
    return TMDBProvider(redis=fakeredis, http_client=mock_httpx_client)


# ── Construction ────────────────────────────────────────────────────


class TestTMDBProviderConstruction:
    async def test_default_base_url(self, fakeredis):
        provider = TMDBProvider(redis=fakeredis)
        assert provider.BASE_URL == "https://api.themoviedb.org/3"
        assert provider.name == "tmdb"
        assert str(provider.http.base_url).rstrip("/") == "https://api.themoviedb.org/3"
        await provider.http.aclose()

    def test_custom_http_client(self, mock_httpx_client: httpx.AsyncClient, fakeredis):
        provider = TMDBProvider(redis=fakeredis, http_client=mock_httpx_client)
        assert provider.http is mock_httpx_client


# ── Movie endpoints ─────────────────────────────────────────────────


class TestMovieEndpoints:
    async def test_get_movie_returns_data(self, tmdb_provider: TMDBProvider):
        data = await tmdb_provider.get_movie(550)
        assert data["id"] == 550
        assert data["title"] == "Fight Club"
        assert "credits" in data
        assert "images" in data
        assert "external_ids" in data

    async def test_get_movie_with_language(self, tmdb_provider: TMDBProvider):
        data = await tmdb_provider.get_movie(550, language="pt-PT")
        assert data["title"] == "Fight Club"

    async def test_get_movie_popular_returns_page(self, tmdb_provider: TMDBProvider):
        data = await tmdb_provider.get_movie_popular(page=1)
        assert "results" in data
        assert len(data["results"]) == 2

    async def test_get_movie_changes_returns_data(self, tmdb_provider: TMDBProvider, mock_httpx_client):
        # Override the transport to return changes data
        import json
        from unittest.mock import MagicMock

        class ChangesTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
                return httpx.Response(
                    200,
                    content=json.dumps({"results": [{"id": 550, "adult": False}], "page": 1, "total_pages": 1}).encode(),
                    request=request,
                )

        tmdb_provider.http = httpx.AsyncClient(transport=ChangesTransport(), base_url="https://api.themoviedb.org/3")
        data = await tmdb_provider.get_movie_changes("2024-01-01", "2024-01-02")
        assert "results" in data


# ── Show endpoints ──────────────────────────────────────────────────


class TestShowEndpoints:
    async def test_get_show_returns_data(self, tmdb_provider: TMDBProvider):
        data = await tmdb_provider.get_show(1399)
        assert data["id"] == 1399
        assert data["name"] == "Game of Thrones"
        assert "credits" in data
        assert "seasons" in data

    async def test_get_season(self, tmdb_provider: TMDBProvider):
        # We need to add a season endpoint response to the mock
        import json
        from unittest.mock import MagicMock

        class SeasonTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
                return httpx.Response(
                    200,
                    content=json.dumps({
                        "id": 3624,
                        "season_number": 1,
                        "name": "Season 1",
                        "episodes": [{"episode_number": 1, "name": "Winter Is Coming"}],
                    }).encode(),
                    request=request,
                )

        tmdb_provider.http = httpx.AsyncClient(transport=SeasonTransport(), base_url="https://api.themoviedb.org/3")
        data = await tmdb_provider.get_season(1399, 1)
        assert data["season_number"] == 1
        assert len(data["episodes"]) == 1

    async def test_get_show_popular_returns_page(self, tmdb_provider: TMDBProvider):
        data = await tmdb_provider.get_show_popular(page=1)
        assert "results" in data
        assert len(data["results"]) == 1


# ── People, Collections, Search ─────────────────────────────────────


class TestOtherEndpoints:
    async def test_get_person(self, tmdb_provider: TMDBProvider):
        import json
        from unittest.mock import MagicMock

        class PersonTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
                return httpx.Response(
                    200,
                    content=json.dumps({"id": 819, "name": "Edward Norton", "external_ids": {}, "images": {"profiles": []}}).encode(),
                    request=request,
                )

        tmdb_provider.http = httpx.AsyncClient(transport=PersonTransport(), base_url="https://api.themoviedb.org/3")
        data = await tmdb_provider.get_person(819)
        assert data["name"] == "Edward Norton"

    async def test_get_collection(self, tmdb_provider: TMDBProvider):
        import json
        from unittest.mock import MagicMock

        class CollTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
                return httpx.Response(
                    200,
                    content=json.dumps({"id": 123, "name": "Fight Club Collection", "parts": []}).encode(),
                    request=request,
                )

        tmdb_provider.http = httpx.AsyncClient(transport=CollTransport(), base_url="https://api.themoviedb.org/3")
        data = await tmdb_provider.get_collection(123)
        assert data["name"] == "Fight Club Collection"

    async def test_search_multi(self, tmdb_provider: TMDBProvider):
        import json
        from unittest.mock import MagicMock

        class SearchTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
                return httpx.Response(
                    200,
                    content=json.dumps({"results": [{"id": 550, "title": "Fight Club", "media_type": "movie"}], "page": 1}).encode(),
                    request=request,
                )

        tmdb_provider.http = httpx.AsyncClient(transport=SearchTransport(), base_url="https://api.themoviedb.org/3")
        data = await tmdb_provider.search_multi("Fight Club")
        assert len(data["results"]) == 1
        assert data["results"][0]["media_type"] == "movie"

    async def test_get_configuration(self, tmdb_provider: TMDBProvider):
        data = await tmdb_provider.get_configuration()
        assert "images" in data

    async def test_get_genres(self, tmdb_provider: TMDBProvider):
        data = await tmdb_provider.get_genres("movie")
        assert "genres" in data
        assert len(data["genres"]) == 1


# ── Rate limiting / error handling ──────────────────────────────────


class TestRateLimitHandling:
    async def test_429_triggers_rate_limit_error(self, mock_httpx_client_429: httpx.AsyncClient, fakeredis):
        from otix.providers.base import RateLimitError

        provider = TMDBProvider(redis=fakeredis, http_client=mock_httpx_client_429)

        with pytest.raises(RateLimitError):
            await provider.get_movie(550)
