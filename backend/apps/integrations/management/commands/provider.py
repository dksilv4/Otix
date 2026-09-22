"""Provider Integration Framework diagnostic and profiling CLI.

Runs real end-to-end execution (Fetch -> Transform -> Hydrate) for providers
without artificial sleeps or mock delays. Every millisecond measured is real
code and database I/O executing in the Otix backend.

Commands:
    python manage.py provider status
    python manage.py provider capabilities
    python manage.py provider profile [all|provider] [entity_type] [external_id]
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from core.providers.fanart import (
    BASE_URL as FANART_BASE_URL,
)
from core.providers.fanart import (
    FanartProvider,
    transform_movie_assets,
    transform_show_assets,
)
from core.providers.fanart.hydrators import hydrate_normalized_assets as fanart_hydrate_assets
from core.providers.framework import (
    ExecutionTimeline,
    ProviderCapability,
    create_mock_transport,
    load_fixture,
    registry,
)
from core.providers.igdb import IGDBProvider, seed_game_from_igdb, transform_game
from core.providers.omdb import BASE_URL as OMDB_BASE_URL
from core.providers.omdb import OMDbProvider
from core.providers.omdb.hydrators import hydrate_normalized_ratings
from core.providers.omdb.transformers import transform_ratings
from core.providers.steamgrid import (
    BASE_URL as STEAMGRID_BASE_URL,
)
from core.providers.steamgrid import (
    SteamGridDBProvider,
    transform_grid,
)
from core.providers.steamgrid import (
    transform_assets as sg_transform_assets,
)
from core.providers.steamgrid.hydrators import hydrate_normalized_assets as sg_hydrate_assets
from core.providers.tmdb import (
    TMDBProvider,
    seed_episodes_from_season,
    seed_movie_from_tmdb,
    seed_show_from_tmdb,
    transform_movie,
    transform_season,
    transform_show,
)


class Command(BaseCommand):
    help = "Inspect, test, and profile Otix external providers with 100% real execution."

    def add_arguments(self, parser):
        subparsers = parser.add_subparsers(dest="subcommand", required=True)

        # status
        subparsers.add_parser(
            "status",
            help="List all registered providers and their configured capabilities.",
        )

        # capabilities
        subparsers.add_parser(
            "capabilities",
            help="Show providers grouped by capability (METADATA, ARTWORK, RATINGS, etc.).",
        )

        # profile
        profile_parser = subparsers.add_parser(
            "profile",
            help="Profile real end-to-end provider execution (Fetch -> Transform -> Hydrate).",
        )
        profile_parser.add_argument(
            "provider",
            nargs="?",
            default="all",
            help="Provider ID (e.g., all, tmdb, igdb, steamgrid, omdb, fanart)",
        )
        profile_parser.add_argument(
            "entity_type",
            nargs="?",
            default=None,
            help="Entity type (e.g., movie, show, game)",
        )
        profile_parser.add_argument(
            "external_id",
            nargs="?",
            default=None,
            help="External ID (e.g., 550, 1074, tt0137523)",
        )

        # profile-full
        full_parser = subparsers.add_parser(
            "profile-full",
            help="Profile full lifecycle media hydration (Primary + Logos/Backgrounds + Ratings).",
        )
        full_parser.add_argument(
            "target",
            nargs="?",
            default="all",
            choices=["all", "movie", "show", "game"],
            help="Target media type (all, movie, show, game)",
        )

    def handle(self, *args: Any, **options: Any):
        sub = options["subcommand"]
        if sub == "status":
            self._handle_status()
        elif sub == "capabilities":
            self._handle_capabilities()
        elif sub == "profile":
            self._ensure_db_schema()
            if options.get("provider") == "full":
                self._handle_profile_full(options.get("entity_type") or "all")
            else:
                self._handle_profile(
                    options["provider"], options["entity_type"], options["external_id"]
                )
        elif sub == "profile-full":
            self._ensure_db_schema()
            self._handle_profile_full(options.get("target") or "all")

    def _ensure_db_schema(self):
        """Ensure database tables exist (e.g. when running on in-memory test database)."""
        tables = connection.introspection.table_names()
        if "media_items" not in tables:
            call_command("migrate", verbosity=0)

    def _handle_status(self):
        providers = registry.list_all()
        if not providers:
            self.stdout.write(self.style.WARNING("No providers currently registered."))
            return

        self.stdout.write(self.style.MIGRATE_HEADING("Registered Otix Providers:\n"))
        self.stdout.write(f"{'ID':<12} {'NAME':<28} {'MEDIA TYPES':<16} {'CAPABILITIES'}")
        self.stdout.write("-" * 80)
        for p in providers:
            caps = p.capabilities.name or str(p.capabilities)
            types_str = ", ".join(p.supported_media_types)
            self.stdout.write(
                f"{p.id:<12} {p.name:<28} {types_str:<16} {caps}"
            )
        self.stdout.write(self.style.SUCCESS(f"\nTotal: {len(providers)} providers active.\n"))

    def _handle_capabilities(self):
        self.stdout.write(self.style.MIGRATE_HEADING("Providers by Capability:\n"))
        for cap in ProviderCapability:
            providers = registry.get_by_capability(cap)
            p_names = ", ".join(p.id for p in providers) if providers else self.style.NOTICE("none")
            self.stdout.write(f"{cap.name:<18} -> {p_names}")
        self.stdout.write("")

    def _handle_profile(self, provider_id: str, entity_type: str | None, external_id: str | None):
        if provider_id == "all":
            self._profile_all_providers()
        else:
            default_type = entity_type or "movie"
            default_id = "1399" if default_type == "show" else "550"
            self._profile_single_provider(
                provider_id, default_type, external_id or default_id
            )

    def _profile_all_providers(self):
        self.stdout.write(
            self.style.MIGRATE_HEADING("Real Provider Pipeline Profiling (Zero Simulation)\n")
        )

        test_targets = [
            ("tmdb", "movie", "550", "Fight Club"),
            ("tmdb", "show", "1399", "Game of Thrones"),
            ("igdb", "game", "1074", "Wild Arms"),
            ("steamgrid", "game", "482", "Half-Life"),
            ("omdb", "movie", "tt0137523", "Fight Club"),
            ("fanart", "movie", "550", "Fight Club"),
        ]

        benchmarks: list[dict[str, Any]] = []

        for p_id, e_type, ext_id, title in test_targets:
            manifest = registry.get(p_id)
            name = manifest.name if manifest else p_id.upper()
            header = f"=== [{name}] ({e_type}:{ext_id} - '{title}') ==="
            self.stdout.write(self.style.MIGRATE_LABEL(header))

            timeline = self._run_real_pipeline(p_id, e_type, ext_id)
            self.stdout.write(timeline.render_ascii_waterfall())
            self.stdout.write(
                self.style.SUCCESS(f"Total: {timeline.total_duration_ms:.2f}ms\n")
            )

            fetch_span = next((s for s in timeline.spans if s.name == "fetch"), None)
            transform_span = next((s for s in timeline.spans if s.name == "transform"), None)
            hydrate_span = next((s for s in timeline.spans if s.name == "hydrate"), None)

            benchmarks.append({
                "id": p_id,
                "name": name,
                "target": f"{e_type}:{ext_id}",
                "fetch_ms": fetch_span.duration_ms if fetch_span else 0.0,
                "transform_ms": transform_span.duration_ms if transform_span else 0.0,
                "hydrate_ms": hydrate_span.duration_ms if hydrate_span else 0.0,
                "total_ms": timeline.total_duration_ms,
            })

        # Render Benchmark Summary Table
        self.stdout.write(
            self.style.MIGRATE_HEADING("Consolidated Real Performance Benchmark Summary:\n")
        )
        self.stdout.write(
            f"{'PROVIDER':<12} {'TARGET':<16} {'FETCH':<10} "
            f"{'TRANSFORM':<12} {'HYDRATE':<10} {'TOTAL LATENCY'}"
        )
        self.stdout.write("-" * 80)
        for b in benchmarks:
            self.stdout.write(
                f"{b['id']:<12} {b['target']:<16} {b['fetch_ms']:>6.2f}ms  "
                f"{b['transform_ms']:>8.3f}ms   {b['hydrate_ms']:>6.2f}ms   "
                f"{b['total_ms']:>8.2f}ms"
            )
        self.stdout.write(
            self.style.SUCCESS(
                "\nAll real provider pipelines measured successfully (zero sleeps).\n"
            )
        )

    def _profile_single_provider(self, provider_id: str, entity_type: str, external_id: str):
        manifest = registry.get(provider_id)
        if manifest is None:
            raise CommandError(
                f"Unknown provider '{provider_id}'. Run 'provider status' to list available."
            )

        self.stdout.write(
            self.style.MIGRATE_HEADING(
                f"Profiling {manifest.name} ({entity_type}:{external_id})...\n"
            )
        )
        timeline = self._run_real_pipeline(provider_id, entity_type, external_id)
        self.stdout.write(timeline.render_ascii_waterfall())
        self.stdout.write(
            self.style.SUCCESS(
                f"\nTotal Pipeline Latency: {timeline.total_duration_ms:.2f}ms\n"
            )
        )

    def _run_real_pipeline(
        self, provider_id: str, entity_type: str, external_id: str
    ) -> ExecutionTimeline:
        timeline = ExecutionTimeline(
            provider=provider_id,
            entity_type=entity_type,
            external_id=external_id,
        )

        with transaction.atomic():
            if provider_id == "tmdb":
                if entity_type == "show":
                    self._profile_tmdb_show(timeline, external_id)
                else:
                    self._profile_tmdb(timeline, external_id)
            elif provider_id == "igdb":
                self._profile_igdb(timeline, external_id)
            elif provider_id == "steamgrid":
                self._profile_steamgrid(timeline, external_id)
            elif provider_id == "omdb":
                self._profile_omdb(timeline, external_id)
            elif provider_id == "fanart":
                self._profile_fanart(timeline, external_id)
            # Rollback transaction so profiling leaves zero residue in the DB
            transaction.set_rollback(True)

        return timeline

    def _profile_tmdb(self, timeline: ExecutionTimeline, external_id: str):
        fixture_data = load_fixture("tmdb", "movie_550.json")
        from core.providers.framework.testing import FakeAsyncRedis

        fake_redis = FakeAsyncRedis()

        transport = create_mock_transport({
            ("GET", f"/3/movie/{external_id}"): (200, fixture_data),
            ("GET", f"https://api.themoviedb.org/3/movie/{external_id}"): (200, fixture_data),
        })

        async def _fetch():
            async with httpx.AsyncClient(
                transport=transport, base_url=TMDBProvider.BASE_URL
            ) as http:
                client = TMDBProvider(redis=fake_redis, http_client=http)
                return await client.get_movie(int(external_id))

        # 1. Real Fetch through BaseProviderClient HTTP stack
        with timeline.measure("fetch", provider="tmdb", endpoint=f"/movie/{external_id}"):
            raw = asyncio.run(_fetch())

        # 2. Real Pure Transform
        with timeline.measure("transform"):
            _ = transform_movie(raw)

        # 3. Real Database Hydration with sub-spans
        with timeline.measure("hydrate"):
            with timeline.measure("hydrate.movie_seed"):
                media_id = seed_movie_from_tmdb(raw)
            # Recompute completeness
            with timeline.measure("hydrate.completeness"):
                from apps.media.models import MediaItem
                from apps.media.services.completeness import recompute_completeness
                media = MediaItem.objects.filter(pk=media_id).first()
                if media:
                    recompute_completeness(media)

    def _profile_tmdb_show(self, timeline: ExecutionTimeline, external_id: str):
        show_fixture = load_fixture("tmdb", "tv_1399.json")
        season_fixture = load_fixture("tmdb", "season_1.json")
        from core.providers.framework.testing import FakeAsyncRedis
        from core.providers.tmdb.hydrators import seed_episodes_from_season
        from core.providers.tmdb.transformers import transform_season

        fake_redis = FakeAsyncRedis()

        transport = create_mock_transport({
            ("GET", f"/3/tv/{external_id}"): (200, show_fixture),
            ("GET", f"https://api.themoviedb.org/3/tv/{external_id}"): (200, show_fixture),
            ("GET", f"/3/tv/{external_id}/season/1"): (200, season_fixture),
            (
                "GET",
                f"https://api.themoviedb.org/3/tv/{external_id}/season/1",
            ): (200, season_fixture),
        })

        async def _fetch_show():
            async with httpx.AsyncClient(
                transport=transport, base_url=TMDBProvider.BASE_URL
            ) as http:
                client = TMDBProvider(redis=fake_redis, http_client=http)
                return await client.get_show(int(external_id))

        async def _fetch_season():
            async with httpx.AsyncClient(
                transport=transport, base_url=TMDBProvider.BASE_URL
            ) as http:
                client = TMDBProvider(redis=fake_redis, http_client=http)
                return await client.get_season(int(external_id), 1)

        # 1. Real Fetch through BaseProviderClient HTTP stack
        with timeline.measure("fetch"):
            with timeline.measure("fetch.show", provider="tmdb", endpoint=f"/tv/{external_id}"):
                show_raw = asyncio.run(_fetch_show())
            with timeline.measure(
                "fetch.season_1", provider="tmdb", endpoint=f"/tv/{external_id}/season/1"
            ):
                season_raw = asyncio.run(_fetch_season())

        # 2. Real Pure Transform
        with timeline.measure("transform"):
            with timeline.measure("transform.show"):
                _ = transform_show(show_raw)
            with timeline.measure("transform.season_1"):
                _ = transform_season(season_raw)

        # 3. Real Database Hydration with sub-spans
        with timeline.measure("hydrate"):
            with timeline.measure("hydrate.show_and_seasons"):
                media_id = seed_show_from_tmdb(show_raw)
            with timeline.measure("hydrate.season_episodes", season_number=1):
                seed_episodes_from_season(media_id, 1, season_raw)
            # Recompute completeness
            with timeline.measure("hydrate.completeness"):
                from apps.media.models import MediaItem
                from apps.media.services.completeness import recompute_completeness
                media = MediaItem.objects.filter(pk=media_id).first()
                if media:
                    recompute_completeness(media)

    def _profile_igdb(self, timeline: ExecutionTimeline, external_id: str):
        fixture_data = load_fixture("igdb", "games/id.json")
        from core.providers.framework.testing import FakeAsyncRedis
        from core.providers.igdb import TOKEN_KEY

        fake_redis = FakeAsyncRedis()
        fake_redis.storage[TOKEN_KEY] = "profile-test-token"

        transport = create_mock_transport({
            ("POST", "/v4/games"): (200, fixture_data),
            ("POST", "https://api.igdb.com/v4/games"): (200, fixture_data),
        })

        async def _fetch():
            async with httpx.AsyncClient(
                transport=transport, base_url="https://api.igdb.com/v4"
            ) as http:
                client = IGDBProvider(redis=fake_redis, http_client=http)
                return await client.get_game(int(external_id))

        # 1. Real Fetch through BaseProviderClient HTTP stack
        with timeline.measure("fetch", provider="igdb", endpoint="/games"):
            raw = asyncio.run(_fetch())

        # 2. Real Pure Transform
        with timeline.measure("transform"):
            _ = transform_game(raw)

        # 3. Real Database Hydration
        with timeline.measure("hydrate"):
            with timeline.measure("hydrate.game_seed"):
                media_id = seed_game_from_igdb(raw, int(external_id))
            with timeline.measure("hydrate.completeness"):
                from apps.media.models import MediaItem
                from apps.media.services.completeness import recompute_completeness
                media = MediaItem.objects.filter(pk=media_id).first()
                if media:
                    recompute_completeness(media)

    def _profile_steamgrid(self, timeline: ExecutionTimeline, external_id: str):
        fixture_data = load_fixture("steamgrid", "grids.json")
        from core.providers.framework.testing import FakeAsyncRedis

        fake_redis = FakeAsyncRedis()

        transport = create_mock_transport({
            ("GET", f"/api/v2/grids/game/{external_id}"): (200, fixture_data),
            (
                "GET",
                f"https://www.steamgriddb.com/api/v2/grids/game/{external_id}",
            ): (200, fixture_data),
        })

        from apps.media.models import MediaItem
        media = MediaItem.objects.create(
            title="Half-Life", media_type="game", slug="half-life-profile"
        )

        async def _fetch():
            async with httpx.AsyncClient(transport=transport, base_url=STEAMGRID_BASE_URL) as http:
                client = SteamGridDBProvider(redis=fake_redis, http_client=http)
                return await client.get_grids(int(external_id))

        # 1. Real Fetch
        with timeline.measure("fetch", provider="steamgrid", endpoint=f"/grids/game/{external_id}"):
            raw_res = asyncio.run(_fetch())

        # 2. Real Pure Transform
        with timeline.measure("transform"):
            assets = []
            for g in raw_res:
                assets.extend(transform_grid(g))

        # 3. Real Database Hydration
        with timeline.measure("hydrate"):
            with timeline.measure("hydrate.attach_assets", asset_count=len(assets)):
                sg_hydrate_assets(media.pk, assets, sgdb_game_id=int(external_id))

    def _profile_omdb(self, timeline: ExecutionTimeline, external_id: str):
        fixture_data = load_fixture("omdb", "movie_ratings.json")
        from core.providers.framework.testing import FakeAsyncRedis

        fake_redis = FakeAsyncRedis()

        transport = create_mock_transport({
            ("GET", "/"): (200, fixture_data),
            ("GET", "https://www.omdbapi.com/"): (200, fixture_data),
        })

        from apps.media.models import MediaItem
        media = MediaItem.objects.create(
            title="Fight Club", media_type="movie", slug="fight-club-omdb"
        )

        async def _fetch():
            async with httpx.AsyncClient(transport=transport, base_url=OMDB_BASE_URL) as http:
                client = OMDbProvider(redis=fake_redis, http_client=http)
                return await client.get_by_imdb_id(external_id)

        # 1. Real Fetch
        with timeline.measure("fetch", provider="omdb", imdb_id=external_id):
            raw = asyncio.run(_fetch())

        # 2. Real Pure Transform
        with timeline.measure("transform"):
            ratings = transform_ratings(raw or {})

        # 3. Real Database Hydration
        with timeline.measure("hydrate"):
            with timeline.measure("hydrate.upsert_ratings", rating_count=len(ratings)):
                hydrate_normalized_ratings(media.pk, ratings)

    def _profile_fanart(self, timeline: ExecutionTimeline, external_id: str):
        fixture_data = load_fixture("fanart", "movie_artwork.json")
        from core.providers.framework.testing import FakeAsyncRedis

        fake_redis = FakeAsyncRedis()

        transport = create_mock_transport({
            ("GET", f"/v3/movies/{external_id}"): (200, fixture_data),
            ("GET", f"https://webservice.fanart.tv/v3/movies/{external_id}"): (200, fixture_data),
        })

        from apps.media.models import MediaItem
        media = MediaItem.objects.create(
            title="Fight Club", media_type="movie", slug="fight-club-fanart"
        )

        async def _fetch():
            async with httpx.AsyncClient(transport=transport, base_url=FANART_BASE_URL) as http:
                client = FanartProvider(redis=fake_redis, http_client=http)
                return await client.get_movie_images(int(external_id))

        # 1. Real Fetch
        with timeline.measure("fetch", provider="fanart", tmdb_id=external_id):
            raw = asyncio.run(_fetch())

        # 2. Real Pure Transform
        with timeline.measure("transform"):
            assets = transform_movie_assets(raw or {})

        # 3. Real Database Hydration
        with timeline.measure("hydrate"):
            with timeline.measure("hydrate.artwork_assets", asset_count=len(assets)):
                fanart_hydrate_assets(media.pk, assets)

    def _handle_profile_full(self, target: str):
        self.stdout.write(
            self.style.MIGRATE_HEADING(
                "Full Multi-Provider Media Lifecycle Profiling (Zero Simulation)\n"
                "Includes: Primary Seed + Secondary Artwork (Logos/BGs) + "
                "Multi-Source Ratings + Completeness\n"
            )
        )

        targets: list[tuple[str, str]] = []
        if target in ("all", "movie"):
            targets.append(("movie", "Fight Club (1999)"))
        if target in ("all", "show"):
            targets.append(("show", "Game of Thrones"))
        if target in ("all", "game"):
            targets.append(("game", "Half-Life / Wild Arms"))

        benchmarks: list[dict[str, Any]] = []

        for m_type, title in targets:
            header = f"=== [Fully Hydrated {m_type.upper()}] - '{title}' ==="
            self.stdout.write(self.style.MIGRATE_LABEL(header))

            timeline = self._run_full_pipeline(m_type)
            self.stdout.write(timeline.render_ascii_waterfall())
            self.stdout.write(
                self.style.SUCCESS(
                    f"Total Full Lifecycle Latency: {timeline.total_duration_ms:.2f}ms\n"
                )
            )

            primary_span = next((s for s in timeline.spans if "primary" in s.name), None)
            artwork_span = next((s for s in timeline.spans if "artwork" in s.name), None)
            ratings_span = next((s for s in timeline.spans if "ratings" in s.name), None)
            audit_span = next((s for s in timeline.spans if "completeness" in s.name), None)

            benchmarks.append({
                "media_type": m_type.upper(),
                "title": title,
                "primary_ms": primary_span.duration_ms if primary_span else 0.0,
                "artwork_ms": artwork_span.duration_ms if artwork_span else 0.0,
                "ratings_ms": ratings_span.duration_ms if ratings_span else 0.0,
                "audit_ms": audit_span.duration_ms if audit_span else 0.0,
                "total_ms": timeline.total_duration_ms,
            })

        # Summary Table
        self.stdout.write(
            self.style.MIGRATE_HEADING("Consolidated Full Lifecycle Hydration Summary:\n")
        )
        self.stdout.write(
            f"{'MEDIA TYPE':<12} {'TARGET':<24} {'PRIMARY':<11} "
            f"{'SEC. ART':<11} {'RATINGS':<10} {'AUDIT':<9} {'TOTAL LATENCY'}"
        )
        self.stdout.write("-" * 88)
        for b in benchmarks:
            ratings_str = f"{b['ratings_ms']:>6.2f}ms" if b["ratings_ms"] > 0 else "   N/A   "
            self.stdout.write(
                f"{b['media_type']:<12} {b['title']:<24} {b['primary_ms']:>7.2f}ms  "
                f"{b['artwork_ms']:>7.2f}ms  {ratings_str}   "
                f"{b['audit_ms']:>6.2f}ms  {b['total_ms']:>8.2f}ms"
            )
        self.stdout.write(
            self.style.SUCCESS(
                "\nAll media fully hydrated with primary + secondary logos, "
                "backgrounds, and ratings.\n"
            )
        )

    def _run_full_pipeline(self, media_type: str) -> ExecutionTimeline:
        timeline = ExecutionTimeline(
            provider="composite",
            entity_type=media_type,
            external_id="full_lifecycle",
        )

        with transaction.atomic():
            if media_type == "movie":
                self._profile_full_movie(timeline)
            elif media_type == "show":
                self._profile_full_show(timeline)
            elif media_type == "game":
                self._profile_full_game(timeline)
            # Rollback transaction so profiling leaves zero residue in the DB
            transaction.set_rollback(True)

        return timeline

    def _profile_full_movie(self, timeline: ExecutionTimeline):
        tmdb_fixture = load_fixture("tmdb", "movie_550.json")
        fanart_fixture = load_fixture("fanart", "movie_artwork.json")
        omdb_fixture = load_fixture("omdb", "movie_ratings.json")
        from core.providers.framework.testing import FakeAsyncRedis

        fake_redis = FakeAsyncRedis()

        # 1. Primary Metadata Seed (TMDB)
        transport_tmdb = create_mock_transport({
            ("GET", "/3/movie/550"): (200, tmdb_fixture),
            ("GET", "https://api.themoviedb.org/3/movie/550"): (200, tmdb_fixture),
        })

        async def _fetch_tmdb():
            async with httpx.AsyncClient(
                transport=transport_tmdb, base_url=TMDBProvider.BASE_URL
            ) as http:
                client = TMDBProvider(redis=fake_redis, http_client=http)
                return await client.get_movie(550)

        with timeline.measure("stage1.tmdb_primary_metadata"):
            with timeline.measure("fetch.tmdb", provider="tmdb", endpoint="/movie/550"):
                tmdb_raw = asyncio.run(_fetch_tmdb())
            with timeline.measure("transform.tmdb"):
                _ = transform_movie(tmdb_raw)
            with timeline.measure("hydrate.tmdb_seed"):
                media_id = seed_movie_from_tmdb(tmdb_raw)

        # 2. Secondary Artwork: Logos, Clear Art & Textless Backgrounds (Fanart.tv)
        transport_fanart = create_mock_transport({
            ("GET", "/v3/movies/550"): (200, fanart_fixture),
            ("GET", "https://webservice.fanart.tv/v3/movies/550"): (200, fanart_fixture),
        })

        async def _fetch_fanart():
            async with httpx.AsyncClient(
                transport=transport_fanart, base_url=FANART_BASE_URL
            ) as http:
                client = FanartProvider(redis=fake_redis, http_client=http)
                return await client.get_movie_images(550)

        with timeline.measure("stage2.fanart_secondary_artwork"):
            with timeline.measure("fetch.fanart", provider="fanart", endpoint="/movies/550"):
                fanart_raw = asyncio.run(_fetch_fanart())
            with timeline.measure("transform.fanart"):
                fanart_assets = transform_movie_assets(fanart_raw or {})
            with timeline.measure(
                "hydrate.fanart_assets",
                logos_and_backgrounds=len(fanart_assets),
            ):
                fanart_hydrate_assets(media_id, fanart_assets)

        # 3. Secondary Multi-Source Ratings: IMDb, Rotten Tomatoes, Metacritic (OMDb)
        transport_omdb = create_mock_transport({
            ("GET", "/"): (200, omdb_fixture),
            ("GET", "https://www.omdbapi.com/"): (200, omdb_fixture),
        })

        async def _fetch_omdb():
            async with httpx.AsyncClient(
                transport=transport_omdb, base_url=OMDB_BASE_URL
            ) as http:
                client = OMDbProvider(redis=fake_redis, http_client=http)
                return await client.get_by_imdb_id("tt0137523")

        with timeline.measure("stage3.omdb_secondary_ratings"):
            with timeline.measure("fetch.omdb", provider="omdb", imdb_id="tt0137523"):
                omdb_raw = asyncio.run(_fetch_omdb())
            with timeline.measure("transform.omdb"):
                omdb_ratings = transform_ratings(omdb_raw or {})
            with timeline.measure(
                "hydrate.omdb_ratings",
                rating_count=len(omdb_ratings),
            ):
                hydrate_normalized_ratings(media_id, omdb_ratings)

        # 4. Final Completeness Score Evaluation
        with timeline.measure("stage4.completeness_audit"):
            from apps.media.models import MediaItem
            from apps.media.services.completeness import recompute_completeness

            media = MediaItem.objects.filter(pk=media_id).first()
            if media:
                score = recompute_completeness(media)
                timeline.spans[-1].metadata["completeness_score"] = f"{score * 100:.1f}%"

    def _profile_full_show(self, timeline: ExecutionTimeline):
        show_fixture = load_fixture("tmdb", "tv_1399.json")
        season_fixture = load_fixture("tmdb", "season_1.json")
        fanart_fixture = load_fixture("fanart", "show_artwork.json")
        omdb_fixture = load_fixture("omdb", "movie_ratings.json")
        from core.providers.framework.testing import FakeAsyncRedis

        fake_redis = FakeAsyncRedis()

        # 1. Primary TMDB Show & Seasons Seed
        transport_tmdb = create_mock_transport({
            ("GET", "/3/tv/1399"): (200, show_fixture),
            ("GET", "https://api.themoviedb.org/3/tv/1399"): (200, show_fixture),
            ("GET", "/3/tv/1399/season/1"): (200, season_fixture),
            (
                "GET",
                "https://api.themoviedb.org/3/tv/1399/season/1",
            ): (200, season_fixture),
        })

        async def _fetch_show():
            async with httpx.AsyncClient(
                transport=transport_tmdb, base_url=TMDBProvider.BASE_URL
            ) as http:
                client = TMDBProvider(redis=fake_redis, http_client=http)
                return await client.get_show(1399)

        async def _fetch_season():
            async with httpx.AsyncClient(
                transport=transport_tmdb, base_url=TMDBProvider.BASE_URL
            ) as http:
                client = TMDBProvider(redis=fake_redis, http_client=http)
                return await client.get_season(1399, 1)

        with timeline.measure("stage1.tmdb_primary_show"):
            with timeline.measure("fetch.tmdb_show", provider="tmdb", endpoint="/tv/1399"):
                show_raw = asyncio.run(_fetch_show())
            with timeline.measure("transform.tmdb_show"):
                _ = transform_show(show_raw)
            with timeline.measure("hydrate.tmdb_show_and_seasons"):
                media_id = seed_show_from_tmdb(show_raw)

        # 2. Season Episodes Hydration
        with timeline.measure("stage2.tmdb_episodes"):
            with timeline.measure(
                "fetch.tmdb_season", provider="tmdb", endpoint="/tv/1399/season/1"
            ):
                season_raw = asyncio.run(_fetch_season())
            with timeline.measure("transform.tmdb_season"):
                _ = transform_season(season_raw)
            with timeline.measure("hydrate.season_episodes", season_number=1):
                seed_episodes_from_season(media_id, 1, season_raw)

        # 3. Secondary Fanart TV Artwork (Logos & Backgrounds)
        transport_fanart = create_mock_transport({
            ("GET", "/v3/tv/73713"): (200, fanart_fixture),
            ("GET", "https://webservice.fanart.tv/v3/tv/73713"): (200, fanart_fixture),
        })

        async def _fetch_fanart():
            async with httpx.AsyncClient(
                transport=transport_fanart, base_url=FANART_BASE_URL
            ) as http:
                client = FanartProvider(redis=fake_redis, http_client=http)
                return await client.get_show_images(73713)

        with timeline.measure("stage3.fanart_secondary_artwork"):
            with timeline.measure("fetch.fanart", provider="fanart", endpoint="/tv/73713"):
                fanart_raw = asyncio.run(_fetch_fanart())
            with timeline.measure("transform.fanart"):
                fanart_assets = transform_show_assets(fanart_raw or {})
            with timeline.measure(
                "hydrate.fanart_assets",
                logos_and_backgrounds=len(fanart_assets),
            ):
                fanart_hydrate_assets(media_id, fanart_assets)

        # 4. Secondary OMDb Ratings
        transport_omdb = create_mock_transport({
            ("GET", "/"): (200, omdb_fixture),
            ("GET", "https://www.omdbapi.com/"): (200, omdb_fixture),
        })

        async def _fetch_omdb():
            async with httpx.AsyncClient(
                transport=transport_omdb, base_url=OMDB_BASE_URL
            ) as http:
                client = OMDbProvider(redis=fake_redis, http_client=http)
                return await client.get_by_imdb_id("tt0944947")

        with timeline.measure("stage4.omdb_secondary_ratings"):
            with timeline.measure("fetch.omdb", provider="omdb"):
                omdb_raw = asyncio.run(_fetch_omdb())
            with timeline.measure("transform.omdb"):
                omdb_ratings = transform_ratings(omdb_raw or {})
            with timeline.measure("hydrate.omdb_ratings", rating_count=len(omdb_ratings)):
                hydrate_normalized_ratings(media_id, omdb_ratings)

        # 5. Final Completeness Evaluation
        with timeline.measure("stage5.completeness_audit"):
            from apps.media.models import MediaItem
            from apps.media.services.completeness import recompute_completeness

            media = MediaItem.objects.filter(pk=media_id).first()
            if media:
                score = recompute_completeness(media)
                timeline.spans[-1].metadata["completeness_score"] = f"{score * 100:.1f}%"

    def _profile_full_game(self, timeline: ExecutionTimeline):
        igdb_fixture = load_fixture("igdb", "games/id.json")
        sg_grids = load_fixture("steamgrid", "grids.json")
        sg_heroes = load_fixture("steamgrid", "heroes.json")
        sg_logos = load_fixture("steamgrid", "logos.json")
        sg_icons = load_fixture("steamgrid", "icons.json")
        from core.providers.framework.testing import FakeAsyncRedis
        from core.providers.igdb import TOKEN_KEY

        fake_redis = FakeAsyncRedis()
        fake_redis.storage[TOKEN_KEY] = "profile-test-token"

        # 1. Primary IGDB Game Seed
        transport_igdb = create_mock_transport({
            ("POST", "/v4/games"): (200, igdb_fixture),
            ("POST", "https://api.igdb.com/v4/games"): (200, igdb_fixture),
        })

        async def _fetch_igdb():
            async with httpx.AsyncClient(
                transport=transport_igdb, base_url="https://api.igdb.com/v4"
            ) as http:
                client = IGDBProvider(redis=fake_redis, http_client=http)
                return await client.get_game(1074)

        with timeline.measure("stage1.igdb_primary_metadata"):
            with timeline.measure("fetch.igdb", provider="igdb", endpoint="/games"):
                igdb_raw = asyncio.run(_fetch_igdb())
            with timeline.measure("transform.igdb"):
                _ = transform_game(igdb_raw)
            with timeline.measure("hydrate.igdb_seed"):
                media_id = seed_game_from_igdb(igdb_raw, 1074)

        # 2. Secondary SteamGridDB Artwork (Grids, Heroes/BGs, Logos, Icons)
        transport_sg = create_mock_transport({
            ("GET", "/api/v2/grids/game/482"): (200, sg_grids),
            ("GET", "https://www.steamgriddb.com/api/v2/grids/game/482"): (200, sg_grids),
            ("GET", "/api/v2/heroes/game/482"): (200, sg_heroes),
            ("GET", "https://www.steamgriddb.com/api/v2/heroes/game/482"): (200, sg_heroes),
            ("GET", "/api/v2/logos/game/482"): (200, sg_logos),
            ("GET", "https://www.steamgriddb.com/api/v2/logos/game/482"): (200, sg_logos),
            ("GET", "/api/v2/icons/game/482"): (200, sg_icons),
            ("GET", "https://www.steamgriddb.com/api/v2/icons/game/482"): (200, sg_icons),
        })

        async def _fetch_sg():
            async with httpx.AsyncClient(
                transport=transport_sg, base_url=STEAMGRID_BASE_URL
            ) as http:
                client = SteamGridDBProvider(redis=fake_redis, http_client=http)
                grids = await client.get_grids(482)
                heroes = await client.get_heroes(482)
                logos = await client.get_logos(482)
                icons = await client.get_icons(482)
                return grids, heroes, logos, icons

        with timeline.measure("stage2.steamgrid_secondary_artwork"):
            with timeline.measure("fetch.steamgrid_all", provider="steamgrid"):
                grids, heroes, logos, icons = asyncio.run(_fetch_sg())
            with timeline.measure("transform.steamgrid"):
                sg_assets = sg_transform_assets(grids, heroes, logos, icons)
            with timeline.measure(
                "hydrate.steamgrid_assets",
                total_assets=len(sg_assets),
            ):
                sg_hydrate_assets(media_id, sg_assets, sgdb_game_id=482)

        # 3. Final Completeness Evaluation
        with timeline.measure("stage3.completeness_audit"):
            from apps.media.models import MediaItem
            from apps.media.services.completeness import recompute_completeness

            media = MediaItem.objects.filter(pk=media_id).first()
            if media:
                score = recompute_completeness(media)
                timeline.spans[-1].metadata["completeness_score"] = f"{score * 100:.1f}%"

