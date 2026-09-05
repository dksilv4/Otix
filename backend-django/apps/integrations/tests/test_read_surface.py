"""Endpoint tests for the integrations read/library-state surface (DRF).

Exercises the ported pure-DB Plex + Steam routes over the stored
``UserPlex*``/``UserSteamGame`` rows:

- ``GET /integrations/plex/connect-info/{media_item_id}``
- ``GET /integrations/plex/libraries``
- ``GET /integrations/steam/owned-appids``

The Plex tv alt-URL fetch is best-effort outbound; tests either leave the user
without a ``plex_auth_token`` (no call) or patch the service leaf.
"""

from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.integrations import services as integrations_services
from apps.integrations.models import (
    UserPlexItem,
    UserPlexLibrary,
    UserPlexServer,
    UserSteamGame,
)
from apps.media.models import MediaItem

User = get_user_model()


class _ApiTestBase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="a-strong-pass")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")


def _make_media(title: str = "Interstellar") -> MediaItem:
    return MediaItem.objects.create(media_type="movie", title=title, slug=title.lower())


def _make_server(
    user, name="NAS", base_url="http://192.168.1.10:32400", token="srv-tok", machine="m1"
):
    return UserPlexServer.objects.create(
        user=user,
        machine_identifier=machine,
        name=name,
        base_url=base_url,
        access_token=token,
        owned=True,
    )


