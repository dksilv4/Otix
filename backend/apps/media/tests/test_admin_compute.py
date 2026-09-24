"""Tests for the admin-only distributed compute views."""

import io
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.media.models import MediaAsset, MediaItem

User = get_user_model()


def _make_dummy_image(fmt="WEBP", width=200, height=300):
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(50, 100, 150))
    img.save(buf, format=fmt)
    return buf.getvalue()


class AdminComputeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="regular", password="pwd")
        self.user_token = Token.objects.create(user=self.user)
        self.admin = User.objects.create_user(username="admin", password="pwd", is_staff=True)
        self.admin_token = Token.objects.create(user=self.admin)

        self.anon_client = APIClient()
        self.user_client = APIClient()
        self.user_client.credentials(HTTP_AUTHORIZATION=f"Token {self.user_token.key}")
        self.admin_client = APIClient()
        self.admin_client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")

        self.item = MediaItem.objects.create(
            media_type="movie",
            title="Inception",
            slug="inception",
            popularity=95.5,
        )
        self.asset1 = MediaAsset.objects.create(
            media_item=self.item,
            asset_type="poster",
            url="https://example.com/poster.jpg",
        )
        self.asset2 = MediaAsset.objects.create(
            media_item=self.item,
            asset_type="backdrop",
            url="https://example.com/backdrop.jpg",
        )

    def test_claim_permissions(self):
        # Anonymous -> 401
        res = self.anon_client.post(
            "/api/v1/media/admin/compute/claim", {"batch_size": 5}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        # Regular user (non-staff) -> 403 Forbidden
        res = self.user_client.post(
            "/api/v1/media/admin/compute/claim", {"batch_size": 5}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_claim_and_lease(self):
        fake_redis = {}

        def fake_get_client():
            class FakeRedis:
                def exists(self, key):
                    return key in fake_redis

                def set(self, key, val, ex=None):
                    fake_redis[key] = val

                def delete(self, key):
                    fake_redis.pop(key, None)

            return FakeRedis()

        with patch("apps.media.views.admin_compute.get_client", side_effect=fake_get_client):
            res = self.admin_client.post(
                "/api/v1/media/admin/compute/claim", {"batch_size": 2}, format="json"
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            data = res.json()
            self.assertEqual(data["count"], 2)
            self.assertEqual(len(data["jobs"]), 2)
            claimed_ids = {j["asset_id"] for j in data["jobs"]}
            self.assertIn(self.asset1.pk, claimed_ids)
            self.assertIn(self.asset2.pk, claimed_ids)

            # Second claim should find 0 candidates because both are currently leased
            res2 = self.admin_client.post(
                "/api/v1/media/admin/compute/claim", {"batch_size": 2}, format="json"
            )
            self.assertEqual(res2.status_code, status.HTTP_200_OK)
            self.assertEqual(res2.json()["count"], 0)

    def test_submit_valid_webp(self):
        img_bytes = _make_dummy_image(fmt="WEBP", width=400, height=600)
        uploaded = SimpleUploadedFile("test.webp", img_bytes, content_type="image/webp")

        res = self.admin_client.post(
            "/api/v1/media/admin/compute/submit",
            {
                "asset_id": self.asset1.pk,
                "file": uploaded,
                "color_guess": "#326496",
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["asset_id"], self.asset1.pk)
        self.assertEqual(data["width"], 400)
        self.assertEqual(data["height"], 600)
        self.assertEqual(data["format"], "WEBP")

        # Verify MediaAsset in database
        self.asset1.refresh_from_db()
        self.assertIsNotNone(self.asset1.local_name)
        self.assertTrue(self.asset1.local_name.endswith(".webp"))
        self.assertEqual(self.asset1.local_size, len(img_bytes))
        self.assertEqual(self.asset1.color_guess, "#326496")
        self.assertIsNotNone(self.asset1.downloaded_at)

    def test_submit_corrupted_image_rejected(self):
        bad_file = SimpleUploadedFile(
            "fake.webp", b"this is not an image file", content_type="image/webp"
        )
        res = self.admin_client.post(
            "/api/v1/media/admin/compute/submit",
            {
                "asset_id": self.asset2.pk,
                "file": bad_file,
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Corrupted or invalid image data", res.json()["error"])

        self.asset2.refresh_from_db()
        self.assertIsNone(self.asset2.local_name)

    def test_release_and_stats(self):
        fake_redis = {}

        def fake_get_client():
            class FakeRedis:
                def exists(self, key):
                    return key in fake_redis

                def set(self, key, val, ex=None):
                    fake_redis[key] = val

                def delete(self, key):
                    fake_redis.pop(key, None)

            return FakeRedis()

        with patch("apps.media.views.admin_compute.get_client", side_effect=fake_get_client):
            # Claim
            self.admin_client.post(
                "/api/v1/media/admin/compute/claim", {"batch_size": 1}, format="json"
            )

            # Release
            res = self.admin_client.post(
                "/api/v1/media/admin/compute/release",
                {"asset_ids": [self.asset1.pk, self.asset2.pk], "media_ids": [self.item.pk]},
                format="json",
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.json()["released"], 3)

            # Stats
            stats_res = self.admin_client.get("/api/v1/media/admin/compute/stats")
            self.assertEqual(stats_res.status_code, status.HTTP_200_OK)
            self.assertIn("unmirrored_candidates", stats_res.json())

    def test_claim_grouped_by_media(self):
        fake_redis = {}

        def fake_get_client():
            class FakeRedis:
                def exists(self, key):
                    return key in fake_redis

                def set(self, key, val, ex=None):
                    fake_redis[key] = val

                def delete(self, key):
                    fake_redis.pop(key, None)

            return FakeRedis()

        with patch("apps.media.views.admin_compute.get_client", side_effect=fake_get_client):
            res = self.admin_client.post(
                "/api/v1/media/admin/compute/claim",
                {"batch_size": 5, "group_by_media": True},
                format="json",
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            data = res.json()
            self.assertTrue(data.get("grouped_by_media"))
            self.assertEqual(data["count"], 1)
            media_job = data["media_jobs"][0]
            self.assertEqual(media_job["media_item_id"], self.item.pk)
            self.assertEqual(len(media_job["assets"]), 2)
            self.assertTrue(media_job["needs_enrichment"])

    def test_submit_enrichment(self):
        from apps.media.models import MediaCharacter
        from apps.people.models import MediaCredit, Person

        payload = {
            "media_item_id": self.item.pk,
            "cast": [
                {
                    "person_name": "Leonardo DiCaprio",
                    "character_name": "Cobb",
                    "photo_url": "https://example.com/leo.jpg",
                }
            ],
            "crew": [
                {
                    "person_name": "Christopher Nolan",
                    "role": "director",
                }
            ],
            "characters": [
                {
                    "character_name": "Cobb",
                    "description": "Extractor",
                    "wikidata_id": "Q9999",
                    "image_url": "https://example.com/cobb.jpg",
                }
            ],
        }

        res = self.admin_client.post(
            "/api/v1/media/admin/compute/enrichment",
            payload,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["credits_added"], 2)
        self.assertEqual(data["characters_added"], 1)

        # Verify database
        self.assertTrue(Person.objects.filter(name="Leonardo DiCaprio").exists())
        self.assertTrue(Person.objects.filter(name="Christopher Nolan").exists())
        self.assertTrue(MediaCredit.objects.filter(media_item=self.item, role="cast").exists())
        self.assertTrue(MediaCredit.objects.filter(media_item=self.item, role="director").exists())
        self.assertTrue(MediaCharacter.objects.filter(media_item=self.item).exists())
        from apps.media.models import Character, CharacterAsset

        cobb = Character.objects.get(name="Cobb")
        self.assertEqual(cobb.mug_shot_url, "https://example.com/cobb.jpg")
        self.assertTrue(
            CharacterAsset.objects.filter(
                character=cobb, url="https://example.com/cobb.jpg"
            ).exists()
        )

    def test_claim_embeddings(self):
        res = self.admin_client.post(
            "/api/v1/media/admin/compute/claim",
            {"task": "embeddings", "batch_size": 10},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data["task"], "embeddings")
        self.assertGreaterEqual(data["count"], 1)
        found_item = next((it for it in data["items"] if it["media_item_id"] == self.item.pk), None)
        self.assertIsNotNone(found_item)
        self.assertIn("Title: Inception", found_item["text"])

    def test_submit_embeddings_valid(self):
        # Create a valid 1024-dimensional vector
        dummy_vector = [0.01 * (i % 50) for i in range(1024)]
        payload = {
            "embeddings": [
                {
                    "media_item_id": self.item.pk,
                    "vector": dummy_vector,
                }
            ]
        }
        res = self.admin_client.post(
            "/api/v1/media/admin/compute/embeddings",
            payload,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["updated"], 1)

        # Verify DB persistence
        self.item.refresh_from_db()
        self.assertIsNotNone(self.item.embedding)
        self.assertEqual(len(self.item.embedding), 1024)
        self.assertIsNotNone(self.item.embedded_at)

    def test_submit_embeddings_invalid_dimensions(self):
        # 512 dimensions instead of 1024 -> rejected
        short_vector = [0.1] * 512
        payload = {
            "embeddings": [
                {
                    "media_item_id": self.item.pk,
                    "vector": short_vector,
                }
            ]
        }
        res = self.admin_client.post(
            "/api/v1/media/admin/compute/embeddings",
            payload,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_semantic_search(self):
        # First set embedding on self.item
        dummy_vector = [0.05] * 1024
        self.item.embedding = dummy_vector
        self.item.save(update_fields=["embedding"])

        # Query semantic search with exact vector
        res = self.anon_client.post(
            "/api/v1/search/semantic",
            {"vector": dummy_vector},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertGreaterEqual(data["total"], 1)
        top_hit = data["items"][0]
        self.assertEqual(top_hit["id"], self.item.pk)
        self.assertEqual(top_hit["title"], "Inception")
        self.assertAlmostEqual(top_hit["similarity"], 1.0, places=2)
