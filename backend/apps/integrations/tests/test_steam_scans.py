"""Endpoint + service tests for the Steam library/wishlist scans.

``POST /integrations/steam/scan`` and ``/steam/wishlist/scan`` fetch the user's
owned games (Steam Web API) / wishlist (Steam Store) through the module
``_request`` leaf (the only mocked seam), upsert ``UserSteamGame`` /
``UserSteamWishlist`` rows, and count how many appids already match a catalog
game via a ``steam`` ``ExternalID``. Covered: guard 400/503, match counting,
row upsert + update idempotency, private/empty profiles, network/non-200 → 500.
"""

import json
import urllib.error
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.integrations.models import UserSteamGame, UserSteamWishlist
from apps.media.models import ExternalID, Game, MediaItem

User = get_user_model()

REQUEST = "apps.integrations.services.steam._request"

OWNED_GAMES = {
    "response": {
        "game_count": 2,
        "games": [
            {
                "appid": 440,
                "name": "Team Fortress 2",
                "playtime_forever": 1000,
                "playtime_2weeks": 50,
                "img_icon_url": "icon_440",
                "img_logo_url": "logo_440",
                "rtime_last_played": 1600000000,
            },
            {
                "appid": 730,
                "name": "Counter-Strike 2",
                "playtime_forever": 500,
                "playtime_2weeks": 10,
            },
        ],
    }
}

WISHLIST = {
    "570": {"name": "Dota 2", "priority": 0, "added": 1500000000, "is_free_game": True},
    "242550": {"name": "Path of Exile", "priority": 3, "added": 1400000000},
}


def _catalog_game(app_id: int, title: str):
    media = MediaItem.objects.create(media_type="game", title=title, slug=title.lower())
    Game.objects.create(media_item=media)
    ExternalID.objects.create(
        content_type=ContentType.objects.get_for_model(MediaItem),
        object_id=media.pk,
        provider="steam",
        external_id=str(app_id),
        media_type="game",
    )
    return media


class SteamScanTestBase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="pw")
        self.user.steam_id = "76561198000000000"
        self.user.save(update_fields=("steam_id",))
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")


@override_settings(STEAM_API_KEY="test-key")
class SteamLibraryScanTests(SteamScanTestBase):
    URL = "/api/v1/integrations/steam/scan"

    def post(self):
        return self.client.post(self.URL, {}, format="json")

    def _fake(self, status=200, body=None):
        return mock.patch(
            REQUEST,
            return_value=(status, body if body is not None else json.dumps(OWNED_GAMES)),
        )

    def test_unauthenticated_401(self):
        resp = APIClient().post(self.URL, {}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_no_steam_account_400(self):
        self.user.steam_id = None
        self.user.save(update_fields=("steam_id",))
        with mock.patch(REQUEST) as request:
            resp = self.post()
        request.assert_not_called()
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["detail"], "No Steam account linked")

    def test_no_api_key_503(self):
        with override_settings(STEAM_API_KEY=""):
            with mock.patch(REQUEST) as request:
                resp = self.post()
        request.assert_not_called()
        self.assertEqual(resp.status_code, 503)
        self.assertEqual(resp.json()["detail"], "Steam API key not configured")

    def test_scan_upserts_rows_and_counts_matches(self):
        matched_game = _catalog_game(440, "Team Fortress 2")
        with self._fake():
            resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            {"total_in_steam": 2, "matched_in_otix": 1, "resolved": 0, "synced": 0, "failed": 1},
        )
        rows = {row.steam_app_id: row for row in UserSteamGame.objects.filter(user=self.user)}
        self.assertEqual(set(rows), {440, 730})
        self.assertEqual(rows[440].media_item_id, matched_game.pk)
        self.assertEqual(rows[440].name, "Team Fortress 2")
        self.assertEqual(rows[440].playtime_forever, 1000)
        self.assertEqual(rows[440].playtime_2weeks, 50)
        self.assertEqual(rows[440].img_icon_url, "icon_440")
        self.assertEqual(rows[440].rtime_last_played, 1600000000)
        self.assertIsNone(rows[730].media_item_id)
        self.assertEqual(rows[730].name, "Counter-Strike 2")

    def test_scan_updates_existing_row_idempotently(self):
        _catalog_game(440, "Team Fortress 2")
        updated = json.loads(json.dumps(OWNED_GAMES))
        updated["response"]["games"][0]["playtime_forever"] = 2000
        with self._fake(body=json.dumps(updated)):
            first = self.post()
            second = self.post()
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["matched_in_otix"], 1)
        self.assertEqual(UserSteamGame.objects.filter(user=self.user).count(), 2)
        row = UserSteamGame.objects.get(user=self.user, steam_app_id=440)
        self.assertEqual(row.playtime_forever, 2000)

    def test_private_profile_returns_zeros(self):
        with self._fake(status=403, body="{}"):
            resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            {"total_in_steam": 0, "matched_in_otix": 0, "resolved": 0, "synced": 0, "failed": 0},
        )
        self.assertEqual(UserSteamGame.objects.filter(user=self.user).count(), 0)

    def test_empty_library_returns_zeros(self):
        empty = json.loads(json.dumps(OWNED_GAMES))
        empty["response"] = {"game_count": 0}
        with self._fake(body=json.dumps(empty)):
            resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["total_in_steam"], 0)

    def test_network_failure_500(self):
        with (
            mock.patch("apps.integrations.views.steam.logger.exception"),
            mock.patch(REQUEST, side_effect=urllib.error.URLError("down")),
        ):
            resp = self.post()
        self.assertEqual(resp.status_code, 500)
        self.assertEqual(resp.json()["detail"], "Failed to scan Steam library. Please try again.")
        self.assertEqual(UserSteamGame.objects.filter(user=self.user).count(), 0)

    def test_unexpected_status_500(self):
        with (
            mock.patch("apps.integrations.views.steam.logger.exception"),
            self._fake(status=500, body="oops"),
        ):
            resp = self.post()
        self.assertEqual(resp.status_code, 500)
        self.assertEqual(resp.json()["detail"], "Failed to scan Steam library. Please try again.")


