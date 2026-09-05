"""Endpoint tests for the integrations read/library-state surface (DRF).

Exercises the ported Plex + Steam read routes over the stored
``UserPlex*``/``UserSteamGame`` rows:

- ``GET /integrations/plex/connect-info/{media_item_id}``
- ``GET /integrations/plex/album-tracks/{media_item_id}``
- ``GET /integrations/plex/libraries``
- ``GET /integrations/plex/servers`` (live plex.tv server/library discovery)
- ``GET /integrations/plex/sessions``
- ``GET /integrations/steam/owned-appids``
- ``POST /integrations/plex/webhook`` (inbound; HMAC-verified, AllowAny)

The Plex tv alt-URL fetch and live album-track children fetch are best-effort
outbound; tests either leave the user without a ``plex_auth_token`` (no call)
or patch the service ``_request`` leaf.
"""

import hashlib
import hmac
import json
import urllib.error
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
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


ALBUM_CHILDREN_PAYLOAD = {
    "MediaContainer": {
        "Metadata": [
            {
                "ratingKey": "4001",
                "title": "Track One",
                "grandparentTitle": "Interstellar",
                "index": 1,
                "parentIndex": 1,
                "duration": 240000,
            },
            {
                "ratingKey": "4002",
                "title": "Track Two",
                "originalTitle": "Other Artist",
                "index": 2,
                "parentIndex": 2,
            },
        ]
    }
}


class PlexAlbumTracksTests(_ApiTestBase):
    def setUp(self):
        super().setUp()
        self.media = _make_media()
        self.server = _make_server(self.user)
        self.library = UserPlexLibrary.objects.create(
            user=self.user,
            server=self.server,
            section_key="1",
            title="Music",
            library_type="music",
        )
        UserPlexItem.objects.create(
            user=self.user,
            server=self.server,
            library=self.library,
            media_item=self.media,
            rating_key="4000",
            media_type="music",
            title="Interstellar",
        )
        self.url = reverse(
            "integrations:plex-album-tracks", kwargs={"media_item_id": self.media.pk}
        )

    def test_unauthenticated_401(self):
        resp = APIClient().get(self.url)
        self.assertEqual(resp.status_code, 401)

    def test_no_plex_item_404(self):
        other = _make_media("Dune")
        resp = self.client.get(
            reverse("integrations:plex-album-tracks", kwargs={"media_item_id": other.pk})
        )
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.json()["detail"], "Media item not found in your Plex library")

    def test_returns_tracks_shape(self):
        with mock.patch.object(
            integrations_services.plex,
            "_request",
            return_value=(200, json.dumps(ALBUM_CHILDREN_PAYLOAD)),
        ):
            resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(
            set(body), {"tracks", "base_url", "token", "rating_key", "album_thumb_url"}
        )
        self.assertEqual(
            body["tracks"],
            [
                {
                    "rating_key": "4001",
                    "title": "Track One",
                    "artist": "Interstellar",
                    "track_number": 1,
                    "disc_number": 1,
                    "duration_ms": 240000,
                },
                {
                    "rating_key": "4002",
                    "title": "Track Two",
                    "artist": "Other Artist",
                    "track_number": 2,
                    "disc_number": 2,
                    "duration_ms": None,
                },
            ],
        )
        self.assertEqual(body["base_url"], self.server.base_url)
        self.assertEqual(body["token"], self.server.access_token)
        self.assertEqual(body["rating_key"], "4000")
        self.assertEqual(
            body["album_thumb_url"],
            f"{self.server.base_url}/library/metadata/4000/thumb"
            f"?X-Plex-Token={self.server.access_token}",
        )

    def test_empty_children_returns_empty_tracks(self):
        with mock.patch.object(
            integrations_services.plex,
            "_request",
            return_value=(200, json.dumps({"MediaContainer": {"Metadata": []}})),
        ):
            resp = self.client.get(self.url)
        body = resp.json()
        self.assertEqual(body["tracks"], [])
        self.assertEqual(body["base_url"], self.server.base_url)

    def test_no_token_502(self):
        self.server.access_token = None
        self.server.save(update_fields=("access_token",))
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 502)
        self.assertEqual(resp.json()["detail"], "Could not fetch Plex album tracks")

    def test_all_connections_fail_502(self):
        with mock.patch.object(
            integrations_services.plex, "_request", return_value=(500, "{}")
        ):
            resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 502)
        self.assertEqual(resp.json()["detail"], "Could not fetch Plex album tracks")

    def test_falls_back_to_alternative_base_url(self):
        self.user.plex_auth_token = "user-tok"
        self.user.save(update_fields=("plex_auth_token",))
        self.server.access_token = None
        self.server.save(update_fields=("access_token",))

        def _fake(url, *args, **kwargs):
            if "alt.example" in url:
                return 200, json.dumps(ALBUM_CHILDREN_PAYLOAD)
            return 500, "{}"

        with mock.patch.object(
            integrations_services.plex, "_request", side_effect=_fake
        ), mock.patch.object(
            integrations_services.plex,
            "_get_alternative_plex_urls",
            return_value=["https://alt.example"],
        ):
            resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["base_url"], "https://alt.example")
        self.assertEqual(body["token"], "user-tok")
        self.assertTrue(body["album_thumb_url"].startswith("https://alt.example/"))


