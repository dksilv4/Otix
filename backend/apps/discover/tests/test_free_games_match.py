"""Tests for ``POST /discover/free-games/match`` (public).

The desktop aggregator POSTs raw free-game refs; each is matched to a catalog
game via ``ExternalID`` (exact store+id, then the Epic bare-offerId fallback)
or hydrated from IGDB when an unmatched Epic ref carries a title. IGDB is faked
by patching ``apps.media.services.igdb._request`` — the only network seam — so
no request touches Twitch/IGDB. Unmatched non-Epic / title-less refs return
``matched=False`` with a null ``media_item``.
"""

import json
from unittest import mock

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.media.models import ExternalID, Game, MediaItem
from apps.media.services import igdb as igdb_lib

URL = "/api/v1/discover/free-games/match"
IGDB_REQUEST = "apps.media.services.igdb._request"

IGDB_SETTINGS = {"IGDB_CLIENT_ID": "igdb-id", "IGDB_CLIENT_SECRET": "igdb-secret"}

PORTAL_RAW = {
    "id": 12345,
    "name": "Portal",
    "slug": "portal",
    "summary": "Think with portals.",
    "cover": {"image_id": "co1234"},
    "first_release_date": 1199145600,  # 2008-01-01
    "platforms": [{"name": "PC (Microsoft Windows)"}],
}


def _fake_igdb(external_games=None, games=None):
    """Fake the urllib leaf: oauth token + external_games/games POST dispatch."""

    def fake(method, url, **kwargs):
        if "oauth2/token" in url:
            return 200, json.dumps({"access_token": "test-token"})
        if url.endswith("/external_games"):
            return 200, json.dumps(list(external_games or []))
        if url.endswith("/games"):
            return 200, json.dumps(list(games or []))
        raise AssertionError(f"unexpected IGDB request: {url}")

    return fake


def _catalog_game(title: str) -> MediaItem:
    media = MediaItem.objects.create(media_type="game", title=title, slug=title.lower())
    Game.objects.create(media_item=media)
    return media


def _external(media: MediaItem, provider: str, external_id: str) -> None:
    ExternalID.objects.create(
        content_type=ContentType.objects.get_for_model(MediaItem),
        object_id=media.pk,
        provider=provider,
        external_id=external_id,
        media_type="game",
    )


class FreeGamesMatchTests(TestCase):
    def setUp(self):
        igdb_lib.reset_token_cache()

    def post(self, games: list[dict]):
        return APIClient().post(URL, {"games": games}, format="json")

    def test_public_no_auth_required(self):
        resp = self.post([])
        self.assertEqual(resp.status_code, 200)

    def test_empty_games_returns_empty_items(self):
        resp = self.post([])
        self.assertEqual(resp.json(), {"items": []})

    def test_missing_games_400(self):
        resp = APIClient().post(URL, {}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_pre_existing_steam_match_returns_detail(self):
        media = _catalog_game("Portal")
        _external(media, "steam", "400")
        resp = self.post(
            [
                {
                    "store": "steam",
                    "external_id": "400",
                    "title": "Portal",
                    "claim_url": "https://store.steampowered.com/app/400",
                    "store_label": "Steam",
                    "original_price": "$9.99",
                }
            ]
        )
        self.assertEqual(resp.status_code, 200)
        item = resp.json()["items"][0]
        self.assertTrue(item["matched"])
        self.assertEqual(item["store"], "steam")
        self.assertEqual(item["external_id"], "400")
        self.assertEqual(item["store_label"], "Steam")
        self.assertEqual(item["original_price"], "$9.99")
        self.assertEqual(item["claim_url"], "https://store.steampowered.com/app/400")
        self.assertEqual(item["media_item"]["id"], media.pk)
        self.assertEqual(item["media_item"]["title"], "Portal")
        self.assertEqual(item["media_item"]["media_type"], "game")

    def test_epic_namespace_falls_back_to_bare_offer_id(self):
        media = _catalog_game("Hades")
        _external(media, "epic", "abc123")
        resp = self.post(
            [
                {
                    "store": "epic",
                    "external_id": "com.supergiant:abc123",
                    "title": "Hades",
                }
            ]
        )
        item = resp.json()["items"][0]
        self.assertTrue(item["matched"])
        self.assertEqual(item["media_item"]["id"], media.pk)
        self.assertEqual(item["external_id"], "com.supergiant:abc123")

    def test_unmatched_non_epic_returns_no_match(self):
        _catalog_game("Something Else")
        resp = self.post([{"store": "steam", "external_id": "999", "title": "Nothing Here"}])
        item = resp.json()["items"][0]
        self.assertFalse(item["matched"])
        self.assertIsNone(item["media_item"])
        self.assertEqual(item["store"], "steam")
        self.assertEqual(item["external_id"], "999")

    def test_unmatched_epic_without_title_returns_no_match(self):
        resp = self.post([{"store": "epic", "external_id": "abc123"}])
        item = resp.json()["items"][0]
        self.assertFalse(item["matched"])
        self.assertIsNone(item["media_item"])

    @override_settings(**IGDB_SETTINGS)
    def test_unmatched_epic_hydrates_from_igdb(self):
        with mock.patch(
            IGDB_REQUEST,
            side_effect=_fake_igdb(
                external_games=[{"uid": "abc123", "game": 12345}],
                games=[PORTAL_RAW],
            ),
        ):
            resp = self.post([{"store": "epic", "external_id": "abc123", "title": "Portal"}])
        self.assertEqual(resp.status_code, 200)
        item = resp.json()["items"][0]
        self.assertFalse(item["matched"])
        self.assertIsNone(item["media_item"])
        from apps.integrations.models import SyncJob

        self.assertTrue(
            SyncJob.objects.filter(
                provider="igdb", entity_type="game", external_id="12345"
            ).exists()
        )