@override_settings(STEAM_API_KEY="test-key")
class SteamWishlistScanTests(SteamScanTestBase):
    URL = "/api/v1/integrations/steam/wishlist/scan"

    def post(self):
        return self.client.post(self.URL, {}, format="json")

    def _fake(self, status=200, body=None):
        return mock.patch(
            REQUEST,
            return_value=(status, body if body is not None else json.dumps(WISHLIST)),
        )

    def test_unauthenticated_401(self):
        resp = APIClient().post(self.URL, {}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_no_steam_account_400(self):
        self.user.steam_id = None
        self.user.save(update_fields=("steam_id",))
        with mock.patch(REQUEST) as request:
            resp = self.post()
        request.assert_not_called()
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["detail"], "No Steam account linked")

    def test_no_api_key_503(self):
        with override_settings(STEAM_API_KEY=""):
            resp = self.post()
        self.assertEqual(resp.status_code, 503)

    def test_scan_upserts_rows_and_counts_matches(self):
        matched_game = _catalog_game(570, "Dota 2")
        with self._fake():
            resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"total": 2, "matched": 1, "private": False})
        rows = {row.steam_app_id: row for row in UserSteamWishlist.objects.filter(user=self.user)}
        self.assertEqual(set(rows), {570, 242550})
        self.assertEqual(rows[570].media_item_id, matched_game.pk)
        self.assertEqual(rows[570].name, "Dota 2")
        self.assertEqual(rows[570].priority, 0)
        self.assertEqual(rows[570].added_date, 1500000000)
        self.assertTrue(rows[570].is_free)
        self.assertIsNone(rows[242550].media_item_id)
        self.assertEqual(rows[242550].added_date, 1400000000)

    def test_re_scan_updates_without_duplicates(self):
        _catalog_game(570, "Dota 2")
        with self._fake():
            self.post()
            self.post()
        self.assertEqual(UserSteamWishlist.objects.filter(user=self.user).count(), 2)

    def test_private_wishlist_html_returns_private(self):
        with self._fake(body="<!DOCTYPE html><html><body>login</body></html>"):
            resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"total": 0, "matched": 0, "private": True})

    def test_private_wishlist_redirect_status_returns_private(self):
        with self._fake(status=302, body=""):
            resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"total": 0, "matched": 0, "private": True})

    def test_private_wishlist_403_returns_private(self):
        with self._fake(status=403, body=""):
            resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"total": 0, "matched": 0, "private": True})

    def test_non_json_returns_private(self):
        with self._fake(body="definitely not json"):
            resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"total": 0, "matched": 0, "private": True})

    def test_network_failure_500(self):
        with (
            mock.patch("apps.integrations.views.steam.logger.exception"),
            mock.patch(REQUEST, side_effect=urllib.error.URLError("down")),
        ):
            resp = self.post()
        self.assertEqual(resp.status_code, 500)
        self.assertEqual(resp.json()["detail"], "Failed to scan Steam wishlist. Please try again.")

    def test_unexpected_status_500(self):
        with (
            mock.patch("apps.integrations.views.steam.logger.exception"),
            self._fake(status=500, body="oops"),
        ):
            resp = self.post()
        self.assertEqual(resp.status_code, 500)