SESSION_MOVIE_ITEM = {
    "type": "movie",
    "ratingKey": "100",
    "title": "Inception",
    "thumb": "/library/metadata/100/thumb/abc",
    "duration": 9000000,
    "viewOffset": 120000,
    "year": "2010",
    "contentRating": "PG-13",
    "summary": "A thief who steals corporate secrets.",
    "librarySectionTitle": "Movies",
    "User": {"title": "dk", "thumb": "/users/1"},
    "Player": {"title": "Living Room", "device": "AppleTV", "platform": "tvOS", "state": "playing"},
    "Session": {"id": "abcd1234"},
    "Media": [
        {
            "videoResolution": "1080",
            "videoCodec": "h264",
            "audioCodec": "aac",
            "audioChannels": 6,
            "bitrate": 8000,
        }
    ],
    "TranscodeSession": {
        "videoDecision": "transcode",
        "audioDecision": "transcode",
        "transcodeReason": "1",
        "throttled": "1",
    },
}

SESSION_TRACK_ITEM = {
    "type": "track",
    "ratingKey": "77",
    "title": "Cornfield Chase",
    "grandparentTitle": "Interstellar",
    "parentTitle": "Soundtrack",
    "index": 3,
    "duration": 200000,
}

SESSION_PHOTO_ITEM = {"type": "photo", "ratingKey": "9", "title": "holiday"}


