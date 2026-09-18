"""End-to-end catalog hydration: unmatched source → job → seed → link → rehydrate.

These tests drive the unified loop on the real (test) database with provider
HTTP stubbed. Seed writes stay synchronous so ``TestCase`` rollback still
sees them (the async ``fetch_and_seed_*`` path uses ``sync_to_async``).
"""

from __future__ import annotations

from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.integrations.models import (
    SyncJob,
    UserPlexItem,
    UserPlexLibrary,
    UserPlexServer,
    UserSteamGame,
)
from apps.integrations.services.catalog_seed import (
    drain_catalog,
    ensure_catalog_job,
)
from apps.integrations.services.plex_sync import _match_or_seed
from apps.media.models import ExternalID, MediaItem, Movie
from apps.media.services.catalog_lifecycle import payload_hash_matches
from apps.media.services.steam_seed import seed_game_from_steam_app
from apps.media.services.tmdb_ingest import seed_movie_from_tmdb

User = get_user_model()


def _movie_raw(**overrides):
    raw = {
        "id": 550,
        "title": "Fight Club",
        "overview": "An insomniac and a soap salesman start an underground club.",
        "release_date": "1999-10-15",
        "original_language": "en",
        "adult": False,
        "popularity": 60.0,
        "runtime": 139,
        "budget": 63000000,
        "revenue": 100000000,
        "tagline": "Mischief. Mayhem. Soap.",
        "poster_path": "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
        "backdrop_path": "/hZkgoQYus5vegHoetLkCJzb17zJ.jpg",
        "imdb_id": "tt0137523",
        "genres": [{"id": 18, "name": "Drama"}, {"id": 53, "name": "Thriller"}],
        "keywords": {"keywords": [{"id": 1, "name": "insomnia"}]},
    }
    raw.update(overrides)
    return raw


class _FakeRedis:
    def __init__(self):
        self.published: list[tuple[str, str]] = []

    def publish(self, channel, message):
        self.published.append((channel, message))
        return 1


