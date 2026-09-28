"""Endpoint tests for the ported library API area (wave #4).

Exercises the 10 GET routes under ``/api/v1/library/`` against a real test
database: local installed games, the plex library grid/status/thumb redirect,
steam grid/status/unmatched/wishlist, the raw youtube liked-video list, and the
generic interaction-type tab. Mirrors legacy status codes and response key sets.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.integrations.models import (
    UserPlexItem,
    UserPlexLibrary,
    UserPlexServer,
    UserSteamGame,
    UserSteamWishlist,
    UserYoutubeLikedVideo,
)
from apps.library.models import UserLocalGame
from apps.media.models import MediaAsset, MediaItem, Movie
from apps.social.models import UserMediaInteraction

User = get_user_model()

INSTALLED_GAME_KEYS = {
    "id",
    "title",
    "platform",
    "media_item_id",
    "match_suggestion_media_id",
    "last_seen_at",
    "catalog_title",
    "catalog_slug",
    "catalog_poster_url",
    "catalog_textless_poster_url",
    "catalog_logo_url",
    "catalog_avg_rating",
}

MEDIA_LIST_ENVELOPE_KEYS = {
    "items",
    "next_cursor",
    "has_more",
    "total",
    "tracks",
    "backfill_pending",
}

MEDIA_ITEM_SUMMARY_KEYS = {
    "id",
    "media_type",
    "title",
    "slug",
    "tmdb_id",
    "poster_url",
    "textless_poster_url",
    "backdrop_url",
    "logo_url",
    "logo_color_guess",
    "icon_url",
    "release_date",
    "popularity",
    "avg_rating",
    "rating_count",
    "overall_rating",
    "overall_rating_source",
    "like_count",
    "watchlist_count",
    "watched_count",
    "played_count",
    "started_count",
    "listened_count",
    "view_count",
    "is_adult",
    "new_season_released",
    "new_season_release_date",
    "user_interactions",
    "steam_playtime_forever",
    "steam_playtime_2weeks",
    "steam_rtime_last_played",
    "plex_view_count",
    "plex_last_viewed_at",
    "album_artist_name",
    "album_track_count",
    "album_musicbrainz_release_group_id",
    "revenue",
    "budget",
}

UNMATCHED_STEAM_KEYS = {
    "id",
    "steam_app_id",
    "steam_name",
    "steam_playtime_forever",
    "steam_playtime_2weeks",
    "steam_img_icon_url",
    "steam_rtime_last_played",
}

WISHLIST_ITEM_KEYS = {
    "id",
    "media_type",
    "title",
    "slug",
    "poster_url",
    "logo_url",
    "textless_poster_url",
    "release_date",
    "steam_priority",
}

YOUTUBE_VIDEO_KEYS = {
    "video_id",
    "title",
    "channel_title",
    "channel_id",
    "thumbnail_url",
    "published_at",
    "matched_media_item_id",
    "matched_title",
    "matched_artist",
    "created_at",
}


class LibraryApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="alice",
            password="pw",
            plex_id="plex-alice",
            steam_id="76561197960287930",
        )
        self.naked_user = User.objects.create_user(username="bob", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.naked_token = Token.objects.create(user=self.naked_user)

        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.naked = APIClient()
        self.naked.credentials(HTTP_AUTHORIZATION=f"Token {self.naked_token.key}")

        self.movie = MediaItem.objects.create(
            media_type="movie",
            title="Her",
            slug="her-2013",
            release_date=timezone.datetime(2013, 12, 18).date(),
            avg_rating=8.0,
        )
        Movie.objects.create(media_item=self.movie, runtime=126)
        MediaAsset.objects.create(
            media_item=self.movie, asset_type="poster", url="https://cdn.example/her.jpg"
        )

        self.server = UserPlexServer.objects.create(
            user=self.user,
            machine_identifier="machine-1",
            name="Living Room",
            base_url="http://plex.lan:32400",
            access_token="secret-token",
        )
        self.library = UserPlexLibrary.objects.create(
            user=self.user,
            server=self.server,
            section_key="1",
            title="Movies",
            library_type="movie",
        )
        self.plex_item = UserPlexItem.objects.create(
            user=self.user,
            server=self.server,
            library=self.library,
            media_item=self.movie,
            rating_key="100",
            media_type="movie",
            title="Her",
            view_count=3,
            last_viewed_at=timezone.now(),
            thumb_url="/library/metadata/100/thumb",
        )

    def test_installed_games_returns_games_and_total(self) -> None:
        matched = UserLocalGame.objects.create(
            user=self.user,
            title="Her",
            platform="windows",
            media_item=self.movie,
            match_suggestion_media_id=self.movie.id,
        )
        UserLocalGame.objects.create(user=self.user, title="Mystery App", platform="windows")

        response = self.client.get("/api/v1/library/installed")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 2)
        by_title = {g["title"]: g for g in response.data["games"]}
        self.assertEqual(set(by_title["Her"]), INSTALLED_GAME_KEYS)
        self.assertEqual(by_title["Her"]["media_item_id"], self.movie.id)
        self.assertEqual(by_title["Her"]["catalog_title"], "Her")
        self.assertEqual(by_title["Her"]["catalog_slug"], "her-2013")
        self.assertEqual(by_title["Her"]["catalog_avg_rating"], 8.0)
        self.assertEqual(by_title["Her"]["catalog_poster_url"], "https://cdn.example/her.jpg")
        self.assertEqual(by_title["Mystery App"]["catalog_title"], None)
        self.assertEqual(matched.last_seen_at.isoformat(), by_title["Her"]["last_seen_at"])

    def test_installed_requires_authentication(self) -> None:
        anonymous = APIClient()
        response = anonymous.get("/api/v1/library/installed")
        self.assertEqual(response.status_code, 401)

    def test_plex_library_grid_shape_and_overlay(self) -> None:
        response = self.client.get("/api/v1/library/plex")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), MEDIA_LIST_ENVELOPE_KEYS)
        self.assertEqual(response.data["has_more"], False)
        self.assertIsNone(response.data["next_cursor"])
        self.assertEqual(len(response.data["items"]), 1)
        item = response.data["items"][0]
        self.assertEqual(set(item), MEDIA_ITEM_SUMMARY_KEYS)
        self.assertEqual(item["id"], self.movie.id)
        self.assertEqual(item["title"], "Her")
        self.assertEqual(item["poster_url"], "https://cdn.example/her.jpg")
        self.assertEqual(item["plex_view_count"], 3)
        self.assertIsNotNone(item["plex_last_viewed_at"])

    def test_plex_library_gated_on_plex_connection(self) -> None:
        response = self.naked.get("/api/v1/library/plex")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.data["detail"], "Plex library is only available when Plex is connected"
        )

    def test_plex_status_reports_item_count(self) -> None:
        response = self.client.get("/api/v1/library/plex/status")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["item_count"], 1)
        self.assertIsNotNone(response.data["last_scanned_at"])

    def test_plex_status_zero_when_not_connected(self) -> None:
        response = self.naked.get("/api/v1/library/plex/status")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"item_count": 0, "last_scanned_at": None})

    def test_plex_thumb_redirects_to_signed_url(self) -> None:
        response = self.client.get(f"/api/v1/library/plex/thumb/{self.movie.id}")

        self.assertEqual(response.status_code, 307)
        self.assertEqual(
            response["Location"],
            "http://plex.lan:32400/library/metadata/100/thumb?X-Plex-Token=secret-token",
        )

    def test_plex_thumb_404_when_no_thumbnail(self) -> None:
        item = MediaItem.objects.create(media_type="movie", title="No Thumb", slug="no-thumb")
        Movie.objects.create(media_item=item)
        UserPlexItem.objects.create(
            user=self.user,
            server=self.server,
            library=self.library,
            media_item=item,
            rating_key="101",
            media_type="movie",
            title="No Thumb",
        )

        response = self.client.get(f"/api/v1/library/plex/thumb/{item.id}")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "No Plex thumbnail for this item")

    def test_plex_thumb_404_on_unknown_item(self) -> None:
        response = self.client.get("/api/v1/library/plex/thumb/999999")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "No Plex thumbnail for this item")

    def test_steam_library_returns_playtime_overlay(self) -> None:
        UserSteamGame.objects.create(
            user=self.user,
            media_item=self.movie,
            steam_app_id=1,
            name="Her",
            playtime_forever=120,
            playtime_2weeks=30,
            rtime_last_played=1700000000,
        )

        response = self.client.get("/api/v1/library/steam")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), MEDIA_LIST_ENVELOPE_KEYS)
        item = response.data["items"][0]
        self.assertEqual(set(item), MEDIA_ITEM_SUMMARY_KEYS)
        self.assertEqual(item["steam_playtime_forever"], 120)
        self.assertEqual(item["steam_playtime_2weeks"], 30)
        self.assertEqual(item["steam_rtime_last_played"], 1700000000)

    def test_steam_library_gated_on_steam_connection(self) -> None:
        response = self.naked.get("/api/v1/library/steam")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.data["detail"], "Steam library is only available when Steam is connected"
        )

    def test_steam_status_reports_game_count(self) -> None:
        UserSteamGame.objects.create(
            user=self.user, media_item=self.movie, steam_app_id=1, name="Her"
        )
        response = self.client.get("/api/v1/library/steam/status")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["game_count"], 1)
        self.assertIsNotNone(response.data["last_scanned_at"])

    def test_steam_unmatched_returns_raw_rows(self) -> None:
        UserSteamGame.objects.create(
            user=self.user,
            media_item=None,
            steam_app_id=999,
            name="Unmatched Game",
            playtime_forever=55,
            img_icon_url="https://cdn.example/icon.jpg",
        )

        response = self.client.get("/api/v1/library/steam/unmatched")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        row = response.data["items"][0]
        self.assertEqual(set(row), UNMATCHED_STEAM_KEYS)
        self.assertEqual(row["steam_name"], "Unmatched Game")
        self.assertEqual(row["steam_app_id"], 999)
        self.assertEqual(row["steam_img_icon_url"], "https://cdn.example/icon.jpg")

    def test_steam_wishlist_returns_priority(self) -> None:
        UserSteamWishlist.objects.create(
            user=self.user,
            media_item=self.movie,
            steam_app_id=1,
            name="Her",
            priority=2,
        )

        response = self.client.get("/api/v1/library/steam/wishlist")

        self.assertEqual(response.status_code, 200)
        item = response.data["items"][0]
        self.assertEqual(set(item), WISHLIST_ITEM_KEYS)
        self.assertEqual(item["steam_priority"], 2)
        self.assertEqual(item["id"], self.movie.id)

    def test_youtube_library_returns_liked_videos(self) -> None:
        UserYoutubeLikedVideo.objects.create(
            user=self.user,
            video_id="vid-1",
            title="A Song",
            channel_title="An Artist",
            channel_id="ch-1",
            thumbnail_url="https://cdn.example/yt.jpg",
            matched_media_item=self.movie,
            matched_title="Her",
        )

        response = self.client.get("/api/v1/library/youtube")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"items", "next_cursor", "has_more"})
        video = response.data["items"][0]
        self.assertEqual(set(video), YOUTUBE_VIDEO_KEYS)
        self.assertEqual(video["video_id"], "vid-1")
        self.assertEqual(video["matched_media_item_id"], self.movie.id)
        self.assertEqual(video["matched_title"], "Her")

    def test_library_tab_like_returns_interactions(self) -> None:
        UserMediaInteraction.objects.create(
            user=self.user,
            media_item=self.movie,
            interaction_type="liked",
            extra_data={"source": "test"},
        )

        response = self.client.get("/api/v1/library/like")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), MEDIA_LIST_ENVELOPE_KEYS)
        item = response.data["items"][0]
        self.assertEqual(set(item), MEDIA_ITEM_SUMMARY_KEYS)
        self.assertEqual(item["user_interactions"]["liked"], True)
        self.assertEqual(item["user_interactions"]["watched"], False)
        self.assertEqual(item["user_interactions"]["owned"], False)

    def test_library_tab_unknown_is_404(self) -> None:
        response = self.client.get("/api/v1/library/bogus")
        self.assertEqual(response.status_code, 404)
        self.assertIn("Unknown library tab", response.data["detail"])