class PlexSessionsTests(_ApiTestBase):
    URL = "/api/v1/integrations/plex/sessions"

    def setUp(self):
        super().setUp()
        self.user.plex_auth_token = "user-tok"
        self.user.save(update_fields=("plex_auth_token",))
        self.server = _make_server(self.user, machine="srv-1")

    def _stub_sessions(self, payload, **kwargs):
        return mock.patch.object(
            integrations_services.plex,
            "_request",
            return_value=(200, json.dumps(payload)),
            **kwargs,
        )

    def test_unauthenticated_401(self):
        resp = APIClient().get(self.URL)
        self.assertEqual(resp.status_code, 401)

    def test_no_plex_account_400(self):
        self.user.plex_auth_token = ""
        self.user.save(update_fields=("plex_auth_token",))
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["detail"], "No Plex account linked")

    def test_returns_movie_and_track_sessions(self):
        payload = {
            "MediaContainer": {
                "Metadata": [SESSION_MOVIE_ITEM, SESSION_PHOTO_ITEM, SESSION_TRACK_ITEM]
            }
        }
        with self._stub_sessions(payload):
            resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        sessions = resp.json()["sessions"]
        self.assertEqual(len(sessions), 2)  # photo filtered out
        movie = sessions[0]
        self.assertEqual(set(movie), {
            "session_id", "media_type", "title", "grandparent_title", "parent_title",
            "index", "thumb", "duration", "view_offset", "state", "user_name",
            "user_thumb", "player_title", "player_device", "player_platform",
            "server_name", "server_id", "library_section", "year", "content_rating",
            "summary", "video_resolution", "video_codec", "audio_codec",
            "audio_channels", "bitrate", "video_decision", "audio_decision",
            "transcode_reason", "throttled",
        })
        self.assertEqual(movie["session_id"], "abcd1234")
        self.assertEqual(movie["media_type"], "movie")
        self.assertEqual(movie["title"], "Inception")
        self.assertEqual(
            movie["thumb"],
            f"{self.server.base_url}/library/metadata/100/thumb/abc"
            f"?X-Plex-Token={self.server.access_token}",
        )
        self.assertEqual(movie["duration"], 9000000)
        self.assertEqual(movie["view_offset"], 120000)
        self.assertEqual(movie["state"], "playing")
        self.assertEqual(movie["user_name"], "dk")
        self.assertTrue(movie["user_thumb"].startswith(self.server.base_url))
        self.assertEqual(movie["player_title"], "Living Room")
        self.assertEqual(movie["player_device"], "AppleTV")
        self.assertEqual(movie["player_platform"], "tvOS")
        self.assertEqual(movie["server_name"], self.server.name)
        self.assertEqual(movie["server_id"], self.server.machine_identifier)
        self.assertEqual(movie["library_section"], "Movies")
        self.assertEqual(movie["year"], 2010)
        self.assertEqual(movie["content_rating"], "PG-13")
        self.assertEqual(movie["video_resolution"], "1080")
        self.assertEqual(movie["video_codec"], "h264")
        self.assertEqual(movie["audio_channels"], 6)
        self.assertEqual(movie["bitrate"], 8000)
        self.assertEqual(movie["video_decision"], "transcode")
        self.assertEqual(movie["audio_decision"], "transcode")
        self.assertEqual(movie["transcode_reason"], "1")
        self.assertTrue(movie["throttled"])
        # bare track item: defaults for missing User/Player/TranscodeSession
        track = sessions[1]
        self.assertEqual(track["media_type"], "track")
        self.assertEqual(track["user_name"], "Unknown")
        self.assertEqual(track["state"], "paused")
        self.assertEqual(track["player_title"], None)
        self.assertEqual(track["thumb"], None)
        self.assertEqual(track["video_decision"], "direct play")
        self.assertEqual(track["audio_decision"], "direct play")
        self.assertFalse(track["throttled"])
        self.assertEqual(track["grandparent_title"], "Interstellar")
        self.assertEqual(track["parent_title"], "Soundtrack")

    def test_empty_metadata_returns_empty_sessions(self):
        with self._stub_sessions({"MediaContainer": {"Metadata": []}}):
            resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"sessions": []})

    def test_erroring_and_tokenless_servers_are_skipped(self):
        _make_server(
            self.user, name="Bad", base_url="http://bad.example:32400", machine="srv-bad"
        )
        UserPlexServer.objects.create(
            user=self.user, machine_identifier="srv-nourl", name="NoUrl", selected=True
        )

        def _fake(url, *args, **kwargs):
            if "bad.example" in url:
                return 500, "{}"
            if self.server.base_url in url:
                return 200, json.dumps(
                    {"MediaContainer": {"Metadata": [SESSION_TRACK_ITEM]}}
                )
            raise AssertionError(f"unexpected url: {url}")

        with mock.patch.object(
            integrations_services.plex, "_request", side_effect=_fake
        ):
            resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        sessions = resp.json()["sessions"]
        # bad 500 skipped, incomplete (no base_url/access_token) skipped
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["server_name"], self.server.name)

    def test_raises_are_skipped(self):
        def _fake(url, *args, **kwargs):
            raise OSError("server unreachable")

        with mock.patch.object(
            integrations_services.plex, "_request", side_effect=_fake
        ):
            resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"sessions": []})


class PlexWebhookTests(TestCase):
    URL = "/api/v1/integrations/plex/webhook"
    SECRET = "test-webhook-secret"

    @staticmethod
    def _sign(body: bytes, secret: str = SECRET) -> str:
        digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return f"sha256={digest}"

    def test_not_configured_403(self):
        with override_settings(PLEX_WEBHOOK_SECRET=""):
            resp = APIClient().post(self.URL, data="{}", content_type="application/json")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["detail"], "Webhook not configured")

    def test_missing_signature_401(self):
        with override_settings(PLEX_WEBHOOK_SECRET=self.SECRET):
            resp = APIClient().post(
                self.URL, data='{"event": "media.play"}', content_type="application/json"
            )
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.json()["detail"], "Missing signature")

    def test_invalid_signature_401(self):
        with override_settings(PLEX_WEBHOOK_SECRET=self.SECRET):
            resp = APIClient().post(
                self.URL,
                data='{"event": "media.play"}',
                content_type="application/json",
                HTTP_X_PLEX_SIGNATURE="sha256=deadbeef",
            )
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.json()["detail"], "Invalid signature")

    def test_valid_json_accepted(self):
        body = b'{"event": "media.play", "Metadata": {"key": "1"}}'
        with override_settings(PLEX_WEBHOOK_SECRET=self.SECRET):
            resp = APIClient().post(
                self.URL,
                data=body,
                content_type="application/json",
                HTTP_X_PLEX_SIGNATURE=self._sign(body),
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(), {"status": "accepted", "event": "media.play"}
        )

    def test_json_without_event_returns_none(self):
        body = b'{"Metadata": {}}'
        with override_settings(PLEX_WEBHOOK_SECRET=self.SECRET):
            resp = APIClient().post(
                self.URL,
                data=body,
                content_type="application/json",
                HTTP_X_PLEX_SIGNATURE=self._sign(body),
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "accepted", "event": None})

    def test_undecodable_body_accepted_with_null_event(self):
        body = b"this is not json"
        with override_settings(PLEX_WEBHOOK_SECRET=self.SECRET):
            resp = APIClient().post(
                self.URL,
                data=body,
                content_type="application/json",
                HTTP_X_PLEX_SIGNATURE=self._sign(body),
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "accepted", "event": None})

    def test_multipart_payload_accepted(self):
        boundary = "OtixBoundary123"
        payload = json.dumps({"event": "library.new", "Metadata": {}})
        multipart = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="payload"\r\n'
            "\r\n"
            f"{payload}\r\n"
            f"--{boundary}--\r\n"
        ).encode()
        with override_settings(PLEX_WEBHOOK_SECRET=self.SECRET):
            resp = APIClient().post(
                self.URL,
                data=multipart,
                content_type=f"multipart/form-data; boundary={boundary}",
                HTTP_X_PLEX_SIGNATURE=self._sign(multipart),
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "accepted", "event": "library.new"})


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