class PlexConnectInfoTests(_ApiTestBase):
    def setUp(self):
        super().setUp()
        self.media = _make_media()
        self.server = _make_server(self.user)
        self.library = UserPlexLibrary.objects.create(
            user=self.user,
            server=self.server,
            section_key="1",
            title="Movies",
            library_type="movie",
        )
        self.item = UserPlexItem.objects.create(
            user=self.user,
            server=self.server,
            library=self.library,
            media_item=self.media,
            rating_key="12345",
            media_type="movie",
            title="Interstellar",
        )
        self.url = reverse(
            "integrations:plex-connect-info", kwargs={"media_item_id": self.media.pk}
        )

    def test_unauthenticated_401(self):
        anon = APIClient()
        resp = anon.get(self.url)
        self.assertEqual(resp.status_code, 401)

    def test_no_plex_item_404(self):
        other_media = _make_media("Dune")
        resp = self.client.get(
            reverse("integrations:plex-connect-info", kwargs={"media_item_id": other_media.pk})
        )
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.json()["detail"], "Media item not found in your Plex library")

    def test_connect_info_shape_with_server_token(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(
            set(body), {"base_url", "base_urls", "token", "rating_key", "album_thumb_url"}
        )
        self.assertEqual(body["base_url"], self.server.base_url)
        self.assertEqual(body["base_urls"], [self.server.base_url])
        self.assertEqual(body["token"], self.server.access_token)
        self.assertEqual(body["rating_key"], self.item.rating_key)
        self.assertEqual(
            body["album_thumb_url"],
            f"{self.server.base_url}/library/metadata/{self.item.rating_key}"
            f"/thumb?X-Plex-Token={self.server.access_token}",
        )

    def test_other_users_item_is_not_found(self):
        bob = User.objects.create_user(username="bob", password="pass")
        bob_media = _make_media("Arrival")
        UserPlexItem.objects.create(
            user=bob,
            server=_make_server(bob, machine="mb"),
            media_item=bob_media,
            rating_key="99",
            media_type="movie",
            title="Arrival",
        )
        resp = self.client.get(
            reverse("integrations:plex-connect-info", kwargs={"media_item_id": bob_media.pk})
        )
        self.assertEqual(resp.status_code, 404)

    def test_token_falls_back_to_user_plex_token(self):
        self.server.access_token = None
        self.server.save(update_fields=("access_token",))
        self.user.plex_auth_token = "user-tok"
        self.user.save(update_fields=("plex_auth_token",))
        resp = self.client.get(self.url)
        body = resp.json()
        self.assertEqual(body["token"], "user-tok")
        self.assertEqual(
            body["album_thumb_url"],
            f"{self.server.base_url}/library/metadata/{self.item.rating_key}"
            f"/thumb?X-Plex-Token=user-tok",
        )

    def test_no_base_url_no_token_returns_nulls(self):
        self.server.base_url = None
        self.server.access_token = None
        self.server.save(update_fields=("base_url", "access_token"))
        resp = self.client.get(self.url)
        body = resp.json()
        self.assertIsNone(body["base_url"])
        self.assertEqual(body["base_urls"], [])
        self.assertIsNone(body["token"])
        self.assertIsNone(body["album_thumb_url"])

    def test_alt_urls_appended_and_no_album_thumb_when_no_token(self):
        self.user.plex_auth_token = "user-tok"
        self.user.save(update_fields=("plex_auth_token",))
        self.server.access_token = None
        self.server.save(update_fields=("access_token",))
        with mock.patch.object(
            integrations_services.plex, "_get_alternative_plex_urls", return_value=["https://relay.plex"]
        ):
            resp = self.client.get(self.url)
        body = resp.json()
        self.assertEqual(body["base_urls"], [self.server.base_url, "https://relay.plex"])
        self.assertEqual(body["base_url"], self.server.base_url)
        # user token present -> thumb uses it and the first base url
        self.assertTrue(body["album_thumb_url"].startswith(self.server.base_url))


class PlexAltUrlParsingTests(TestCase):
    """Unit coverage of the best-effort plex.tv resources parsing."""

    def setUp(self):
        self.user = User.objects.create_user(username="carol", password="pass")
        self.user.plex_auth_token = "tok"
        self.server = _make_server(self.user, machine="match-id")

    def test_matching_resource_returns_connection_uris(self):
        payload = [
            {"clientIdentifier": "other", "connections": [{"uri": "http://other"}]},
            {
                "clientIdentifier": "match-id",
                "connections": [{"uri": "https://a.plex/"}, {"uri": "https://a.plex/"}],
            },
        ]
        with mock.patch.object(
            integrations_services.plex,
            "_request",
            return_value=(200, __import__("json").dumps(payload)),
        ):
            urls = integrations_services.plex._get_alternative_plex_urls(
                self.server, self.user
            )
        self.assertEqual(urls, ["https://a.plex"])

    def test_no_matching_resource_returns_empty(self):
        payload = [{"clientIdentifier": "nope", "connections": [{"uri": "http://x"}]}]
        with mock.patch.object(
            integrations_services.plex,
            "_request",
            return_value=(200, __import__("json").dumps(payload)),
        ):
            urls = integrations_services.plex._get_alternative_plex_urls(
                self.server, self.user
            )
        self.assertEqual(urls, [])

    def test_non_200_or_network_error_returns_empty(self):
        with mock.patch.object(
            integrations_services.plex, "_request", return_value=(500, "boom")
        ):
            self.assertEqual(
                integrations_services.plex._get_alternative_plex_urls(self.server, self.user), []
            )
        with mock.patch.object(
            integrations_services.plex,
            "_request",
            side_effect=OSError("down"),
        ):
            self.assertEqual(
                integrations_services.plex._get_alternative_plex_urls(self.server, self.user), []
            )

    def test_no_user_token_returns_empty_without_outbound(self):
        self.user.plex_auth_token = ""
        with mock.patch.object(
            integrations_services.plex,
            "_request",
            side_effect=AssertionError("should not call out"),
        ):
            self.assertEqual(
                integrations_services.plex._get_alternative_plex_urls(self.server, self.user), []
            )


class PlexLibrariesTests(_ApiTestBase):
    URL = "/api/v1/integrations/plex/libraries"

    def _lib(self, server, section_key, title, library_type="movie", user=None):
        return UserPlexLibrary.objects.create(
            user=user or self.user,
            server=server,
            section_key=section_key,
            title=title,
            library_type=library_type,
        )

    def test_empty_libraries(self):
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"libraries": []})

    def test_unauthenticated_401(self):
        resp = APIClient().get(self.URL)
        self.assertEqual(resp.status_code, 401)

    def test_libraries_with_counts_and_last_synced(self):
        srv_a = _make_server(self.user, name="AAA", machine="a")
        srv_b = _make_server(self.user, name="BBB", machine="b")
        lib_a1 = self._lib(srv_a, "1", "Movies")
        self._lib(srv_a, "2", "Shows", library_type="show")
        self._lib(srv_b, "3", "Solo")

        UserPlexItem.objects.create(
            user=self.user,
            server=srv_a,
            library=lib_a1,
            media_item=_make_media("A"),
            rating_key="1",
            media_type="movie",
            title="A",
        )
        UserPlexItem.objects.create(
            user=self.user,
            server=srv_a,
            library=lib_a1,
            media_item=_make_media("B"),
            rating_key="2",
            media_type="movie",
            title="B",
        )
        # Push item A's stamp into the past (QuerySet.update bypasses auto_now)
        # so the library max is item B's creation time.
        UserPlexItem.objects.filter(rating_key="1").update(
            updated_at=timezone.now() - timedelta(days=1)
        )
        latest = UserPlexItem.objects.get(rating_key="2").updated_at

        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        libs = resp.json()["libraries"]
        self.assertEqual([lib["title"] for lib in libs], ["Movies", "Shows", "Solo"])
        by_title = {lib["title"]: lib for lib in libs}
        movies = by_title["Movies"]
        self.assertEqual(movies["server_id"], srv_a.id)
        self.assertEqual(movies["server_name"], "AAA")
        self.assertEqual(movies["section_key"], "1")
        self.assertEqual(movies["library_type"], "movie")
        self.assertTrue(movies["selected"])
        self.assertEqual(movies["item_count"], 2)
        self.assertEqual(movies["last_synced_at"], latest.isoformat())
        self.assertEqual(by_title["Shows"]["item_count"], 0)
        self.assertIsNone(by_title["Shows"]["last_synced_at"])
        self.assertEqual(by_title["Solo"]["server_name"], "BBB")

    def test_other_users_libraries_excluded(self):
        bob = User.objects.create_user(username="bob2", password="pass")
        srv_bob = _make_server(bob, machine="mb")
        self._lib(srv_bob, "1", "BobLib", user=bob)
        resp = self.client.get(self.URL)
        self.assertEqual(resp.json(), {"libraries": []})


class SteamOwnedAppIdsTests(_ApiTestBase):
    URL = "/api/v1/integrations/steam/owned-appids"

    def _game(self, app_id, user=None):
        return UserSteamGame.objects.create(
            user=user or self.user, steam_app_id=app_id, name=f"game {app_id}"
        )

    def test_empty(self):
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"appids": []})

    def test_unauthenticated_401(self):
        resp = APIClient().get(self.URL)
        self.assertEqual(resp.status_code, 401)

    def test_returns_owned_appids_for_user_only(self):
        self._game(730)
        self._game(570)
        self._game(440)
        bob = User.objects.create_user(username="bob3", password="pass")
        self._game(1, user=bob)
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(set(resp.json()["appids"]), {730, 570, 440})
