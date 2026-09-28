"""Unit tests for TMDBProvider client using create_mock_transport.

Asserts HTTP request paths, methods, query parameters, headers, and bodies
issued by TMDBProvider methods without external network calls.
"""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import urlparse

import httpx
from django.conf import settings
from django.test import SimpleTestCase, override_settings

from core.providers.framework import (
    BaseProviderClient,
    create_mock_transport,
)
from core.providers.framework.cache import ApiCache
from core.providers.framework.testing import FakeAsyncRedis
from core.providers.tmdb import (
    TMDBProvider,
    close_http_client,
    get_http_client,
)
from core.providers.tmdb import client as tmdb_client_module


def _run(coro: Any) -> Any:
    return asyncio.run(coro)


class TMDBClientTests(SimpleTestCase):
    """Unit test suite for TMDBProvider client methods."""

    API_BASE_PATH = urlparse(TMDBProvider.BASE_URL).path

    def _full_path(self, path: str) -> str:
        return f"{self.API_BASE_PATH}{path}"

    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        cls._orig_cache = BaseProviderClient._api_cache
        BaseProviderClient._api_cache = ApiCache(enabled=False)

    @classmethod
    def tearDownClass(cls) -> None:
        BaseProviderClient._api_cache = cls._orig_cache
        super().tearDownClass()

    def _make_provider(
        self,
        mapping: dict[tuple[str, str], tuple[int, Any]],
    ) -> tuple[TMDBProvider, FakeAsyncRedis, list[httpx.Request]]:
        fake_redis = FakeAsyncRedis()
        recorded_requests: list[httpx.Request] = []

        base_transport = create_mock_transport(mapping)

        def recording_handler(request: httpx.Request) -> httpx.Response:
            recorded_requests.append(request)
            return base_transport.handle_request(request)

        client = httpx.AsyncClient(
            transport=httpx.MockTransport(handler=recording_handler),
            base_url=TMDBProvider.BASE_URL,
        )
        provider = TMDBProvider(redis=fake_redis, http_client=client)
        return provider, fake_redis, recorded_requests

    def test_provider_initialization_defaults(self) -> None:
        provider, _, _ = self._make_provider({})
        self.assertEqual(provider.name, "tmdb")
        self.assertEqual(TMDBProvider.BASE_URL, "https://api.themoviedb.org/3")
        self.assertEqual(provider.rate_limiter.default_rate, settings.TMDB_GLOBAL_RPS_LIMIT)
        self.assertEqual(provider.rate_limiter.default_burst, settings.TMDB_GLOBAL_RPS_LIMIT)

    def test_get_movie(self) -> None:
        async def run() -> None:
            mapping = {("GET", "/3/movie/550"): (200, {"id": 550, "title": "Fight Club"})}
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                data = await provider.get_movie(550, language="en-US")
                self.assertEqual(data["id"], 550)
                self.assertEqual(len(calls), 1)
                req = calls[0]
                self.assertEqual(req.method, "GET")
                self.assertEqual(req.url.path, "/3/movie/550")
                self.assertEqual(req.url.params.get("language"), "en-US")
                self.assertIn("credits", req.url.params.get("append_to_response", ""))

        _run(run())

    def test_get_show(self) -> None:
        async def run() -> None:
            mapping = {("GET", "/3/tv/1399"): (200, {"id": 1399, "name": "Game of Thrones"})}
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                data = await provider.get_show(1399, language="en-US")
                self.assertEqual(data["id"], 1399)
                self.assertEqual(len(calls), 1)
                req = calls[0]
                self.assertEqual(req.method, "GET")
                self.assertEqual(req.url.path, "/3/tv/1399")
                self.assertIn("seasons", req.url.params.get("append_to_response", ""))

        _run(run())

    def test_get_season(self) -> None:
        async def run() -> None:
            mapping = {("GET", "/3/tv/1399/season/1"): (200, {"season_number": 1, "episodes": []})}
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                data = await provider.get_season(1399, 1)
                self.assertEqual(data["season_number"], 1)
                self.assertEqual(calls[0].url.path, "/3/tv/1399/season/1")

        _run(run())

    def test_get_person(self) -> None:
        async def run() -> None:
            mapping = {("GET", "/3/person/819"): (200, {"id": 819, "name": "Edward Norton"})}
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                data = await provider.get_person(819)
                self.assertEqual(data["id"], 819)
                self.assertEqual(calls[0].url.path, "/3/person/819")

        _run(run())

    def test_get_company(self) -> None:
        async def run() -> None:
            mapping = {("GET", "/3/company/508"): (200, {"id": 508, "name": "Regency"})}
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                data = await provider.get_company(508)
                self.assertEqual(data["name"], "Regency")
                self.assertEqual(calls[0].url.path, "/3/company/508")

        _run(run())

    def test_get_network(self) -> None:
        async def run() -> None:
            mapping = {("GET", "/3/network/49"): (200, {"id": 49, "name": "HBO"})}
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                data = await provider.get_network(49)
                self.assertEqual(data["name"], "HBO")
                self.assertEqual(calls[0].url.path, "/3/network/49")

        _run(run())

    def test_get_collection(self) -> None:
        async def run() -> None:
            mapping = {("GET", "/3/collection/10"): (200, {"id": 10, "name": "Star Wars"})}
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                data = await provider.get_collection(10)
                self.assertEqual(data["id"], 10)
                self.assertEqual(calls[0].url.path, "/3/collection/10")

        _run(run())

    def test_get_watch_providers(self) -> None:
        async def run() -> None:
            mapping = {
                ("GET", "/3/movie/550/watch/providers"): (200, {"results": {}}),
                ("GET", "/3/tv/1399/watch/providers"): (200, {"results": {}}),
            }
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                m = await provider.get_watch_providers("movie", 550)
                t = await provider.get_watch_providers("show", 1399)
                self.assertEqual(m, {"results": {}})
                self.assertEqual(t, {"results": {}})
                self.assertEqual(calls[0].url.path, "/3/movie/550/watch/providers")
                self.assertEqual(calls[1].url.path, "/3/tv/1399/watch/providers")

        _run(run())

    def test_search_multi(self) -> None:
        async def run() -> None:
            mapping = {("GET", "/3/search/multi"): (200, {"results": []})}
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                data = await provider.search_multi("fight", page=2)
                self.assertEqual(data, {"results": []})
                req = calls[0]
                self.assertEqual(req.url.path, "/3/search/multi")
                self.assertEqual(req.url.params.get("query"), "fight")
                self.assertEqual(req.url.params.get("page"), "2")

        _run(run())

    def test_search_movies(self) -> None:
        async def run() -> None:
            mapping = {("GET", "/3/search/movie"): (200, {"results": []})}
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                await provider.search_movies("inception", year=2010)
                req = calls[0]
                self.assertEqual(req.url.path, "/3/search/movie")
                self.assertEqual(req.url.params.get("query"), "inception")
                self.assertEqual(req.url.params.get("year"), "2010")

        _run(run())

    def test_search_shows(self) -> None:
        async def run() -> None:
            mapping = {("GET", "/3/search/tv"): (200, {"results": []})}
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                await provider.search_shows("breaking", first_air_date_year=2008)
                req = calls[0]
                self.assertEqual(req.url.path, "/3/search/tv")
                self.assertEqual(req.url.params.get("query"), "breaking")
                self.assertEqual(req.url.params.get("first_air_date_year"), "2008")

        _run(run())

    def test_search_people(self) -> None:
        async def run() -> None:
            mapping = {("GET", "/3/search/person"): (200, {"results": []})}
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                await provider.search_people("norton")
                self.assertEqual(calls[0].url.path, "/3/search/person")
                self.assertEqual(calls[0].url.params.get("query"), "norton")

        _run(run())

    def test_search_companies(self) -> None:
        async def run() -> None:
            mapping = {("GET", "/3/search/company"): (200, {"results": []})}
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                await provider.search_companies("regency")
                self.assertEqual(calls[0].url.path, "/3/search/company")
                self.assertEqual(calls[0].url.params.get("query"), "regency")

        _run(run())

    def test_discover_movies_and_shows(self) -> None:
        async def run() -> None:
            mapping = {
                ("GET", "/3/discover/movie"): (200, {"results": []}),
                ("GET", "/3/discover/tv"): (200, {"results": []}),
            }
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                await provider.discover_movies({"sort_by": "popularity.desc"}, page=3)
                await provider.discover_shows({"with_networks": "49"})
                self.assertEqual(calls[0].url.path, "/3/discover/movie")
                self.assertEqual(calls[0].url.params.get("sort_by"), "popularity.desc")
                self.assertEqual(calls[0].url.params.get("page"), "3")
                self.assertEqual(calls[1].url.path, "/3/discover/tv")
                self.assertEqual(calls[1].url.params.get("with_networks"), "49")

        _run(run())

    def test_trending(self) -> None:
        async def run() -> None:
            mapping = {("GET", "/3/trending/movie/week"): (200, {"results": []})}
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                await provider.trending(media_type="movie", time_window="week", page=1)
                self.assertEqual(calls[0].url.path, "/3/trending/movie/week")

        _run(run())

    def test_changes(self) -> None:
        async def run() -> None:
            mapping = {
                ("GET", "/3/movie/changes"): (200, {"results": []}),
                ("GET", "/3/tv/changes"): (200, {"results": []}),
            }
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                await provider.changes("movie", "2024-01-01", "2024-01-02")
                await provider.changes("show", "2024-01-01", "2024-01-02")
                self.assertEqual(calls[0].url.path, "/3/movie/changes")
                self.assertEqual(calls[1].url.path, "/3/tv/changes")

        _run(run())

    def test_write_endpoints(self) -> None:
        async def run() -> None:
            mapping = {
                ("POST", "/3/movie/550/rating"): (200, {"success": True}),
                ("POST", "/3/tv/1399/rating"): (200, {"success": True}),
                ("DELETE", "/3/movie/550/rating"): (200, {"success": True}),
                ("DELETE", "/3/tv/1399/rating"): (200, {"success": True}),
                ("POST", "/3/account/1/watchlist"): (200, {"success": True}),
            }
            provider, _, calls = self._make_provider(mapping)
            async with provider.http:
                res1 = await provider.rate_movie(550, 9.0, "sess123")
                res2 = await provider.rate_tv(1399, 8.5, "sess123")
                res3 = await provider.delete_movie_rating(550, "sess123")
                res4 = await provider.delete_tv_rating(1399, "sess123")
                res5 = await provider.add_to_watchlist(1, "sess123", "movie", 550)

                self.assertTrue(res1["success"])
                self.assertTrue(res2["success"])
                self.assertTrue(res3["success"])
                self.assertTrue(res4["success"])
                self.assertTrue(res5["success"])

                self.assertEqual(calls[0].method, "POST")
                self.assertEqual(calls[0].url.path, "/3/movie/550/rating")
                self.assertEqual(calls[2].method, "DELETE")
                self.assertEqual(calls[2].url.path, "/3/movie/550/rating")

        _run(run())

    def test_http_client_factory_and_close(self) -> None:
        client = get_http_client()
        try:
            self.assertEqual(client.base_url, httpx.URL(f"{TMDBProvider.BASE_URL}/"))
            self.assertEqual(client.headers["Accept"], "application/json")
        finally:
            _run(close_http_client())
            self.assertIsNone(tmdb_client_module._shared_client)
            self.assertIsNone(tmdb_client_module._shared_client_loop_id)

    @override_settings(TMDB_RAT="custom-token", TMDB_REQUEST_TIMEOUT_SECONDS=15.0)
    def test_http_client_reads_settings(self) -> None:
        client = get_http_client()
        try:
            self.assertEqual(client.headers["Authorization"], "Bearer custom-token")
            self.assertEqual(client.timeout.read, 15.0)
        finally:
            _run(close_http_client())
