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

from apps.company.models import Company, InvolvedCompany
from apps.media.models import (
    ExternalID,
    Game,
    GameMode,
    Genre,
    MediaAsset,
    MediaGameMode,
    MediaGenre,
    MediaItem,
    MediaPlatform,
    Platform,
)
from apps.media.services.igdb_ingest import (
    GAME_HYDRATION_FIELDS,
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


def _full_game_raw(**overrides):
    """A hydration payload: the minimal seed fields plus the growth vocabulary."""
    raw = _game_raw(
        status=0,
        game_type="main_game",
        parent_game={"id": 2, "name": "Hades II"},
        franchise={"id": 1, "name": "Hades"},
        websites=[
            {"url": "https://www.supergiantgames.com/games/hades/", "type": 1},
            {"url": "https://store.steampowered.com/app/1145360", "type": 13},
        ],
        platforms=[{"id": 6, "name": "PC (Microsoft Windows)"}, {"name": "Nintendo Switch"}],
        genres=[{"name": "Role-playing (RPG)"}, {"name": "Hack and slash"}],
        game_modes=[{"name": "Single player"}, {"name": "Co-operative"}],
        involved_companies=[
            {
                "developer": True,
                "publisher": False,
                "porting": False,
                "supporting": False,
                "company": {"id": 1, "name": "Supergiant Games", "slug": "supergiant-games"},
            },
            {
                "developer": False,
                "publisher": True,
                "porting": False,
                "supporting": False,
                "company": {"id": 2, "name": "Private Division", "slug": "private-division"},
            },
        ],
    )
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
        # Recompute at the seed tail: overview/poster/release_date/external_ids/
        # assets satisfied = 5/20 flags.
        self.assertEqual(media.completeness_score, 0.25)
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

        provider.get_game.assert_awaited_once_with(IGDB_ID, GAME_HYDRATION_FIELDS)
        seed.assert_called_once_with(raw, IGDB_ID)
        self.assertEqual(result, 9876)

    def test_missing_game_raises(self):
        provider = mock.Mock()
        provider.get_game = mock.AsyncMock(return_value=None)
        with self.assertRaises(ValueError):
            _run(fetch_and_seed_game(IGDB_ID, provider=provider))


class HydrateGameFromIgdbTests(TestCase):
    """The increment-50 full-hydration fold (genres/platforms/modes/companies +
    Game growth fields), asserted on a real seed into the test DB."""

    def test_full_seed_links_vocabulary_and_sets_growth_fields(self):
        media_id = seed_game_from_igdb(_full_game_raw(), IGDB_ID)
        game = Game.objects.get(media_item_id=media_id)

        self.assertEqual(
            set(Genre.objects.values_list("name", flat=True)),
            {"Role-playing (RPG)", "Hack and slash"},
        )
        linked_genres = set(
            MediaGenre.objects.filter(media_item_id=media_id).values_list("genre_id", flat=True)
        )
        self.assertEqual(linked_genres, set(Genre.objects.values_list("pk", flat=True)))
        self.assertEqual(
            Platform.objects.get(slug="windows").name, "PC (Microsoft Windows)"
        )
        self.assertEqual(
            Platform.objects.get(slug="nintendo-switch").name, "Nintendo Switch"
        )
        self.assertEqual(MediaPlatform.objects.filter(media_item_id=media_id).count(), 2)
        self.assertEqual(MediaGameMode.objects.filter(media_item_id=media_id).count(), 2)
        self.assertTrue(game.has_multiplayer)

        self.assertEqual(game.release_status, "released")
        self.assertEqual(game.game_type, "main_game")
        self.assertEqual(game.parent_game_title, "Hades II")
        self.assertEqual(game.website, "https://www.supergiantgames.com/games/hades/")
        self.assertEqual(game.franchise.name, "Hades")

        supergiant = InvolvedCompany.objects.get(
            media_item_id=media_id, company__name="Supergiant Games"
        )
        self.assertTrue(supergiant.developer)
        self.assertFalse(supergiant.publisher)
        private = InvolvedCompany.objects.get(
            media_item_id=media_id, company__name="Private Division"
        )
        self.assertTrue(private.publisher)

    def test_mapped_reseed_grows_a_previously_minimal_row(self):
        first = seed_game_from_igdb(_game_raw(), IGDB_ID)
        self.assertEqual(MediaGenre.objects.filter(media_item_id=first).count(), 0)

        reseeded = seed_game_from_igdb(_full_game_raw(), IGDB_ID)

        self.assertEqual(reseeded, first)
        self.assertEqual(MediaItem.objects.filter(media_type="game").count(), 1)
        self.assertEqual(MediaGenre.objects.filter(media_item_id=first).count(), 2)
        self.assertEqual(MediaPlatform.objects.filter(media_item_id=first).count(), 2)
        game = Game.objects.get(media_item_id=first)
        self.assertTrue(game.has_multiplayer)

    def test_role_flags_on_one_company_produce_one_involved_row(self):
        raw = _full_game_raw(
            involved_companies=[
                {
                    "developer": True,
                    "publisher": True,
                    "porting": False,
                    "supporting": False,
                    "company": {"id": 9, "name": "Supergiant Games", "slug": "supergiant-games"},
                }
            ]
        )
        media_id = seed_game_from_igdb(raw, IGDB_ID)
        seed_game_from_igdb(raw, IGDB_ID)  # re-seed: add-only

        self.assertEqual(Company.objects.filter(name="Supergiant Games").count(), 1)
        rows = InvolvedCompany.objects.filter(media_item_id=media_id)
        self.assertEqual(rows.count(), 1)
        self.assertTrue(rows.get().developer)
        self.assertTrue(rows.get().publisher)

    def test_reseed_upgrades_a_role_flag_in_place(self):
        publisher_only = _full_game_raw(
            involved_companies=[
                {
                    "developer": False,
                    "publisher": True,
                    "porting": False,
                    "supporting": False,
                    "company": {"id": 9, "name": "Supergiant Games", "slug": "supergiant-games"},
                }
            ]
        )
        media_id = seed_game_from_igdb(publisher_only, IGDB_ID)

        seed_game_from_igdb(_full_game_raw(), IGDB_ID)  # adds developer on re-seed

        row = InvolvedCompany.objects.get(
            media_item_id=media_id, company__slug="supergiant-games"
        )
        self.assertTrue(row.developer)
        self.assertTrue(row.publisher)
        self.assertFalse(row.porting)
        self.assertFalse(row.supporting)

    def test_single_player_modes_leave_multiplayer_false(self):
        raw = _full_game_raw(game_modes=[{"name": "Single player"}])
        media_id = seed_game_from_igdb(raw, IGDB_ID)
        game = Game.objects.get(media_item_id=media_id)
        self.assertFalse(game.has_multiplayer)
        self.assertEqual(MediaGameMode.objects.filter(media_item_id=media_id).count(), 1)
        mode = GameMode.objects.get(slug="single-player")
        self.assertEqual(mode.name, "Single player")

    def test_unknown_platform_gets_a_slugified_slug(self):
        raw = _full_game_raw(platforms=[{"name": "Amiga CD32"}])
        media_id = seed_game_from_igdb(raw, IGDB_ID)
        platform = MediaPlatform.objects.get(media_item_id=media_id).platform
        self.assertEqual(platform.slug, "amiga-cd32")
        self.assertEqual(platform.name, "Amiga CD32")

    def test_minimal_raw_hydrates_nothing(self):
        media_id = seed_game_from_igdb(_game_raw(), IGDB_ID)
        game = Game.objects.get(media_item_id=media_id)
        self.assertEqual(MediaGenre.objects.filter(media_item_id=media_id).count(), 0)
        self.assertEqual(MediaPlatform.objects.filter(media_item_id=media_id).count(), 0)
        self.assertEqual(MediaGameMode.objects.filter(media_item_id=media_id).count(), 0)
        self.assertEqual(InvolvedCompany.objects.filter(media_item_id=media_id).count(), 0)
        self.assertFalse(game.has_multiplayer)
        self.assertIsNone(game.release_status)
        self.assertIsNone(game.website)
        self.assertIsNone(game.franchise)