class CatalogHydrationLoopTests(TestCase):
    def setUp(self):
        self.events = _FakeRedis()
        patcher = mock.patch(
            "apps.media.services.catalog_events.get_client",
            return_value=self.events,
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.user = User.objects.create_user(username="hydra", password="pw")
        self.server = UserPlexServer.objects.create(
            user=self.user,
            machine_identifier="srv-loop",
            name="Home",
            base_url="http://plex.local",
        )
        self.library = UserPlexLibrary.objects.create(
            user=self.user,
            server=self.server,
            section_key="1",
            title="Movies",
            library_type="movie",
        )

    def _plex_item(self, *, rating_key: str, guid: str, guids: dict) -> UserPlexItem:
        return UserPlexItem.objects.create(
            user=self.user,
            server=self.server,
            library=self.library,
            rating_key=rating_key,
            guid=guid,
            media_type="movie",
            title="Fight Club",
            year=1999,
            guids=guids,
        )

    def test_unmatched_plex_enqueues_then_seed_links_the_library_row(self):
        plex_guid = "plex://movie/library-a"
        row = self._plex_item(
            rating_key="101",
            guid=plex_guid,
            guids={"tmdb": "550"},
        )

        media_id, matched = _match_or_seed(
            {"title": "Fight Club", "year": 1999},
            "movie",
            {"tmdb": "550"},
            plex_guid,
        )
        self.assertIsNone(media_id)
        self.assertFalse(matched)
        self.assertEqual(MediaItem.objects.count(), 0)
        job = SyncJob.objects.get(provider="tmdb", entity_type="movie", external_id="550")
        self.assertEqual(job.status, "pending")
        self.assertEqual(job.priority, 1)

        seeded_id = seed_movie_from_tmdb(_movie_raw())
        media = MediaItem.objects.get(pk=seeded_id)
        self.assertEqual(media.title, "Fight Club")
        self.assertGreater(media.completeness_score, 0.15)
        self.assertIsNotNone(media.next_sync_at)
        self.assertGreater(media.next_sync_at, timezone.now() + timedelta(hours=1))
        self.assertTrue(payload_hash_matches(seeded_id, "tmdb", "550", "movie", _movie_raw()))
        self.assertTrue(
            ExternalID.objects.filter(
                content_type=ContentType.objects.get_for_model(MediaItem),
                provider="tmdb",
                external_id="550",
                object_id=seeded_id,
            ).exists()
        )
        self.assertTrue(
            ExternalID.objects.filter(
                content_type=ContentType.objects.get_for_model(MediaItem),
                provider="imdb",
                external_id="tt0137523",
                object_id=seeded_id,
            ).exists()
        )

        row.refresh_from_db()
        self.assertEqual(row.media_item_id, seeded_id)
        self.assertEqual(
            ExternalID.objects.filter(
                content_type=ContentType.objects.get_for_model(MediaItem),
                provider="plex",
                external_id=plex_guid,
                object_id=seeded_id,
            ).exists(),
            True,
        )
        self.assertTrue(any("media.updated" in payload for _, payload in self.events.published))

    def test_second_plex_library_shares_the_seeded_hub(self):
        seed_movie_from_tmdb(_movie_raw())
        first_id, first_ok = _match_or_seed(
            {"title": "Fight Club", "year": 1999},
            "movie",
            {"tmdb": "550"},
            "plex://movie/library-a",
        )
        second_id, second_ok = _match_or_seed(
            {"title": "Fight Club", "year": 1999},
            "movie",
            {"tmdb": "550"},
            "plex://movie/library-b",
        )
        self.assertTrue(first_ok)
        self.assertTrue(second_ok)
        self.assertEqual(first_id, second_id)
        self.assertEqual(MediaItem.objects.filter(media_type="movie").count(), 1)

    def test_unchanged_payload_skips_relation_rebuild_and_doubles_the_interval(self):
        from apps.media.services.catalog_lifecycle import finish_catalog_seed
        from apps.media.services.identity import find_media_id

        raw = _movie_raw()
        media_id = seed_movie_from_tmdb(raw)
        self.assertEqual(find_media_id("tmdb", "550", "movie"), media_id)
        self.assertTrue(payload_hash_matches(media_id, "tmdb", "550", "movie", raw))
        media = MediaItem.objects.get(pk=media_id)
        first_next = media.next_sync_at
        ext = ExternalID.objects.get(
            content_type=ContentType.objects.get_for_model(MediaItem),
            provider="tmdb",
            external_id="550",
            media_type="movie",
        )
        self.assertEqual(ext.hash_match_count, 0)
        finish_catalog_seed(media, raw, provider="tmdb", external_id="550", hash_matched=True)
        media.refresh_from_db()
        ext.refresh_from_db()
        self.assertEqual(ext.hash_match_count, 1)
        self.assertGreater(media.next_sync_at, first_next)

    def test_detail_get_bumps_incomplete_row_to_p0(self):
        media_id = seed_movie_from_tmdb(_movie_raw())
        SyncJob.objects.filter(status="pending").delete()
        client = APIClient()
        resp = client.get(f"/api/v1/media/movie/{media_id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], media_id)
        job = SyncJob.objects.get(provider="tmdb", entity_type="movie", external_id="550")
        self.assertEqual(job.priority, 0)
        self.assertEqual(job.status, "pending")

    def test_drain_enqueues_incomplete_then_runs_highest_priority_first(self):
        media_id = seed_movie_from_tmdb(_movie_raw())
        SyncJob.objects.all().delete()
        MediaItem.objects.filter(pk=media_id).update(completeness_score=0.2)

        ensure_catalog_job("tmdb", "movie", "999", priority=5, dispatch=False)
        drained: list[int] = []
        with mock.patch(
            "apps.integrations.services.catalog_seed.execute_sync_job",
            side_effect=lambda pk: drained.append(pk) or {"status": "success"},
        ):
            summary = drain_catalog(limit=1, rehydrate_limit=10)

        self.assertEqual(summary["rehydrate"]["enqueued"], 1)
        fight = SyncJob.objects.get(external_id="550")
        self.assertEqual(fight.priority, 4)
        self.assertEqual(drained, [fight.pk])

    def test_steam_app_id_enqueues_igdb_without_creating_a_hub(self):
        with mock.patch(
            "apps.media.services.catalog_resolve._default_steam_lookup",
            return_value={400: 71},
        ):
            item = seed_game_from_steam_app("Portal", 400)
        self.assertIsNone(item)
        self.assertEqual(MediaItem.objects.count(), 0)
        job = SyncJob.objects.get(provider="igdb", entity_type="game", external_id="71")
        self.assertEqual(job.priority, 1)

    def test_steam_row_links_after_igdb_seed_attaches_store_id(self):
        from apps.media.services.igdb_ingest import seed_game_from_igdb

        UserSteamGame.objects.create(
            user=self.user, steam_app_id=400, name="Portal", media_item=None
        )
        media_id = seed_game_from_igdb(
            {
                "id": 71,
                "name": "Portal",
                "slug": "portal",
                "storyline": "The cake is a lie.",
                "first_release_date": 1191974400,
                "cover": {"image_id": "co1234"},
                "external_games": [{"external_game_source": 1, "uid": "400"}],
            },
            71,
        )
        steam = UserSteamGame.objects.get(steam_app_id=400)
        self.assertEqual(steam.media_item_id, media_id)
        self.assertTrue(
            ExternalID.objects.filter(
                content_type=ContentType.objects.get_for_model(MediaItem),
                provider="steam",
                external_id="400",
                object_id=media_id,
            ).exists()
        )

    def test_music_never_enters_the_loop(self):
        self.assertIsNone(ensure_catalog_job("musicbrainz", "album", "mbid"))
        self.assertIsNone(ensure_catalog_job("tmdb", "music", "1"))
        self.assertEqual(SyncJob.objects.count(), 0)

    def test_title_only_orphan_is_not_rehydrated(self):
        MediaItem.objects.create(
            media_type="movie", title="Orphan", slug="orphan", completeness_score=0.1
        )
        Movie.objects.create(media_item=MediaItem.objects.get(slug="orphan"))
        with mock.patch(
            "apps.integrations.services.catalog_seed.execute_sync_job",
            return_value={"status": "success"},
        ):
            summary = drain_catalog(limit=10, rehydrate_limit=10)
        self.assertEqual(summary["rehydrate"]["enqueued"], 0)
        self.assertEqual(SyncJob.objects.count(), 0)
