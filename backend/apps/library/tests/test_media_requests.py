from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.library.models import UserMediaRequest, UserNode


class MediaRequestsTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="testrequester",
            email="requester@example.com",
            password="testpassword123",
        )
        self.server = UserNode.objects.create(
            user=self.user,
            name="Alpha Node",
            local_url="http://192.168.1.50:8090",
            auth_token="alpha-token",
        )
        self.client.force_authenticate(user=self.user)

    def test_create_and_list_media_requests(self):
        # 1. POST /api/v1/library/requests
        post_data = {
            "server_id": self.server.id,
            "service": "radarr",
            "media_type": "movie",
            "title": "Interstellar",
            "year": 2014,
            "tmdb_id": "157336",
            "poster_url": "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
            "instance_name": "Radarr 4K",
            "quality_profile_name": "Ultra HD",
            "root_folder_path": "/data/movies",
        }
        res = self.client.post("/api/v1/library/requests", post_data, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        req_id = res.data["id"]
        self.assertEqual(res.data["title"], "Interstellar")
        self.assertEqual(res.data["tmdb_id"], "157336")
        self.assertEqual(res.data["server_name"], "Alpha Node")

        # 2. GET /api/v1/library/requests
        list_res = self.client.get("/api/v1/library/requests")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        items = list_res.data["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], req_id)
        self.assertEqual(items[0]["title"], "Interstellar")

        # 3. DELETE /api/v1/library/requests/<id>
        del_res = self.client.delete(f"/api/v1/library/requests/{req_id}")
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)
        self.assertEqual(UserMediaRequest.objects.count(), 0)

    @patch("apps.library.views.nodes.radarr_add_movie")
    def test_radarr_add_movie_automatically_records_request(self, mock_add_movie):
        mock_add_movie.return_value = (
            201,
            {
                "id": 999,
                "title": "Inception",
                "tmdbId": 27205,
                "year": 2010,
                "monitored": True,
            },
        )
        payload = {
            "title": "Inception",
            "tmdb_id": 27205,
            "year": 2010,
            "monitored": True,
            "search_for_movie": True,
            "quality_profile_id": 1,
            "root_folder_path": "/movies",
        }
        res = self.client.post(
            f"/api/v1/library/servers/{self.server.id}/radarr/movies",
            payload,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        req = UserMediaRequest.objects.filter(user=self.user, tmdb_id="27205").first()
        self.assertIsNotNone(req)
        self.assertEqual(req.title, "Inception")
        self.assertEqual(req.service, "radarr")
        self.assertEqual(req.media_type, "movie")
        self.assertEqual(req.external_id, "999")

    @patch("apps.library.views.nodes.sonarr_add_series")
    def test_sonarr_add_series_automatically_records_request(self, mock_add_series):
        mock_add_series.return_value = (
            201,
            {
                "id": 888,
                "title": "Breaking Bad",
                "tvdbId": 81189,
                "year": 2008,
            },
        )
        payload = {
            "title": "Breaking Bad",
            "tvdb_id": 81189,
            "year": 2008,
            "monitored": True,
            "search_for_missing_episodes": True,
            "quality_profile_id": 2,
            "root_folder_path": "/tv",
        }
        res = self.client.post(
            f"/api/v1/library/servers/{self.server.id}/sonarr/series",
            payload,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        req = UserMediaRequest.objects.filter(user=self.user, tvdb_id="81189").first()
        self.assertIsNotNone(req)
        self.assertEqual(req.title, "Breaking Bad")
        self.assertEqual(req.service, "sonarr")
        self.assertEqual(req.media_type, "show")
        self.assertEqual(req.external_id, "888")
