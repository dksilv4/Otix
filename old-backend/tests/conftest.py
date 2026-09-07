"""Shared test fixtures.

Tiers:
  1. Pure data fixtures — no infrastructure needed
  2. Mocked HTTP — httpx responses canned for provider tests
  3. Mocked DB — AsyncMock for hydrator tests
  4. Real DB + Redis — integration tests (gated behind @pytest.mark.integration)
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

# ═══════════════════════════════════════════════════════════════════════════════
# Tier 1: Pure data fixtures (no infrastructure)
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture
def sample_movie_raw() -> dict:
    return {
        "id": 550,
        "title": "Fight Club",
        "overview": "A ticking-time-bomb insomniac...",
        "tagline": "Mischief. Mayhem. Soap.",
        "poster_path": "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
        "backdrop_path": "/hZkgoQYus5Mf5wHWyF8bGQ3zVKg.jpg",
        "release_date": "1999-10-15",
        "popularity": 73.0,
        "original_language": "en",
        "runtime": 139,
        "budget": 63000000,
        "revenue": 100853753,
        "vote_average": 8.4,
        "vote_count": 27000,
        "belongs_to_collection": None,
        "genres": [
            {"id": 18, "name": "Drama"},
        ],
        "credits": {
            "cast": [
                {"id": 819, "name": "Edward Norton", "character": "The Narrator", "order": 0, "profile_path": "/edward.jpg"},
                {"id": 287, "name": "Brad Pitt", "character": "Tyler Durden", "order": 1, "profile_path": "/brad.jpg"},
            ],
            "crew": [
                {"id": 7467, "name": "David Fincher", "job": "Director", "order": 0, "profile_path": "/fincher.jpg"},
            ],
        },
        "images": {
            "posters": [
                {"file_path": "/poster1.jpg", "width": 2000, "height": 3000},
            ],
            "backdrops": [
                {"file_path": "/bd1.jpg", "width": 3840, "height": 2160},
            ],
        },
        "external_ids": {
            "id": 550,
            "imdb_id": "tt0137523",
            "tvdb_id": None,
        },
        "videos": {"results": []},
        "release_dates": {"results": []},
        "keywords": {"keywords": []},
    }


@pytest.fixture
def sample_movie_raw_with_collection(sample_movie_raw: dict) -> dict:
    data = {**sample_movie_raw}
    data["belongs_to_collection"] = {
        "id": 123,
        "name": "Fight Club Collection",
        "poster_path": "/coll.jpg",
        "backdrop_path": "/coll_bd.jpg",
    }
    return data


@pytest.fixture
def sample_show_raw() -> dict:
    return {
        "id": 1399,
        "name": "Game of Thrones",
        "overview": "Seven noble families fight for control...",
        "poster_path": "/gwPSoYUHAKmdyVywgLpKKA4oNn.jpg",
        "backdrop_path": "/zMkCXEpAGr3qA5HfL7nmQeGK4.jpg",
        "first_air_date": "2011-04-17",
        "last_air_date": "2019-05-19",
        "popularity": 450.0,
        "original_language": "en",
        "status": "Ended",
        "number_of_seasons": 8,
        "number_of_episodes": 73,
        "vote_average": 8.4,
        "vote_count": 22000,
        "genres": [
            {"id": 18, "name": "Drama"},
            {"id": 10765, "name": "Sci-Fi & Fantasy"},
        ],
        "seasons": [
            {
                "season_number": 1,
                "name": "Season 1",
                "overview": "The first season...",
                "poster_path": "/s1.jpg",
                "episodes": [
                    {"episode_number": 1, "name": "Winter Is Coming", "overview": "...", "runtime": 62, "air_date": "2011-04-17"},
                    {"episode_number": 2, "name": "The Kingsroad", "overview": "...", "runtime": 56, "air_date": "2011-04-24"},
                ],
            },
            {"season_number": 0, "name": "Specials", "overview": "...", "poster_path": None, "episodes": []},
        ],
        "credits": {
            "cast": [
                {"id": 17286, "name": "Peter Dinklage", "character": "Tyrion Lannister", "order": 0, "profile_path": "/peter.jpg"},
            ],
            "crew": [],
        },
        "images": {
            "posters": [{"file_path": "/got_poster.jpg", "width": 2000, "height": 3000}],
            "backdrops": [],
        },
        "external_ids": {
            "id": 1399,
            "imdb_id": "tt0944947",
            "tvdb_id": 121361,
        },
        "videos": {"results": []},
    }


@pytest.fixture
def sample_collection_raw() -> dict:
    return {
        "id": 123,
        "name": "Fight Club Collection",
        "overview": "A collection of Fight Club movies",
        "poster_path": "/coll.jpg",
        "backdrop_path": "/coll_bd.jpg",
    }


@pytest.fixture
def sample_person_raw() -> dict:
    return {
        "id": 287,
        "name": "Brad Pitt",
        "biography": "William Bradley Pitt is an American actor and film producer.",
        "birthday": "1963-12-18",
        "deathday": None,
        "place_of_birth": "Shawnee, Oklahoma, USA",
        "profile_path": "/brad.jpg",
        "popularity": 25.0,
        "imdb_id": "nm0000093",
        "images": {
            "profiles": [
                {"file_path": "/brad1.jpg", "width": 1000, "height": 1500},
                {"file_path": "/brad2.jpg", "width": 800, "height": 1200},
            ]
        },
        "external_ids": {
            "id": 287,
            "imdb_id": "nm0000093",
            "tvdb_id": None,
        },
    }


@pytest.fixture
def sample_person_combined_credits() -> dict:
    return {
        "id": 287,
        "cast": [
            {"id": 550, "media_type": "movie", "title": "Fight Club", "character": "Tyler Durden"},
            {"id": 680, "media_type": "movie", "title": "Pulp Fiction", "character": "Vincent Vega"},
            {"id": 1399, "media_type": "tv", "title": "Game of Thrones", "character": "Guest"},
        ],
        "crew": [
            {"id": 550, "media_type": "movie", "title": "Fight Club", "job": "Producer"},
            {"id": 888, "media_type": "movie", "title": "Other Movie", "job": "Director"},
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Tier 2: fakeredis (in-memory Redis for rate limiter / circuit breaker tests)
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture
async def fakeredis():
    """In-memory Redis via fakeredis — supports Lua scripts used by RateLimiter."""
    import fakeredis.aioredis

    r = await fakeredis.aioredis.FakeRedis(decode_responses=True)
    yield r
    await r.aclose()


# ═══════════════════════════════════════════════════════════════════════════════
# Tier 3: Mocked HTTP
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture
def mock_httpx_client(
    sample_movie_raw: dict,
    sample_movie_raw_with_collection: dict,
    sample_show_raw: dict,
    sample_collection_raw: dict,
    sample_person_raw: dict,
    sample_person_combined_credits: dict,
):
    """An httpx.AsyncClient that returns canned TMDB responses based on URL path."""
    import json

    import httpx

    class MockResponse:
        def __init__(self, data: dict, status_code: int = 200):
            self._data = data
            self.status_code = status_code
            self.headers = {}

        def json(self) -> dict:
            return self._data

        def raise_for_status(self):
            if self.status_code >= 400:
                raise httpx.HTTPStatusError("error", request=MagicMock(), response=MagicMock(status_code=self.status_code))

    class MockTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            url = str(request.url)
            body = None

            if "/person/changes" in url:
                body = json.dumps({
                    "page": 1, "total_pages": 1, "total_results": 1,
                    "results": [{"id": 287, "adult": False}],
                }).encode()
            elif "/person/287/combined_credits" in url:
                body = json.dumps(sample_person_combined_credits).encode()
            elif "/person/287" in url:
                body = json.dumps(sample_person_raw).encode()
            elif "/tv/changes" in url:
                body = json.dumps({
                    "page": 1, "total_pages": 1, "total_results": 1,
                    "results": [{"id": 1399, "adult": False}],
                }).encode()
            elif "/movie/changes" in url:
                body = json.dumps({
                    "page": 1, "total_pages": 1, "total_results": 1,
                    "results": [{"id": 550, "adult": False}],
                }).encode()
            elif "/movie/550" in url:
                body = json.dumps(sample_movie_raw).encode()
            elif "/movie/999" in url:
                body = json.dumps(sample_movie_raw_with_collection).encode()
            elif "/tv/1399" in url:
                body = json.dumps(sample_show_raw).encode()
            elif "/collection/123" in url:
                body = json.dumps(sample_collection_raw).encode()
            elif "/movie/popular" in url:
                body = json.dumps({
                    "page": 1, "total_pages": 1, "total_results": 2,
                    "results": [
                        {"id": 550, "title": "Fight Club"},
                        {"id": 680, "title": "Pulp Fiction"},
                    ],
                }).encode()
            elif "/tv/popular" in url:
                body = json.dumps({
                    "page": 1, "total_pages": 1, "total_results": 1,
                    "results": [
                        {"id": 1399, "name": "Game of Thrones"},
                    ],
                }).encode()
            elif "/movie/top_rated" in url:
                body = json.dumps({
                    "page": 1, "total_pages": 1, "total_results": 1,
                    "results": [{"id": 550, "title": "Fight Club"}],
                }).encode()
            elif "/movie/upcoming" in url:
                body = json.dumps({
                    "page": 1, "total_pages": 1, "total_results": 1,
                    "results": [{"id": 680, "title": "Pulp Fiction"}],
                }).encode()
            elif "/movie/now_playing" in url:
                body = json.dumps({
                    "page": 1, "total_pages": 1, "total_results": 1,
                    "results": [{"id": 550, "title": "Fight Club"}],
                }).encode()
            elif "/tv/top_rated" in url:
                body = json.dumps({
                    "page": 1, "total_pages": 1, "total_results": 1,
                    "results": [{"id": 1399, "name": "Game of Thrones"}],
                }).encode()
            elif "/tv/on_the_air" in url:
                body = json.dumps({
                    "page": 1, "total_pages": 1, "total_results": 1,
                    "results": [{"id": 1399, "name": "Game of Thrones"}],
                }).encode()
            elif "/tv/airing_today" in url:
                body = json.dumps({
                    "page": 1, "total_pages": 1, "total_results": 1,
                    "results": [{"id": 1399, "name": "Game of Thrones"}],
                }).encode()
            elif "/trending/" in url:
                body = json.dumps({
                    "page": 1, "total_pages": 1, "total_results": 2,
                    "results": [
                        {"id": 550, "title": "Fight Club", "media_type": "movie"},
                        {"id": 1399, "name": "Game of Thrones", "media_type": "tv"},
                    ],
                }).encode()
            elif "/configuration" in url:
                body = json.dumps({"images": {"base_url": "http://image.tmdb.org/t/p/"}}).encode()
            elif "/genre/movie/list" in url:
                body = json.dumps({"genres": [{"id": 18, "name": "Drama"}]}).encode()
            else:
                body = json.dumps({}).encode()

            return httpx.Response(200, content=body, request=request)

    return httpx.AsyncClient(transport=MockTransport(), base_url="https://api.themoviedb.org/3")


@pytest.fixture
def mock_httpx_client_429():
    """Returns 429 for rate limit testing."""
    import httpx

    class RateLimitTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                429,
                content=b'{"status_message": "Too many requests"}',
                headers={"Retry-After": "2"},
                request=request,
            )

    return httpx.AsyncClient(transport=RateLimitTransport(), base_url="https://api.themoviedb.org/3")


# ═══════════════════════════════════════════════════════════════════════════════
# Tier 3: Mocked DB session (for hydrator tests)
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture
def mock_db_session() -> AsyncMock:
    """An AsyncMock that mimics AsyncSession for hydrator tests.

    Returns None from scalar() by default (no existing records found).
    Use session.scalar.return_value = <obj> to simulate existing records.
    """
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = None
    session.scalars.return_value = MagicMock(all=MagicMock(return_value=[]))
    session.execute.return_value = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.add = MagicMock()
    session.add_all = MagicMock()
    return session


# ═══════════════════════════════════════════════════════════════════════════════
# Tier 4: Real DB + Redis (integration, requires Docker)
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture(scope="session")
def docker_compose():
    """Ensure docker compose services for integration tests."""
    import subprocess

    try:
        subprocess.run(
            ["docker", "compose", "stop", "api", "beat", "worker-ccu", "worker-fast", "worker-slow"],
            check=False,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["docker", "compose", "up", "-d", "db", "redis"],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        pytest.skip("Docker CLI is not available in this test environment")
    except subprocess.CalledProcessError as exc:
        pytest.skip(f"Docker compose failed: {exc.stderr}")


@pytest.fixture
async def integration_redis(docker_compose):
    """Real Redis connection for integration tests."""
    import redis.asyncio as aioredis

    r = aioredis.from_url("redis://localhost:6380/15", decode_responses=True)
    yield r
    await r.flushdb()
    await r.aclose()


_integration_schema_ready = False


@pytest.fixture
async def integration_session(docker_compose):
    """Real Postgres session with per-test table truncation.

    Drops and recreates all tables so every integration test starts clean,
    regardless of what prior test runs or manual operations left behind.
    """
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from otix.domain.base import Base
    from otix.infrastructure.database import dispose_engine

    global _integration_schema_ready

    await dispose_engine()
    engine = create_async_engine(
        "postgresql+asyncpg://otix:password@localhost:5433/otix_dev",
        echo=False,
        poolclass=NullPool,
    )

    if not _integration_schema_ready:
        terminator = create_async_engine(
            "postgresql+asyncpg://otix:password@localhost:5433/otix_dev",
            echo=False,
            poolclass=NullPool,
            isolation_level="AUTOCOMMIT",
        )
        async with terminator.connect() as conn:
            await conn.execute(
                text(
                    """
                    SELECT pg_terminate_backend(pid)
                    FROM pg_stat_activity
                    WHERE datname = current_database()
                      AND pid <> pg_backend_pid()
                    """
                )
            )
        await terminator.dispose()

        async with engine.begin() as conn:
            await conn.execute(text("SELECT pg_advisory_xact_lock(9001)"))
            await conn.execute(text("DROP SCHEMA public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.run_sync(Base.metadata.create_all)
        _integration_schema_ready = True

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as session:
        transaction = await session.begin()
        try:
            yield session
        finally:
            await session.rollback()
            if transaction.is_active:
                await transaction.rollback()
            await session.close()

    await engine.dispose()


# ═══════════════════════════════════════════════════════════════════════════════
# Globals cleanup
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture(autouse=True)
def _reset_shared_httpx_clients():
    """Reset module-level shared httpx clients between tests.

    Without this, a shared client created on one async test's event loop
    survives into the next test, whose new event loop can't use it.
    """
    from otix.providers.igdb import client as igdb_client
    from otix.providers.tmdb import client as tmdb_client

    tmdb_client._shared_client = None
    tmdb_client._shared_client_loop_id = None
    igdb_client._shared_client = None
    igdb_client._shared_client_loop_id = None


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture
def make_media_item():
    """Factory for creating a basic MediaItem with known values."""
    from otix.domain.media import MediaItem

    def _make(**overrides) -> MediaItem:
        defaults = {
            "media_type": "movie",
            "title": "Test Movie",
            "overview": "A test overview",
            "slug": "test-movie",
            "poster_url": None,
            "backdrop_url": None,
            "release_date": None,
            "popularity": 0.0,
            "original_language": "en",
        }
        defaults.update(overrides)
        item = MediaItem(**defaults)
        item.id = "oti_test00000001"
        return item

    return _make
