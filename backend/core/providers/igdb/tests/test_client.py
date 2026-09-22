"""Unit tests for the IGDB provider client using create_mock_transport."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
from django.conf import settings
from django.test import SimpleTestCase

from core.providers.framework import (
    ProviderCapability,
    RateLimitError,
    create_mock_transport,
    registry,
)
from core.providers.framework.testing import FakeAsyncRedis
from core.providers.igdb import (
    TOKEN_KEY,
    IGDBAuthError,
    IGDBError,
    IGDBProvider,
    close_http_client,
    get_http_client,
    manifest,
)

OAUTH_URI = "https://id.twitch.tv/oauth2/token"


def _run(coro: Any) -> Any:
    return asyncio.run(coro)


class IGDBManifestAndRegistryTests(SimpleTestCase):
    """Verify manifest declarations and global registry integration."""

    def test_manifest_metadata_and_capabilities(self) -> None:
        self.assertEqual(manifest.id, "igdb")
        self.assertEqual(manifest.name, "Internet Game Database")
        self.assertTrue(manifest.has_capability(ProviderCapability.METADATA))
        self.assertTrue(manifest.has_capability(ProviderCapability.ARTWORK))
        self.assertFalse(manifest.has_capability(ProviderCapability.DOWNLOAD))
        self.assertTrue(manifest.supports_media_type("game"))
        self.assertFalse(manifest.supports_media_type("movie"))

    def test_registered_in_framework_registry(self) -> None:
        reg_manifest = registry.get("igdb")
        self.assertIsNotNone(reg_manifest)
        self.assertEqual(reg_manifest, manifest)
        client_cls = registry.get_client_class("igdb")
        self.assertIs(client_cls, IGDBProvider)


class IGDBClientTests(SimpleTestCase):
    """Unit tests for IGDBProvider operations using mock transports."""

    def _build_client_and_provider(
        self,
        routes: dict[tuple[str, str], tuple[int, Any]],
        *,
        seed_token: str | None = "seeded-test-token",
        rps_limit: float = 10.0,
    ) -> tuple[IGDBProvider, FakeAsyncRedis, list[httpx.Request]]:
        fake_redis = FakeAsyncRedis()
        if seed_token:
            fake_redis.storage[TOKEN_KEY] = seed_token

        recorded_requests: list[httpx.Request] = []

        mock_transport = create_mock_transport(routes)

        # Wrap transport to record dispatched requests
        class RecordingTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
                recorded_requests.append(request)
                return await mock_transport.handle_async_request(request)

        client = httpx.AsyncClient(
            transport=RecordingTransport(),
            base_url="https://api.igdb.com/v4",
        )
        provider = IGDBProvider(redis=fake_redis, http_client=client)
        return provider, fake_redis, recorded_requests

    # ── Auth & Headers ────────────────────────────────────────────────

    def test_request_headers_include_client_id_and_token(self) -> None:
        routes = {
            ("POST", "/v4/games"): (200, [{"id": 1942, "name": "The Witcher 3"}]),
        }
        provider, _, requests = self._build_client_and_provider(routes, seed_token="abc-123")

        async def run() -> None:
            async with provider.http:
                game = await provider.get_game(1942)
                self.assertIsNotNone(game)
                self.assertEqual(game["name"], "The Witcher 3")

        _run(run())
        self.assertEqual(len(requests), 1)
        req = requests[0]
        self.assertEqual(req.headers["Authorization"], "Bearer abc-123")
        self.assertEqual(req.headers["Client-ID"], getattr(settings, "IGDB_CLIENT_ID", ""))

    def test_oauth_fetch_and_redis_caching(self) -> None:
        routes = {
            ("POST", "/oauth2/token"): (
                200,
                {"access_token": "fresh-token-xyz", "expires_in": 3600},
            ),
            ("POST", "/v4/games"): (200, [{"id": 1942, "name": "The Witcher 3"}]),
        }
        provider, fake_redis, requests = self._build_client_and_provider(routes, seed_token=None)

        async def run() -> None:
            async with provider.http:
                await provider.get_game(1942)
                await provider.get_games([1942])

        _run(run())
        # First request hit Twitch OAuth, then both game queries used cached token
        self.assertEqual(fake_redis.storage.get(TOKEN_KEY), "fresh-token-xyz")
        # 1 OAuth request + 2 games requests = 3 requests
        self.assertEqual(len(requests), 3)
        self.assertEqual(requests[0].url.path, "/oauth2/token")
        self.assertEqual(requests[1].headers["Authorization"], "Bearer fresh-token-xyz")
        self.assertEqual(requests[2].headers["Authorization"], "Bearer fresh-token-xyz")

    def test_oauth_failure_raises_igdb_auth_error(self) -> None:
        routes = {
            ("POST", "/oauth2/token"): (401, {"message": "Invalid client secret"}),
        }
        provider, _, _ = self._build_client_and_provider(routes, seed_token=None)

        async def run() -> None:
            async with provider.http:
                with self.assertRaises(IGDBAuthError):
                    await provider.get_game(1942)

        _run(run())

    def test_401_triggers_token_invalidation_and_single_retry(self) -> None:
        calls = {"games": 0, "oauth": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/oauth2/token":
                calls["oauth"] += 1
                return httpx.Response(200, json={"access_token": f"token-{calls['oauth']}"})
            if request.url.path == "/v4/games":
                calls["games"] += 1
                if calls["games"] == 1:
                    return httpx.Response(401, json={"message": "Token expired"})
                return httpx.Response(200, json=[{"id": 100, "name": "Halo"}])
            return httpx.Response(404)

        fake_redis = FakeAsyncRedis()
        fake_redis.storage[TOKEN_KEY] = "expired-token"
        client = httpx.AsyncClient(
            transport=httpx.MockTransport(handler=handler),
            base_url="https://api.igdb.com/v4",
        )
        provider = IGDBProvider(redis=fake_redis, http_client=client)

        async def run() -> None:
            async with provider.http:
                res = await provider.get_game(100)
                self.assertEqual(res, {"id": 100, "name": "Halo"})

        _run(run())
        self.assertEqual(calls["games"], 2)
        self.assertEqual(calls["oauth"], 1)
        self.assertEqual(fake_redis.storage.get(TOKEN_KEY), "token-1")

    # ── Game Endpoints & DSL ──────────────────────────────────────────

    def test_get_games_and_get_game(self) -> None:
        routes = {
            ("POST", "/v4/games"): (
                200,
                [{"id": 1, "name": "Game 1"}, {"id": 2, "name": "Game 2"}],
            ),
        }
        provider, _, requests = self._build_client_and_provider(routes)

        async def run() -> None:
            async with provider.http:
                empty = await provider.get_games([])
                self.assertEqual(empty, [])

                games = await provider.get_games([1, 2], fields="id,name")
                self.assertEqual(len(games), 2)

                single = await provider.get_game(1)
                self.assertEqual(single, {"id": 1, "name": "Game 1"})

        _run(run())
        # First call was empty (0 requests), second was get_games, third was get_game
        self.assertEqual(len(requests), 2)
        self.assertIn(b"fields id,name; where id = (1,2); limit 2;", requests[0].content)

    def test_get_popular_and_recent_games(self) -> None:
        routes = {
            ("POST", "/v4/games"): (200, [{"id": 42, "name": "Elden Ring"}]),
        }
        provider, _, requests = self._build_client_and_provider(routes)

        async def run() -> None:
            async with provider.http:
                pop = await provider.get_popular_games(limit=10)
                self.assertEqual(len(pop), 1)

                recent = await provider.get_recently_released_games(limit=15, days=180)
                self.assertEqual(len(recent), 1)

        _run(run())
        self.assertIn(b"sort aggregated_rating desc;", requests[0].content)
        self.assertIn(b"limit 10;", requests[0].content)
        self.assertIn(b"sort first_release_date desc;", requests[1].content)
        self.assertIn(b"limit 15;", requests[1].content)

    def test_get_upcoming_and_platform_games(self) -> None:
        routes = {
            ("POST", "/v4/games"): (200, [{"id": 99, "name": "Metroid Prime 4"}]),
        }
        provider, _, requests = self._build_client_and_provider(routes)

        async def run() -> None:
            async with provider.http:
                upcoming = await provider.get_upcoming_games(limit=5)
                self.assertEqual(len(upcoming), 1)

                plat = await provider.get_games_for_platform(130, limit=20)
                self.assertEqual(len(plat), 1)

        _run(run())
        self.assertIn(b"where first_release_date >", requests[0].content)
        self.assertIn(b"platforms = (130)", requests[1].content)

    def test_get_franchise_and_changed_games(self) -> None:
        routes = {
            ("POST", "/v4/franchises"): (200, [{"id": 11, "name": "Mario"}]),
            ("POST", "/v4/games"): (200, [{"id": 101, "updated_at": 1700000000}]),
        }
        provider, _, requests = self._build_client_and_provider(routes)

        async def run() -> None:
            async with provider.http:
                franchise = await provider.get_franchise(11)
                self.assertEqual(franchise, {"id": 11, "name": "Mario"})

                changes = await provider.get_changed_game_ids(1700000000, limit=50)
                self.assertEqual(len(changes), 1)

        _run(run())
        self.assertIn(b"where id = 11; limit 1;", requests[0].content)
        self.assertIn(b"where updated_at >= 1700000000; limit 50;", requests[1].content)

    # ── Search & Redis Caching ────────────────────────────────────────

    def test_search_games_relevance_caching(self) -> None:
        routes = {
            ("POST", "/v4/games"): (200, [{"id": 300, "name": "Final Fantasy"}]),
        }
        provider, fake_redis, requests = self._build_client_and_provider(routes)

        async def run() -> None:
            async with provider.http:
                first = await provider.search_games("Final Fantasy", limit=10)
                second = await provider.search_games("Final Fantasy", limit=10)
                self.assertEqual(first, second)

        _run(run())
        # Only 1 HTTP request made; second was served from Redis
        self.assertEqual(len(requests), 1)
        self.assertIn(b'search "Final Fantasy";', requests[0].content)

    def test_search_games_by_name(self) -> None:
        routes = {
            ("POST", "/v4/games"): (200, [{"id": 301, "name": 'God of "War"'}]),
        }
        provider, _, requests = self._build_client_and_provider(routes)

        async def run() -> None:
            async with provider.http:
                results = await provider.search_games_by_name('God of "War"', limit=5)
                self.assertEqual(len(results), 1)

        _run(run())
        self.assertIn(b'where name ~ *"God of \\"War\\""*;', requests[0].content)

    # ── Characters & Companies ────────────────────────────────────────

    def test_get_character_and_characters(self) -> None:
        routes = {
            ("POST", "/v4/characters"): (200, [{"id": 501, "name": "Geralt"}]),
        }
        provider, _, requests = self._build_client_and_provider(routes)

        async def run() -> None:
            async with provider.http:
                char = await provider.get_character(501)
                self.assertEqual(char, {"id": 501, "name": "Geralt"})

                chars = await provider.get_characters([501, 502])
                self.assertEqual(len(chars), 1)

                game_chars = await provider.get_game_characters(1942)
                self.assertEqual(len(game_chars), 1)

        _run(run())
        self.assertEqual(len(requests), 3)
        self.assertIn(b"where id = (501); limit 1;", requests[0].content)
        self.assertIn(b"where id = (501,502); limit 2;", requests[1].content)
        self.assertIn(b"where games = (1942); limit 50;", requests[2].content)

    def test_get_company_and_search_companies(self) -> None:
        routes = {
            ("POST", "/v4/companies"): (200, [{"id": 1104, "name": "CD Projekt"}]),
        }
        provider, fake_redis, requests = self._build_client_and_provider(routes)

        async def run() -> None:
            async with provider.http:
                comp = await provider.get_company(1104)
                self.assertEqual(comp, {"id": 1104, "name": "CD Projekt"})

                search_res = await provider.search_companies("CD Projekt", limit=5)
                self.assertEqual(len(search_res), 1)

        _run(run())
        self.assertEqual(len(requests), 2)
        self.assertIn(b"where id = (1104); limit 1;", requests[0].content)
        self.assertIn(b'search "CD Projekt";', requests[1].content)

    # ── Covers, Screenshots, Artworks, Videos ─────────────────────────

    def test_media_assets_and_videos_queries(self) -> None:
        routes = {
            ("POST", "/v4/covers"): (200, [{"id": 10, "image_id": "cov123"}]),
            ("POST", "/v4/screenshots"): (200, [{"id": 20, "image_id": "sc123"}]),
            ("POST", "/v4/artworks"): (200, [{"id": 30, "image_id": "art123"}]),
            ("POST", "/v4/game_videos"): (200, [{"id": 40, "video_id": "vid123"}]),
            ("POST", "/v4/involved_companies"): (200, [{"id": 50, "company": 1104}]),
            ("POST", "/v4/age_ratings"): (
                200,
                [{"id": 60, "organization": 1, "rating_category": 6}],
            ),
        }
        provider, _, requests = self._build_client_and_provider(routes)

        async def run() -> None:
            async with provider.http:
                cover = await provider.get_cover(10)
                self.assertEqual(cover, {"id": 10, "image_id": "cov123"})

                covers = await provider.get_covers(1942)
                self.assertEqual(len(covers), 1)

                screens = await provider.get_screenshots(1942)
                self.assertEqual(len(screens), 1)

                artworks = await provider.get_artworks(1942)
                self.assertEqual(len(artworks), 1)

                vids = await provider.get_videos(1942)
                self.assertEqual(len(vids), 1)

                involved = await provider.get_involved_companies(1942)
                self.assertEqual(len(involved), 1)

                ratings = await provider.get_age_ratings([60])
                self.assertEqual(len(ratings), 1)

        _run(run())
        self.assertEqual(len(requests), 7)

    # ── External Games Mapping ─────────────────────────────────────────

    def test_lookup_external_game_ids_and_store_helpers(self) -> None:
        routes = {
            ("POST", "/v4/external_games"): (
                200,
                [
                    {"uid": "292030", "game": 1942},
                    {"uid": "1207664643", "game": 1942},
                ],
            ),
        }
        provider, _, requests = self._build_client_and_provider(routes)

        async def run() -> None:
            async with provider.http:
                steam_map = await provider.lookup_steam_app_ids([292030])
                self.assertEqual(steam_map.get(292030), 1942)

                epic_map = await provider.lookup_epic_ids(["epic_game_1"])
                self.assertEqual(epic_map, {"292030": 1942, "1207664643": 1942})

                gog_map = await provider.lookup_gog_ids([1207664643])
                self.assertEqual(gog_map, {292030: 1942, 1207664643: 1942})

        _run(run())
        self.assertIn(b"external_game_source = 1", requests[0].content)
        self.assertIn(b"external_game_source = 26", requests[1].content)
        self.assertIn(b"external_game_source = 5", requests[2].content)

    # ── Error & Rate Limiting ─────────────────────────────────────────

    def test_error_handling_and_rate_limiting(self) -> None:
        routes = {
            ("POST", "/v4/games"): (400, {"error": "Invalid syntax"}),
        }
        provider, _, _ = self._build_client_and_provider(routes)

        async def run_400() -> None:
            async with provider.http:
                with self.assertRaises(IGDBError):
                    await provider.get_games([1])

        _run(run_400())

        # Test 429 rate limit
        routes_429 = {
            ("POST", "/v4/games"): (429, {"Retry-After": "5"}),
        }
        provider_429, _, _ = self._build_client_and_provider(routes_429)

        async def run_429() -> None:
            async with provider_429.http:
                with self.assertRaises(RateLimitError) as ctx:
                    await provider_429.get_games([1])
            self.assertEqual(ctx.exception.retry_after, 0)

        _run(run_429())


class IGDBSharedHttpClientTests(SimpleTestCase):
    """Verify lifecycle of the process-shared HTTP client."""

    def test_get_and_close_http_client(self) -> None:
        client = get_http_client()
        self.assertIsNotNone(client)
        self.assertEqual(client.base_url, httpx.URL("https://api.igdb.com/v4/"))
        self.assertFalse(client.is_closed)

        _run(close_http_client())
        self.assertTrue(client.is_closed)
