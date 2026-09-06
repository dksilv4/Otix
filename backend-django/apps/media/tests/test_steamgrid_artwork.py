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

from django.test import TestCase

from apps.media.models import ExternalID, MediaAsset, MediaItem
from apps.media.services.steamgrid_artwork import (
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
    def test_fetches_families_and_attaches(self):
        media = _media()
        provider = mock.Mock()
        provider.get_game_by_steam_app_id = mock.AsyncMock(
            return_value={"id": SGDB_GAME_ID}
        )
        provider.get_grids = mock.AsyncMock(return_value=[{"url": "g1"}])
        provider.get_heroes = mock.AsyncMock(return_value=[{"url": "h1"}])
        provider.get_logos = mock.AsyncMock(return_value=[])
        provider.get_icons = mock.AsyncMock(return_value=[{"url": "i1"}])
        with mock.patch(
            "apps.media.services.steamgrid_artwork.attach_steamgrid_assets",
            return_value=3,
        ) as attach:
            result = _run(
                fetch_and_attach_game_artwork(
                    media.pk, STEAM_APP_ID, provider=provider
                )
            )

        provider.get_game_by_steam_app_id.assert_awaited_once_with(STEAM_APP_ID)
        for getter in (
            provider.get_grids,
            provider.get_heroes,
            provider.get_logos,
            provider.get_icons,
        ):
            getter.assert_awaited_once_with(SGDB_GAME_ID)
        attach.assert_called_once_with(
            media.pk,
            SGDB_GAME_ID,
            [{"url": "g1"}],
            [{"url": "h1"}],
            [],
            [{"url": "i1"}],
        )
        self.assertEqual(result["sgdb_game_id"], SGDB_GAME_ID)
        self.assertTrue(result["attached"])
        self.assertEqual(result["assets_added"], 3)

    def test_missing_sgdb_game_is_benign_noop(self):
        media = _media()
        provider = mock.Mock()
        provider.get_game_by_steam_app_id = mock.AsyncMock(return_value=None)
        with mock.patch(
            "apps.media.services.steamgrid_artwork.attach_steamgrid_assets"
        ) as attach:
            result = _run(
                fetch_and_attach_game_artwork(
                    media.pk, STEAM_APP_ID, provider=provider
                )
            )

        attach.assert_not_called()
        self.assertIsNone(result["sgdb_game_id"])
        self.assertFalse(result["attached"])
        self.assertEqual(result["assets_added"], 0)
