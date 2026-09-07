"""Roundtrip tests for the SteamGrid artwork attach service.

Covers ``apps.media.services.steamgrid_artwork``: the pure-DB attach
(``attach_steamgrid_assets``) is exercised as a sync ``TestCase`` against the
real (test) database, and the async fetch driver
(``fetch_and_attach_game_artwork``) has its sync attach stubbed out — the
service runs its DB write via ``sync_to_async`` on a worker-thread connection
that escapes ``TestCase``'s per-test rollback, so the async test must not touch
the DB (the sync attach's own DB behavior is covered by the sync ``TestCase``
methods above it).
"""

from __future__ import annotations

import asyncio
import unittest.mock as mock

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from apps.media.models import ExternalID, MediaAsset, MediaItem
from apps.media.services.steamgrid_artwork import (
    _media_title,
    _pick_search_match,
    _stored_steamgrid_game_id,
    attach_steamgrid_assets,
    fetch_and_attach_game_artwork,
)

SGDB_GAME_ID = 4321
STEAM_APP_ID = 1145360


def _run(coro):
    return asyncio.run(coro)


def _media():
    return MediaItem.objects.create(
        media_type="game", title="Hades", slug="hades"
    )


class AttachSteamgridAssetsTests(TestCase):
    def _assets(self):
        return MediaAsset.objects.filter(provider="steamgrid")

    def test_maps_hero_logo_icon_to_asset_types_and_labels(self):
        media = _media()
        added = attach_steamgrid_assets(
            media.pk,
            SGDB_GAME_ID,
            grids=[],
            heroes=[{"url": "h1", "style": "material", "width": 1920, "height": 800}],
            logos=[{"url": "l1", "style": "official", "language": "eng"}],
            icons=[{"url": "i1", "style": "custom"}],
        )

        self.assertEqual(added, 3)
        rows = {a.asset_type: a for a in self._assets()}
        self.assertEqual(
            set(rows),
            {"backdrop", "logo", "icon"},
        )
        self.assertEqual(rows["backdrop"].style, "material")
        self.assertEqual(rows["backdrop"].label, "material")
        self.assertEqual(rows["backdrop"].width, 1920)
        self.assertEqual(rows["backdrop"].height, 800)
        self.assertEqual(rows["logo"].label, "multicolor")
        self.assertEqual(rows["icon"].label, "custom")

    def test_no_logo_grid_duplicates_as_textless_poster(self):
        media = _media()
        attach_steamgrid_assets(
            media.pk,
            SGDB_GAME_ID,
            grids=[
                {"url": "g1", "style": "no_logo", "language": "eng"},
                {"url": "g2", "style": "material"},
            ],
            heroes=[],
            logos=[],
            icons=[],
        )

        self.assertEqual(self._assets().count(), 4)  # 2 posters + 2 textless
        for url in ("g1", "g2"):
            self.assertTrue(
                self._assets().filter(url=url, asset_type="poster").exists()
            )
            self.assertTrue(
                self._assets().filter(url=url, asset_type="textless_poster").exists()
            )

    def test_other_grid_styles_do_not_duplicate(self):
        media = _media()
        attach_steamgrid_assets(
            media.pk,
            SGDB_GAME_ID,
            grids=[{"url": "g1", "style": "alternate"}],
            heroes=[],
            logos=[],
            icons=[],
        )

        self.assertEqual(self._assets().count(), 1)
        poster = self._assets().get()
        self.assertEqual(poster.asset_type, "poster")
        self.assertEqual(poster.label, "alternate")

    def test_attach_is_idempotent_and_backfills_missing_lang(self):
        media = _media()
        attach_steamgrid_assets(
            media.pk,
            SGDB_GAME_ID,
            grids=[{"url": "g1", "style": "white"}],
            heroes=[],
            logos=[],
            icons=[],
        )
        added = attach_steamgrid_assets(
            media.pk,
            SGDB_GAME_ID,
            grids=[{"url": "g1", "style": "white", "language": "english"}],
            heroes=[],
            logos=[],
            icons=[],
        )

        self.assertEqual(added, 0)
        self.assertEqual(self._assets().count(), 1)
        poster = self._assets().get()
        self.assertEqual(poster.lang, "english")

    def test_entries_without_url_are_dropped(self):
        media = _media()
        added = attach_steamgrid_assets(
            media.pk,
            SGDB_GAME_ID,
            grids=[{"style": "no_logo"}, {"url": "", "style": "white"}],
            heroes=[],
            logos=[],
            icons=[],
        )

        self.assertEqual(added, 0)
        self.assertFalse(self._assets().exists())

    def test_steamgrid_external_id_is_backfilled(self):
        media = _media()
        attach_steamgrid_assets(
            media.pk,
            SGDB_GAME_ID,
            grids=[],
            heroes=[{"url": "h1", "style": "blurred"}],
            logos=[],
            icons=[],
        )

        ext = ExternalID.objects.get(
            provider="steamgrid", media_type="game", external_id=str(SGDB_GAME_ID)
        )
        self.assertEqual(ext.object_id, media.pk)


