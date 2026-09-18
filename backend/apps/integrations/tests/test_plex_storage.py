"""Tests for the Plex storage optimization and savings recommendation service and endpoints."""

from datetime import UTC, datetime, timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.integrations.models import UserPlexItem, UserPlexLibrary, UserPlexServer
from apps.integrations.services.plex_storage import (
    analyze_storage_summary,
    extract_media_parts,
    get_storage_recommendations,
    list_owned_plex_servers,
    normalize_codec,
    normalize_resolution,
)

User = get_user_model()


class PlexStorageServiceTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username="charlie", password="password123")
        self.server1 = UserPlexServer.objects.create(
            user=self.user,
            machine_identifier="srv-1",
            name="Tower NAS",
            owned=True,
            base_url="http://192.168.1.50:32400",
        )
        self.server2 = UserPlexServer.objects.create(
            user=self.user,
            machine_identifier="srv-2",
            name="Friend Server",
            owned=False,
            base_url="http://10.0.0.5:32400",
        )
        self.movie_lib = UserPlexLibrary.objects.create(
            user=self.user,
            server=self.server1,
            section_key="1",
            title="Movies",
            library_type="movie",
        )
        self.tv_lib = UserPlexLibrary.objects.create(
            user=self.user,
            server=self.server1,
            section_key="2",
            title="TV Shows",
            library_type="show",
        )

    def test_extract_media_parts_and_normalizations(self):
        self.assertEqual(normalize_resolution("1080"), "1080p HD")
        self.assertEqual(normalize_resolution("4k"), "4K UHD")
        self.assertEqual(normalize_resolution("sd"), "SD")
        self.assertEqual(normalize_codec("h264"), "H.264 (AVC)")
        self.assertEqual(normalize_codec("hevc"), "HEVC (H.265)")
        self.assertEqual(normalize_codec("mpeg2video"), "MPEG-2")

        raw_payload = {
            "Media": [
                {
                    "videoResolution": "1080",
                    "videoCodec": "h264",
                    "bitrate": 10000,
                    "Part": [
                        {
                            "id": "p1",
                            "file": "/movies/film.mkv",
                            "size": 10_000_000_000,
                            "duration": 7200000,
                        }
                    ],
                }
            ]
        }
        parts = extract_media_parts(raw_payload)
        self.assertEqual(len(parts), 1)
        self.assertEqual(parts[0]["file"], "/movies/film.mkv")
        self.assertEqual(parts[0]["size"], 10_000_000_000)
        self.assertEqual(parts[0]["video_codec_label"], "H.264 (AVC)")
        self.assertEqual(parts[0]["video_resolution_label"], "1080p HD")

    def test_list_owned_servers(self):
        servers = list_owned_plex_servers(self.user)
        self.assertEqual(len(servers), 2)
        # Server 1 is owned=True so it comes first
        self.assertTrue(servers[0]["owned"])
        self.assertEqual(servers[0]["name"], "Tower NAS")

    def test_analyze_storage_summary_and_recommendations(self):
        old_time = int((datetime.now(UTC) - timedelta(days=200)).timestamp())

        # 1. Duplicate movie (has 4K 50GB and 1080p 10GB versions)
        UserPlexItem.objects.create(
            user=self.user,
            server=self.server1,
            library=self.movie_lib,
            rating_key="m1",
            title="Dune",
            year=2021,
            media_type="movie",
            view_count=1,
            viewed=True,
            raw={
                "addedAt": old_time,
                "Media": [
                    {
                        "videoResolution": "4k",
                        "videoCodec": "hevc",
                        "Part": [
                            {"id": "p4k", "file": "/movies/Dune.4k.mkv", "size": 50_000_000_000}
                        ],
                    },
                    {
                        "videoResolution": "1080",
                        "videoCodec": "h264",
                        "Part": [
                            {
                                "id": "p1080",
                                "file": "/movies/Dune.1080p.mkv",
                                "size": 10_000_000_000,
                            }
                        ],
                    },
                ],
            },
        )

        # 2. Transcode candidate: Large H.264 movie (12 GB)
        UserPlexItem.objects.create(
            user=self.user,
            server=self.server1,
            library=self.movie_lib,
            rating_key="m2",
            title="Old Film",
            year=1995,
            media_type="movie",
            view_count=3,
            viewed=True,
            raw={
                "addedAt": old_time,
                "Media": [
                    {
                        "videoResolution": "1080",
                        "videoCodec": "h264",
                        "Part": [
                            {"id": "p-old", "file": "/movies/OldFilm.mkv", "size": 12_000_000_000}
                        ],
                    }
                ],
            },
        )

        # 3. Dead weight: Unwatched movie added 200 days ago (20 GB)
        UserPlexItem.objects.create(
            user=self.user,
            server=self.server1,
            library=self.movie_lib,
            rating_key="m3",
            title="Unwatched Epic",
            year=2018,
            media_type="movie",
            view_count=0,
            viewed=False,
            raw={
                "addedAt": old_time,
                "Media": [
                    {
                        "videoResolution": "1080",
                        "videoCodec": "hevc",
                        "Part": [
                            {
                                "id": "p-unwatched",
                                "file": "/movies/Unwatched.mkv",
                                "size": 20_000_000_000,
                            }
                        ],
                    }
                ],
            },
        )

        # 4. Watched TV show (8 GB)
        UserPlexItem.objects.create(
            user=self.user,
            server=self.server1,
            library=self.tv_lib,
            rating_key="t1",
            title="Mini Series",
            year=2020,
            media_type="show",
            view_count=5,
            viewed=True,
            raw={
                "addedAt": old_time,
                "Media": [
                    {
                        "videoResolution": "1080",
                        "videoCodec": "hevc",
                        "Part": [
                            {
                                "id": "p-show",
                                "file": "/tv/MiniSeries/ep1.mkv",
                                "size": 8_000_000_000,
                            }
                        ],
                    }
                ],
            },
        )

        summary = analyze_storage_summary(self.user, server_id=self.server1.id)
        # Total size: 60GB + 12GB + 20GB + 8GB = 100GB
        self.assertEqual(summary["total_bytes"], 100_000_000_000)
        self.assertEqual(summary["total_items"], 4)
        self.assertEqual(summary["total_files"], 5)

        # Check duplicates recommendation
        dups = get_storage_recommendations(
            self.user, server_id=self.server1.id, category="duplicates"
        )
        self.assertEqual(dups["total_count"], 1)
        self.assertEqual(dups["items"][0]["title"], "Dune")
        self.assertEqual(dups["items"][0]["reclaimable_bytes"], 10_000_000_000)

        # Check transcode recommendation
        transcodes = get_storage_recommendations(
            self.user, server_id=self.server1.id, category="transcode"
        )
        self.assertGreaterEqual(transcodes["total_count"], 1)
        # Old Film: 12GB * 0.45 = 5.4GB
        old_film = next(item for item in transcodes["items"] if item["title"] == "Old Film")
        self.assertEqual(old_film["estimated_savings_bytes"], int(12_000_000_000 * 0.45))

        # Check unwatched recommendation
        unwatched = get_storage_recommendations(
            self.user, server_id=self.server1.id, category="unwatched"
        )
        self.assertEqual(unwatched["total_count"], 1)
        self.assertEqual(unwatched["items"][0]["title"], "Unwatched Epic")
        self.assertEqual(unwatched["items"][0]["reclaimable_bytes"], 20_000_000_000)

        # Check largest files
        largest = get_storage_recommendations(
            self.user, server_id=self.server1.id, category="largest_files"
        )
        self.assertEqual(largest["total_count"], 4)
        self.assertEqual(largest["items"][0]["title"], "Dune")  # 60 GB total

    def tearDown(self):
        cache.clear()


class PlexStorageEndpointsTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username="david", password="password123")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

        self.server = UserPlexServer.objects.create(
            user=self.user,
            machine_identifier="srv-david",
            name="David Plex",
            owned=True,
            base_url="http://192.168.1.100:32400",
        )
        self.library = UserPlexLibrary.objects.create(
            user=self.user,
            server=self.server,
            section_key="1",
            title="Movies",
            library_type="movie",
        )
        UserPlexItem.objects.create(
            user=self.user,
            server=self.server,
            library=self.library,
            rating_key="101",
            title="Inception",
            year=2010,
            media_type="movie",
            view_count=1,
            viewed=True,
            raw={
                "Media": [
                    {
                        "videoResolution": "1080",
                        "videoCodec": "h264",
                        "Part": [
                            {"id": "p1", "file": "/movies/Inception.mkv", "size": 15_000_000_000}
                        ],
                    }
                ]
            },
        )

    def test_storage_servers_endpoint(self):
        url = reverse("integrations:plex-storage-servers")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["servers"]), 1)
        self.assertEqual(response.data["servers"][0]["name"], "David Plex")
        self.assertTrue(response.data["servers"][0]["owned"])

    def test_storage_summary_endpoint(self):
        url = reverse("integrations:plex-storage-summary")
        response = self.client.get(f"{url}?server_id={self.server.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_bytes"], 15_000_000_000)
        self.assertEqual(response.data["total_items"], 1)

    def test_storage_recommendations_endpoint(self):
        url = reverse("integrations:plex-storage-recommendations")
        response = self.client.get(f"{url}?server_id={self.server.id}&category=transcode")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["category"], "transcode")
        self.assertEqual(response.data["total_count"], 1)
        self.assertEqual(response.data["items"][0]["title"], "Inception")

    def test_storage_refresh_endpoint(self):
        url = reverse("integrations:plex-storage-refresh")
        response = self.client.post(url, {"server_id": self.server.id}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