DISC_RESOURCE_M1 = {
    "name": "Living Room",
    "product": "Plex Media Server",
    "clientIdentifier": "m1",
    "provides": "server",
    "owned": True,
    "accessToken": "acc-1",
    "platform": "Linux",
    "connections": [
        {"uri": "https://relay.plex.direct:32400", "local": False},
        {"uri": "https://192-168-1-10.abc.plex.direct:32400", "local": True},
    ],
}

DISC_SECTIONS = {
    "MediaContainer": {
        "Directory": [
            {"key": "1", "type": "movie", "title": "Movies"},
            {"key": "2", "type": "show", "title": "TV Shows"},
            {"key": "3", "type": "artist", "title": "Music"},
            {"key": "4", "type": "photo", "title": "Photos"},
            {"key": "5", "type": "clip", "title": "Clips"},
            {"key": "6", "type": "movie"},
        ]
    }
}


class PlexServersDiscoveryTests(_ApiTestBase):
    URL = "/api/v1/integrations/plex/servers"
    REVOKED_DETAIL = (
        "Plex account was disconnected because access was revoked externally. "
        "Please re-link your account."
    )

    def setUp(self):
        super().setUp()
        user = self.user
        user.plex_id = "plex-u-1"
        user.plex_username = "alice-plex"
        user.plex_email = "alice@plex.tv"
        user.plex_thumb = "http://img/plex"
        user.plex_auth_token = "ptok"
        user.save(
            update_fields=[
                "plex_id",
                "plex_username",
                "plex_email",
                "plex_thumb",
                "plex_auth_token",
            ]
        )

    @staticmethod
    def _discovery_fake(
        resources=(200, json.dumps([DISC_RESOURCE_M1])),
        sections=DISC_SECTIONS,
        raise_resources=None,
        raise_sections_host=None,
    ):
        def fake(url, **_kwargs):
            if "/api/v2/resources" in url:
                if raise_resources is not None:
                    raise raise_resources
                return resources
            if raise_sections_host is not None and raise_sections_host in url:
                raise urllib.error.URLError(ConnectionRefusedError("refused"))
            return (200, json.dumps(sections))

        return fake

    def _get(self, **kwargs):
        return mock.patch(
            "apps.integrations.services.plex._request",
            side_effect=self._discovery_fake(**kwargs),
        )

    def test_no_linked_account_400(self):
        self.user.plex_auth_token = None
        self.user.save(update_fields=["plex_auth_token"])
        with mock.patch("apps.integrations.services.plex._request") as request:
            resp = self.client.get(self.URL)
        request.assert_not_called()
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json(), {"detail": "User has no linked Plex account"})

    def test_unauthenticated_401(self):
        resp = APIClient().get(self.URL)
        self.assertEqual(resp.status_code, 401)

    def test_discovers_servers_and_libraries(self):
        with self._get():
            resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(payload["unreachable_servers"], None)
        self.assertEqual(len(payload["servers"]), 1)
        server = payload["servers"][0]
        self.assertEqual(server["machine_identifier"], "m1")
        self.assertEqual(server["name"], "Living Room")
        self.assertEqual(server["product"], "Plex Media Server")
        self.assertEqual(server["platform"], "Linux")
        self.assertEqual(server["base_url"], "https://192-168-1-10.abc.plex.direct:32400")
        self.assertTrue(server["owned"])
        self.assertTrue(server["selected"])
        db_server = UserPlexServer.objects.get(machine_identifier="m1")
        self.assertEqual(server["id"], db_server.id)
        self.assertEqual(db_server.access_token, "acc-1")
        self.assertEqual(UserPlexLibrary.objects.filter(server=db_server).count(), 4)
        self.assertEqual(len(payload["libraries"]), 4)
        titles = {lib["title"] for lib in payload["libraries"]}
        self.assertEqual(titles, {"Movies", "TV Shows", "Music", "Plex Library"})
        self.assertTrue(all(lib["server_id"] == db_server.id for lib in payload["libraries"]))

    def test_updates_existing_server_and_keeps_db_only(self):
        _make_server(
            self.user, name="Old Name", base_url="http://old:32400", token="old-tok", machine="m1"
        )
        db_only = _make_server(
            self.user, name="Offline", base_url="http://dbonly:32400", token="db-tok", machine="m2"
        )
        with self._get():
            resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        by_machine = {row["machine_identifier"]: row for row in payload["servers"]}
        self.assertEqual(set(by_machine), {"m1", "m2"})
        self.assertEqual(by_machine["m1"]["name"], "Living Room")
        self.assertEqual(by_machine["m1"]["base_url"], "https://192-168-1-10.abc.plex.direct:32400")
        self.assertEqual(by_machine["m2"]["base_url"], "http://dbonly:32400")
        db_only.refresh_from_db()
        self.assertEqual(db_only.name, "Offline")
        self.assertEqual(UserPlexServer.objects.filter(user=self.user).count(), 2)

    def test_db_only_server_without_base_url_excluded(self):
        UserPlexServer.objects.create(
            user=self.user, machine_identifier="m2", name="Headless", owned=True
        )
        with self._get():
            resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(len(payload["servers"]), 1)
        self.assertEqual(payload["servers"][0]["machine_identifier"], "m1")

    def test_skips_non_server_and_machineless_resources(self):
        resources = [
            {"name": "Phone", "provides": "client", "clientIdentifier": "c1"},
            {"name": "NoMachine", "provides": "server"},
            DISC_RESOURCE_M1,
        ]
        with self._get(resources=(200, json.dumps(resources))):
            resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(len(payload["servers"]), 1)
        self.assertEqual(payload["servers"][0]["machine_identifier"], "m1")

    def test_unreachable_server_collected_but_others_served(self):
        basement = dict(DISC_RESOURCE_M1)
        basement["name"] = "Basement"
        basement["clientIdentifier"] = "m2"
        basement["connections"] = [{"uri": "https://basement.plex.direct:32400", "local": True}]
        resources = [DISC_RESOURCE_M1, basement]
        with self._get(
            resources=(200, json.dumps(resources)),
            raise_sections_host="basement.plex.direct",
        ):
            resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(len(payload["servers"]), 2)
        self.assertEqual(payload["unreachable_servers"], ["Basement"])
        server_ids = {row["machine_identifier"]: row["id"] for row in payload["servers"]}
        self.assertEqual(len(payload["libraries"]), 4)
        self.assertTrue(all(lib["server_id"] == server_ids["m1"] for lib in payload["libraries"]))

    def test_plex_tv_http_error_502(self):
        with self._get(resources=(500, "boom")):
            resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 502)
        detail = resp.json()["detail"]
        self.assertTrue(detail.startswith("Plex returned 500 for https://plex.tv/api/v2/resources"))

    def test_revoked_token_unlinks_and_410(self):
        with self._get(resources=(401, "nope")):
            resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 410)
        self.assertEqual(resp.json()["detail"], self.REVOKED_DETAIL)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.plex_id)
        self.assertIsNone(self.user.plex_username)
        self.assertIsNone(self.user.plex_email)
        self.assertIsNone(self.user.plex_thumb)
        self.assertIsNone(self.user.plex_auth_token)

    def test_timeout_504(self):
        with self._get(raise_resources=TimeoutError("timed out")):
            resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 504)
        detail = resp.json()["detail"]
        self.assertTrue(detail.startswith("Connection to Plex timed out (https://plex.tv/api/v2/resources"))

    def test_connection_refused_502(self):
        with self._get(raise_resources=urllib.error.URLError(ConnectionRefusedError("refused"))):
            resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 502)
        detail = resp.json()["detail"]
        self.assertTrue(detail.startswith("Could not connect to Plex at https://plex.tv/api/v2/resources"))