class FetchAndAttachGameArtworkTests(TestCase):
    """Async driver: resolution (stored-id reuse / steam / name fallback) + attach.

    The two DB-backed resolution helpers run through ``sync_to_async`` on a worker
    thread, where a ``TestCase`` transaction isn't visible, so they're stubbed to
    keep each branch deterministic; their real DB reads are covered by
    ``SteamgridResolutionHelpersTests`` below.
    """

    def setUp(self):
        self.media = _media()

    def _provider(self, *, game=None, candidates=None, **asset_overrides):
        provider = mock.Mock()
        provider.get_game_by_steam_app_id = mock.AsyncMock(return_value=game)
        provider.search_games = mock.AsyncMock(return_value=candidates or [])
        provider.get_grids = mock.AsyncMock(return_value=[{"url": "g1"}])
        provider.get_heroes = mock.AsyncMock(return_value=[{"url": "h1"}])
        provider.get_logos = mock.AsyncMock(return_value=[])
        provider.get_icons = mock.AsyncMock(return_value=[{"url": "i1"}])
        for name, value in asset_overrides.items():
            setattr(provider, name, value)
        return provider

    def _resolution_patches(self, *, stored_id=None, title="Hades"):
        stored = mock.patch(
            "apps.media.services.steamgrid_artwork._stored_steamgrid_game_id",
            return_value=stored_id,
        )
        title_getter = mock.patch(
            "apps.media.services.steamgrid_artwork._media_title", return_value=title
        )
        return stored, title_getter

    def test_fetches_families_and_attaches(self):
        provider = self._provider(game={"id": SGDB_GAME_ID})
        with mock.patch(
            "apps.media.services.steamgrid_artwork.attach_steamgrid_assets",
            return_value=3,
        ) as attach:
            result = _run(
                fetch_and_attach_game_artwork(
                    self.media.pk, STEAM_APP_ID, provider=provider
                )
            )

        provider.get_game_by_steam_app_id.assert_awaited_once_with(STEAM_APP_ID)
        provider.search_games.assert_not_called()
        for getter in (
            provider.get_grids,
            provider.get_heroes,
            provider.get_logos,
            provider.get_icons,
        ):
            getter.assert_awaited_once_with(SGDB_GAME_ID)
        attach.assert_called_once_with(
            self.media.pk,
            SGDB_GAME_ID,
            [{"url": "g1"}],
            [{"url": "h1"}],
            [],
            [{"url": "i1"}],
        )
        self.assertEqual(result["sgdb_game_id"], SGDB_GAME_ID)
        self.assertTrue(result["attached"])
        self.assertEqual(result["assets_added"], 3)
        self.assertEqual(result["resolved_by"], "steam")

    def test_steam_lookup_miss_falls_back_to_exact_title_search(self):
        provider = self._provider(
            game=None,
            candidates=[
                {"id": 5, "name": "Hades II"},
                {"id": SGDB_GAME_ID, "name": "Hades"},
            ],
        )
        stored, title_getter = self._resolution_patches(stored_id=None)
        with stored, title_getter, mock.patch(
            "apps.media.services.steamgrid_artwork.attach_steamgrid_assets",
            return_value=1,
        ) as attach:
            result = _run(
                fetch_and_attach_game_artwork(
                    self.media.pk, STEAM_APP_ID, provider=provider
                )
            )

        provider.search_games.assert_awaited_once_with("Hades")
        # The exact "Hades" hit wins over the prefix "Hades II" candidate.
        provider.get_grids.assert_awaited_once_with(SGDB_GAME_ID)
        attach.assert_called_once_with(
            self.media.pk,
            SGDB_GAME_ID,
            [{"url": "g1"}],
            [{"url": "h1"}],
            [],
            [{"url": "i1"}],
        )
        self.assertEqual(result["sgdb_game_id"], SGDB_GAME_ID)
        self.assertTrue(result["attached"])
        self.assertEqual(result["resolved_by"], "name")

    def test_stored_steamgrid_id_reused_without_platform_lookup(self):
        provider = self._provider()
        stored, title_getter = self._resolution_patches(stored_id=SGDB_GAME_ID)
        with stored, title_getter, mock.patch(
            "apps.media.services.steamgrid_artwork.attach_steamgrid_assets",
            return_value=2,
        ) as attach:
            result = _run(
                fetch_and_attach_game_artwork(
                    self.media.pk, STEAM_APP_ID, provider=provider
                )
            )

        provider.get_game_by_steam_app_id.assert_not_called()
        provider.search_games.assert_not_called()
        provider.get_grids.assert_awaited_once_with(SGDB_GAME_ID)
        attach.assert_called_once_with(
            self.media.pk,
            SGDB_GAME_ID,
            [{"url": "g1"}],
            [{"url": "h1"}],
            [],
            [{"url": "i1"}],
        )
        self.assertEqual(result["sgdb_game_id"], SGDB_GAME_ID)
        self.assertTrue(result["attached"])
        self.assertEqual(result["resolved_by"], "steamgrid")

    def test_no_steamgrid_entry_at_all_is_benign_noop(self):
        provider = self._provider(game=None, candidates=[])
        stored, title_getter = self._resolution_patches(stored_id=None)
        with stored, title_getter, mock.patch(
            "apps.media.services.steamgrid_artwork.attach_steamgrid_assets"
        ) as attach:
            result = _run(
                fetch_and_attach_game_artwork(
                    self.media.pk, STEAM_APP_ID, provider=provider
                )
            )

        provider.search_games.assert_awaited_once_with("Hades")
        attach.assert_not_called()
        self.assertIsNone(result["sgdb_game_id"])
        self.assertFalse(result["attached"])
        self.assertEqual(result["assets_added"], 0)
        self.assertEqual(result["resolved_by"], "name")


