"""Tests for Plex watched media sync service and endpoint.

Tests POST /integrations/plex/watched/sync and sync_plex_watched.
"""

import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from apps.integrations.models import UserPlexItem, UserPlexLibrary, UserPlexServer
from apps.integrations.services.plex_watched import sync_plex_watched
from apps.media.models import Episode, ExternalID, MediaItem, Movie, Season, Show
from apps.social.models import UserEpisodeInteraction, UserMediaInteraction

User = get_user_model()

REQUEST = "apps.integrations.services.plex._request"


class PlexWatchedSyncEndpointTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="pw")
        self.client = APIClient()

    def test_unauthenticated_returns_401(self):
        resp = self.client.post("/api/v1/integrations/plex/watched/sync")
        self.assertEqual(resp.status_code, 401)

    def test_no_plex_linked_returns_400(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post("/api/v1/integrations/plex/watched/sync")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data.get("detail"), "No Plex account linked")

    def test_sync_watched_endpoint_success(self):
        self.user.plex_id = "plex-alice"
        self.user.plex_auth_token = "ptoken-123"
        self.user.save(update_fields=("plex_id", "plex_auth_token"))
        self.client.force_authenticate(user=self.user)

        with mock.patch("apps.integrations.services.sync_plex_watched") as mock_sync:
            mock_sync.return_value = {"total": 3, "matched": 2, "seeded": 1, "episodes": 5}
            resp = self.client.post("/api/v1/integrations/plex/watched/sync")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], 3)
        self.assertEqual(resp.data["matched"], 2)
        self.assertEqual(resp.data["episodes"], 5)


class PlexWatchedSyncServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="bob", password="pw")
        self.user.plex_id = "plex-bob"
        self.user.plex_auth_token = "tok-bob"
        self.user.save(update_fields=("plex_id", "plex_auth_token"))

        self.server = UserPlexServer.objects.create(
            user=self.user,
            machine_identifier="server-bob-1",
            name="Bob PMS",
            base_url="https://bob-pms.example.com",
            selected=True,
            access_token="tok-server",
        )
        self.movie_lib = UserPlexLibrary.objects.create(
            user=self.user,
            server=self.server,
            section_key="1",
            title="Movies",
            library_type="movie",
            selected=True,
        )
        self.show_lib = UserPlexLibrary.objects.create(
            user=self.user,
            server=self.server,
            section_key="2",
            title="TV Shows",
            library_type="show",
            selected=True,
        )

    def test_no_token_returns_zeros(self):
        self.user.plex_auth_token = None
        self.user.plex_id = None
        self.user.save(update_fields=("plex_auth_token", "plex_id"))
        res = sync_plex_watched(self.user)
        self.assertEqual(res, {"total": 0, "matched": 0, "seeded": 0, "episodes": 0})

    def test_sync_watched_movie_seeds_and_marks_watched(self):
        movie = MediaItem.objects.create(
            media_type="movie", title="Inception", slug="inception-2010"
        )
        Movie.objects.create(media_item=movie)
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=movie.id,
            provider="tmdb",
            external_id="27205",
            media_type="movie",
        )

        movie_item = {
            "type": "movie",
            "ratingKey": "m100",
            "title": "Inception",
            "year": 2010,
            "guid": "plex://movie/inception",
            "Guid": [{"id": "tmdb://27205"}, {"id": "imdb://tt1375666"}],
            "viewCount": 2,
            "lastViewedAt": 1600000000,
        }
        payload = json.dumps({"MediaContainer": {"totalSize": 1, "Metadata": [movie_item]}})

        def fake_request(url, *args, **kwargs):
            if "sections/1/all" in url:
                return 200, payload
            return 200, json.dumps({"MediaContainer": {"Metadata": []}})

        with mock.patch(REQUEST, side_effect=fake_request):
            res = sync_plex_watched(self.user)

        self.assertGreaterEqual(res["total"], 1)
        self.assertEqual(res["matched"], 1)
        plex_item = UserPlexItem.objects.get(server=self.server, rating_key="m100")
        self.assertTrue(plex_item.viewed)
        self.assertEqual(plex_item.view_count, 2)
        self.assertEqual(plex_item.media_item_id, movie.id)

        interaction = UserMediaInteraction.objects.get(
            user=self.user,
            media_item_id=plex_item.media_item_id,
            interaction_type="watched",
        )
        self.assertEqual(interaction.extra_data.get("source"), "plex")
        self.assertEqual(interaction.extra_data.get("view_count"), 2)

    def test_sync_watched_show_and_episodes(self):
        # Create catalog show with season and episode
        show = MediaItem.objects.create(media_type="show", title="Severance", slug="severance-2022")
        show_sub = Show.objects.create(media_item=show)
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=show.id,
            provider="tmdb",
            external_id="115740",
            media_type="show",
        )
        season = Season.objects.create(show=show_sub, season_number=1, name="Season 1")
        episode = Episode.objects.create(
            season=season, episode_number=1, name="Good News About Hell"
        )

        show_item = {
            "type": "show",
            "ratingKey": "s200",
            "title": "Severance",
            "year": 2022,
            "guid": "plex://show/severance",
            "Guid": [{"id": "tmdb://115740"}],
            "leafCount": 9,
            "viewedLeafCount": 9,
            "viewCount": 1,
        }
        ep_item = {
            "type": "episode",
            "ratingKey": "ep500",
            "title": "Good News About Hell",
            "grandparentTitle": "Severance",
            "grandparentRatingKey": "s200",
            "parentIndex": 1,
            "index": 1,
            "viewCount": 1,
            "lastViewedAt": 1650000000,
        }

        def fake_request(url, *args, **kwargs):
            if "type=4" in url:
                return 200, json.dumps({"MediaContainer": {"totalSize": 1, "Metadata": [ep_item]}})
            if "sections/2/all" in url:
                return 200, json.dumps(
                    {"MediaContainer": {"totalSize": 1, "Metadata": [show_item]}}
                )
            return 200, json.dumps({"MediaContainer": {"Metadata": []}})

        with mock.patch(REQUEST, side_effect=fake_request):
            res = sync_plex_watched(self.user)

        self.assertGreaterEqual(res["total"], 1)
        self.assertGreaterEqual(res["episodes"], 1)

        # Show is marked watched
        self.assertTrue(
            UserMediaInteraction.objects.filter(
                user=self.user, media_item=show, interaction_type="watched"
            ).exists()
        )
        # Episode is marked watched
        self.assertTrue(
            UserEpisodeInteraction.objects.filter(user=self.user, episode=episode).exists()
        )
