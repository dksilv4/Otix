"""Endpoint tests for ``POST /integrations/steam/resolve-unmatched``.

Covers the view guards (400 no steam account / 503 IGDB not configured / 500
wrap) and the GameMatcher-backed resolve flow: unmatched ``UserSteamGame`` rows
are run through the matcher whose IGDB stages are faked by patching
``apps.media.services.igdb._request`` — the only network seam, so nothing
touches Twitch/IGDB. ``resolved`` counts matches to pre-existing catalog rows
(phase-1 direct external-id), ``synced`` counts freshly IGDB-seeded rows.
"""

import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.integrations.models import UserSteamGame
from apps.media.models import ExternalID, Game, MediaItem
from apps.media.services import igdb as igdb_lib

User = get_user_model()

IGDB_REQUEST = "apps.media.services.igdb._request"
URL = "/api/v1/integrations/steam/resolve-unmatched"

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


def _catalog_steam_game(app_id: int, title: str) -> MediaItem:
    media = _catalog_game(title)
    ExternalID.objects.create(
        content_type=ContentType.objects.get_for_model(MediaItem),
        object_id=media.pk,
        provider="steam",
        external_id=str(app_id),
        media_type="game",
    )
    return media


class SteamResolveUnmatchedTests(TestCase):
    def setUp(self):
        igdb_lib.reset_token_cache()
        self.user = User.objects.create_user(username="alice", password="pw")
        self.user.steam_id = "76561198000000000"
        self.user.save(update_fields=("steam_id",))
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def _unmatched(self, app_id: int, name: str) -> UserSteamGame:
        return UserSteamGame.objects.create(
            user=self.user, steam_app_id=app_id, name=name
        )

    def post(self):
        return self.client.post(URL, {}, format="json")

    def test_unauthenticated_401(self):
        resp = APIClient().post(URL, {}, format="json")
        self.assertEqual(resp.status_code, 401)

    @override_settings(**IGDB_SETTINGS)
    def test_no_steam_account_400(self):
        self.user.steam_id = None
        self.user.save(update_fields=("steam_id",))
        with mock.patch(IGDB_REQUEST) as request:
            resp = self.post()
        request.assert_not_called()
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["detail"], "No Steam account linked")

    @override_settings(IGDB_CLIENT_ID="", IGDB_CLIENT_SECRET="")
    def test_igdb_not_configured_503(self):
        with mock.patch(IGDB_REQUEST) as request:
            resp = self.post()
        request.assert_not_called()
        self.assertEqual(resp.status_code, 503)
        self.assertEqual(resp.json()["detail"], "IGDB not configured")

    @override_settings(**IGDB_SETTINGS)
    def test_existing_steam_external_resolves_phase1(self):
        media = _catalog_steam_game(440, "Team Fortress 2")
        self._unmatched(440, "Team Fortress 2")
        with mock.patch(IGDB_REQUEST) as request:
            resp = self.post()
        request.assert_not_called()  # phase-1 direct match, no IGDB needed
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(), {"resolved": 1, "synced": 0, "failed": 0, "total": 1}
        )
        row = UserSteamGame.objects.get(user=self.user, steam_app_id=440)
        self.assertEqual(row.media_item_id, media.pk)

    @override_settings(**IGDB_SETTINGS)
    def test_crossref_seeds_new_game_synced(self):
        self._unmatched(440, "Portal")
        with mock.patch(
            IGDB_REQUEST,
            side_effect=_fake_igdb(
                external_games=[{"uid": "440", "game": 12345}],
                games=[PORTAL_RAW],
            ),
        ):
            resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(), {"resolved": 0, "synced": 1, "failed": 0, "total": 1}
        )
        row = UserSteamGame.objects.get(user=self.user, steam_app_id=440)
        self.assertIsNotNone(row.media_item_id)
        media = MediaItem.objects.get(pk=row.media_item_id)
        self.assertEqual(media.title, "Portal")
        self.assertTrue(Game.objects.filter(media_item_id=media.pk).exists())
        providers = set(
            ExternalID.objects.filter(object_id=media.pk).values_list("provider", flat=True)
        )
        self.assertIn("igdb", providers)
        self.assertIn("steam", providers)

    @override_settings(**IGDB_SETTINGS)
    def test_no_igdb_hit_counts_failed(self):
        self._unmatched(730, "Counter-Strike 2")
        with mock.patch(
            IGDB_REQUEST, side_effect=_fake_igdb(external_games=[], games=[])
        ):
            resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(), {"resolved": 0, "synced": 0, "failed": 1, "total": 1}
        )
        row = UserSteamGame.objects.get(user=self.user, steam_app_id=730)
        self.assertIsNone(row.media_item_id)

    @override_settings(**IGDB_SETTINGS)
    def test_service_failure_500(self):
        self._unmatched(440, "Portal")
        with mock.patch(
            "apps.integrations.views.steam.integrations_services.resolve_unmatched_steam_games",
            side_effect=RuntimeError("boom"),
        ):
            resp = self.post()
        self.assertEqual(resp.status_code, 500)
        self.assertEqual(
            resp.json()["detail"], "Failed to resolve unmatched game. Please try again."
        )

    @override_settings(**IGDB_SETTINGS)
    def test_no_unmatched_rows_returns_zeros(self):
        _catalog_game("Already Linked")
        UserSteamGame.objects.create(
            user=self.user,
            steam_app_id=440,
            name="Already Linked",
            media_item_id=MediaItem.objects.get().pk,
        )
        resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(), {"resolved": 0, "synced": 0, "failed": 0, "total": 0}
        )