class SteamgridResolutionHelpersTests(TestCase):
    """Sync DB reads + the pure match picker the async driver relies on."""

    def _media_ct(self):
        return ContentType.objects.get_for_model(MediaItem)

    def test_stored_steamgrid_id_reads_back_a_backfilled_external_id(self):
        media = _media()
        self.assertIsNone(_stored_steamgrid_game_id(media.pk))
        ExternalID.objects.create(
            content_type=self._media_ct(),
            object_id=media.pk,
            provider="steamgrid",
            external_id=str(SGDB_GAME_ID),
            media_type="game",
        )
        self.assertEqual(_stored_steamgrid_game_id(media.pk), SGDB_GAME_ID)
        self.assertIsNone(_stored_steamgrid_game_id(media.pk + 1000))

    def test_media_title_reads_the_catalog_title(self):
        media = _media()
        self.assertEqual(_media_title(media.pk), "Hades")
        self.assertIsNone(_media_title(media.pk + 1000))

    def test_pick_search_match_prefers_exact_title_over_prefix(self):
        candidates = [
            {"id": 5, "name": "Hades II"},
            {"id": SGDB_GAME_ID, "name": "Hades"},
        ]
        hit = _pick_search_match(candidates, "Hades")
        self.assertEqual(hit["id"], SGDB_GAME_ID)
        self.assertIsNone(_pick_search_match([], "Hades"))

    def test_pick_search_match_is_case_and_punctuation_insensitive(self):
        candidates = [{"id": 7, "name": "Hades"}]
        hit = _pick_search_match(candidates, "hades!")
        self.assertEqual(hit["id"], 7)
