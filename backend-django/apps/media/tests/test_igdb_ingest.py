"""Roundtrip tests for the IGDB game ingest service (``apps.media.services.igdb_ingest``).

Seeds MediaItem+Game rows from IGDB detail JSON on the real (test) database.
The async fetch path (``fetch_and_seed_game``) is exercised with its sync seed
stubbed out — the service runs its DB write via ``sync_to_async`` on a
worker-thread connection that escapes ``TestCase``'s per-test rollback, so the
async test must not touch the DB (the sync seed's own DB behavior is covered by
the sync ``TestCase`` methods above it).
"""

from __future__ import annotations

import asyncio
import unittest.mock as mock

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from apps.media.models import ExternalID, Game, MediaAsset, MediaItem
from apps.media.services.igdb_ingest import (
    fetch_and_seed_game,
    seed_game_from_igdb,
)

IGDB_ID = 119133


def _run(coro):
    return asyncio.run(coro)


def _game_raw(**overrides):
    raw = {
        "id": IGDB_ID,
        "name": "Hades",
        "slug": "hades",
        "storyline": "Defy the god of the dead as you hack and slash out of Hell.",
        "summary": "A roguelike dungeon crawler from Supergiant Games.",
        "cover": {"image_id": "co1234"},
        "first_release_date": 1600300800,  # 2020-09-17
    }
    raw.update(overrides)
    return raw


class SeedGameFromIgdbTests(TestCase):
    def test_creates_full_hub_game_subtype_and_links(self):
        media_id = seed_game_from_igdb(_game_raw(), IGDB_ID)

        media = MediaItem.objects.get(pk=media_id)
        self.assertEqual(media.media_type, "game")
        self.assertEqual(media.title, "Hades")
        self.assertEqual(media.slug, "hades")
        self.assertEqual(media.overview, _game_raw()["storyline"])
        self.assertEqual(str(media.release_date), "2020-09-17")
        self.assertEqual(media.completeness_score, 0.15)
        self.assertIsNotNone(media.next_sync_at)

        Game.objects.get(media_item_id=media_id)
        ext = ExternalID.objects.get(
            content_type=ContentType.objects.get_for_model(MediaItem),
            provider="igdb",
            media_type="game",
        )
        self.assertEqual(ext.external_id, str(IGDB_ID))
        self.assertEqual(ext.object_id, media_id)
        self.assertTrue(
            MediaAsset.objects.filter(
                media_item=media, asset_type="poster", provider="igdb"
            ).exists()
        )

    def test_igdb_id_already_mapped_returns_early(self):
        media_id = seed_game_from_igdb(_game_raw(), IGDB_ID)
        reseeded = seed_game_from_igdb(
            _game_raw(summary="A totally different summary"), IGDB_ID
        )
        self.assertEqual(reseeded, media_id)
        self.assertEqual(MediaItem.objects.filter(media_type="game").count(), 1)
        self.assertEqual(Game.objects.count(), 1)
        self.assertEqual(ExternalID.objects.filter(provider="igdb").count(), 1)

    def test_same_slug_merges_instead_of_duplicating(self):
        first = seed_game_from_igdb(_game_raw(), IGDB_ID)
        merged = seed_game_from_igdb(
            _game_raw(id=999999, summary="A sequel refresh"), 999999
        )
        self.assertEqual(merged, first)
        self.assertEqual(MediaItem.objects.filter(media_type="game").count(), 1)
        self.assertEqual(Game.objects.count(), 1)
        # Second igdb id attaches to the same media row (mirrors GameMatcher).
        self.assertEqual(
            set(
                ExternalID.objects.filter(provider="igdb").values_list(
                    "external_id", flat=True
                )
            ),
            {"119133", "999999"},
        )

    def test_missing_cover_and_release_date_stay_empty(self):
        media_id = seed_game_from_igdb(
            _game_raw(cover=None, first_release_date=None), IGDB_ID
        )
        media = MediaItem.objects.get(pk=media_id)
        self.assertIsNone(media.release_date)
        self.assertFalse(
            MediaAsset.objects.filter(media_item=media, asset_type="poster").exists()
        )

    def test_unknown_name_and_no_slug_fall_back_safely(self):
        media_id = seed_game_from_igdb(
            {"id": IGDB_ID, "name": "   ", "cover": None}, IGDB_ID
        )
        media = MediaItem.objects.get(pk=media_id)
        self.assertEqual(media.title, "Unknown Game")
        self.assertEqual(media.slug, "unknown-game")
        self.assertIsNone(media.overview)


class FetchAndSeedGameTests(TestCase):
    def test_fetches_through_provider_and_passes_raw_to_seed(self):
        raw = _game_raw()
        provider = mock.Mock()
        provider.get_game = mock.AsyncMock(return_value=raw)
        with mock.patch(
            "apps.media.services.igdb_ingest.seed_game_from_igdb",
            return_value=9876,
        ) as seed:
            result = _run(fetch_and_seed_game(IGDB_ID, provider=provider))

        provider.get_game.assert_awaited_once()
        seed.assert_called_once_with(raw, IGDB_ID)
        self.assertEqual(result, 9876)

    def test_missing_game_raises(self):
        provider = mock.Mock()
        provider.get_game = mock.AsyncMock(return_value=None)
        with self.assertRaises(ValueError):
            _run(fetch_and_seed_game(IGDB_ID, provider=provider))
