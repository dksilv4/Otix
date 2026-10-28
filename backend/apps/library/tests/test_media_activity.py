"""Tests for media activity service and API endpoint."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from apps.library.models import UserGameServer, UserNodeShare
from apps.library.services.media_activity import get_user_media_activity


class MediaActivityTests(APITestCase):
    def setUp(self):
        cache.clear()
        user_model = get_user_model()
        self.alice = user_model.objects.create_user(username="alice", password="password123")
        self.bob = user_model.objects.create_user(username="bob", password="password123")

        self.alice_node = UserGameServer.objects.create(
            user=self.alice,
            name="Alice Node",
            local_url="http://192.168.1.50:8090",
            auth_token="alice-token",
            is_active=True,
            is_online=True,
        )

        self.bob_node = UserGameServer.objects.create(
            user=self.bob,
            name="Bob Node",
            local_url="http://192.168.1.60:8090",
            auth_token="bob-token",
            is_active=True,
            is_online=True,
        )

    def tearDown(self):
        cache.clear()

    @patch("apps.library.services.media_activity.radarr_get_queue")
    @patch("apps.library.services.media_activity.radarr_get_movies")
    @patch("apps.library.services.media_activity.sonarr_get_queue")
    @patch("apps.library.services.media_activity.sonarr_get_series")
    def test_owned_node_media_activity(
        self, mock_sonarr_series, mock_sonarr_queue, mock_radarr_movies, mock_radarr_queue
    ):
        mock_radarr_queue.return_value = (
            200,
            {
                "records": [
                    {
                        "id": 101,
                        "size": 1000,
                        "sizeleft": 400,
                        "timeleft": "00:05:00",
                        "status": "Downloading",
                        "movie": {"tmdbId": 550, "title": "Fight Club", "year": 1999},
                    }
                ]
            },
        )
        mock_radarr_movies.return_value = (
            200,
            [
                {
                    "tmdbId": 680,
                    "title": "Pulp Fiction",
                    "year": 1994,
                    "hasFile": True,
                },
                {
                    "tmdbId": 155,
                    "title": "The Dark Knight",
                    "year": 2008,
                    "hasFile": False,
                },
            ],
        )
        mock_sonarr_queue.return_value = (200, {"records": []})
        mock_sonarr_series.return_value = (200, [])

        data = get_user_media_activity(self.alice)
        items = data["items"]

        # Fight Club: Processing (60% downloaded)
        self.assertIn("tmdb:movie:550", items)
        fc = items["tmdb:movie:550"]
        self.assertEqual(fc["status"], "processing")
        self.assertEqual(fc["progress"], 60.0)
        self.assertTrue(fc["is_owned"])
        self.assertTrue(fc["can_manage"])
        self.assertEqual(fc["node_name"], "Alice Node")

        # Pulp Fiction: Available
        self.assertIn("tmdb:movie:680", items)
        pf = items["tmdb:movie:680"]
        self.assertEqual(pf["status"], "available")
        self.assertTrue(pf["is_owned"])

        # The Dark Knight: Requested
        self.assertIn("tmdb:movie:155", items)
        dk = items["tmdb:movie:155"]
        self.assertEqual(dk["status"], "requested")

        summary = data["summary"]
        self.assertEqual(summary["total_processing"], 1)
        self.assertEqual(summary["total_available"], 1)
        self.assertEqual(summary["total_requested"], 1)

    @patch("apps.library.services.media_activity.radarr_get_queue")
    @patch("apps.library.services.media_activity.radarr_get_movies")
    @patch("apps.library.services.media_activity.sonarr_get_queue")
    @patch("apps.library.services.media_activity.sonarr_get_series")
    def test_owned_first_priority_over_friend_shared_node(
        self, mock_sonarr_series, mock_sonarr_queue, mock_radarr_movies, mock_radarr_queue
    ):
        """Alice owns a node where Movie 550 is Requested.
        Bob shares a node where Movie 550 is Available.
        Under Owned-First Priority, Alice's status for 550 remains Requested (owned).
        Bob's node also has Movie 999 which Alice doesn't track, so 999 appears from Bob's node.
        """
        UserNodeShare.objects.create(
            node=self.bob_node,
            shared_with=self.alice,
            permission="read",
        )

        def radarr_movies_side_effect(server):
            if server.id == self.alice_node.id:
                return (
                    200,
                    [
                        {"tmdbId": 550, "title": "Fight Club", "hasFile": False},
                    ],
                )
            if server.id == self.bob_node.id:
                return (
                    200,
                    [
                        {"tmdbId": 550, "title": "Fight Club", "hasFile": True},
                        {"tmdbId": 999, "title": "Bob Exclusive", "hasFile": True},
                    ],
                )
            return (200, [])

        mock_radarr_queue.return_value = (200, {"records": []})
        mock_radarr_movies.side_effect = radarr_movies_side_effect
        mock_sonarr_queue.return_value = (200, {"records": []})
        mock_sonarr_series.return_value = (200, [])

        data = get_user_media_activity(self.alice)
        items = data["items"]

        # 550 should be from Alice's owned node, keeping 'requested'
        self.assertIn("tmdb:movie:550", items)
        self.assertEqual(items["tmdb:movie:550"]["status"], "requested")
        self.assertTrue(items["tmdb:movie:550"]["is_owned"])
        self.assertEqual(items["tmdb:movie:550"]["node_name"], "Alice Node")

        # 999 is absent on Alice's node, so it falls back to Bob's node
        self.assertIn("tmdb:movie:999", items)
        self.assertEqual(items["tmdb:movie:999"]["status"], "available")
        self.assertFalse(items["tmdb:movie:999"]["is_owned"])
        self.assertFalse(items["tmdb:movie:999"]["can_manage"])  # read share
        self.assertEqual(items["tmdb:movie:999"]["owner"]["username"], "bob")

    def test_api_endpoint_authenticated(self):
        self.client.force_authenticate(user=self.alice)
        response = self.client.get("/api/v1/library/nodes/media-activity")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("items", response.data)
        self.assertIn("summary", response.data)

    def test_api_endpoint_unauthenticated(self):
        response = self.client.get("/api/v1/library/nodes/media-activity")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
