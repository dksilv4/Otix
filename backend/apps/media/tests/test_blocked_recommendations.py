"""Unit and API tests for blocking media from recommendations."""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.media.models import MediaItem, Movie
from apps.media.services import catalog as catalog_service

User = get_user_model()


def _unit(i: int, dim: int = 1024) -> list[float]:
    vec = [0.01] * dim
    vec[i % dim] = 1.0
    return vec


class BlockedRecommendationsServiceTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="blocker", password="password123")
        self.item_a = MediaItem.objects.create(
            media_type="movie",
            title="Movie A",
            slug="movie-a",
            release_date=date(2022, 1, 1),
            popularity=50,
            embedding=_unit(10),
        )
        Movie.objects.create(media_item=self.item_a, runtime=100)

        self.item_b = MediaItem.objects.create(
            media_type="movie",
            title="Movie B",
            slug="movie-b",
            release_date=date(2022, 2, 1),
            popularity=40,
            embedding=_unit(10),
        )
        Movie.objects.create(media_item=self.item_b, runtime=110)

    def test_block_and_unblock_service(self) -> None:
        # Block item_a
        created, item = catalog_service.block_media_recommendation(self.user, self.item_a.pk)
        self.assertTrue(created)
        self.assertEqual(item.pk, self.item_a.pk)

        # Idempotent re-block
        created2, item2 = catalog_service.block_media_recommendation(self.user, self.item_a.pk)
        self.assertFalse(created2)
        self.assertEqual(item2.pk, self.item_a.pk)

        # List blocked items
        blocked = catalog_service.list_blocked_recommendations(self.user)
        self.assertEqual([b.pk for b in blocked], [self.item_a.pk])

        # Unblock item_a
        unblocked = catalog_service.unblock_media_recommendation(self.user, self.item_a.pk)
        self.assertTrue(unblocked)

        # Re-unblock returns False
        unblocked2 = catalog_service.unblock_media_recommendation(self.user, self.item_a.pk)
        self.assertFalse(unblocked2)
        self.assertEqual(catalog_service.list_blocked_recommendations(self.user), [])

    def test_decide_items_excludes_blocked_media(self) -> None:
        # Before blocking, both items are candidates
        items, _ = catalog_service.decide_items(self.user, media_types=["movie"], limit=5, seed=1)
        pks = [i.pk for i in items]
        self.assertIn(self.item_a.pk, pks)
        self.assertIn(self.item_b.pk, pks)

        # Block item_a
        catalog_service.block_media_recommendation(self.user, self.item_a.pk)

        items_after, _ = catalog_service.decide_items(
            self.user, media_types=["movie"], limit=5, seed=1
        )
        pks_after = [i.pk for i in items_after]
        self.assertNotIn(self.item_a.pk, pks_after)
        self.assertIn(self.item_b.pk, pks_after)

    def test_blocked_remains_excluded_after_taste_reset(self) -> None:
        catalog_service.block_media_recommendation(self.user, self.item_a.pk)

        # Taste reset
        self.user.taste_reset_at = timezone.now() + timedelta(seconds=1)
        self.user.save(update_fields=["taste_reset_at", "updated_at"])

        items, _ = catalog_service.decide_items(self.user, media_types=["movie"], limit=5, seed=1)
        pks = [i.pk for i in items]
        self.assertNotIn(self.item_a.pk, pks)

    def test_recommended_items_excludes_blocked_media(self) -> None:
        catalog_service.block_media_recommendation(self.user, self.item_b.pk)

        recs = catalog_service.recommended_items(
            self.item_a.pk,
            media_type="movie",
            limit=5,
            user=self.user,
        )
        rec_pks = [r.pk for r in recs]
        self.assertNotIn(self.item_b.pk, rec_pks)


class BlockedRecommendationsApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="api-blocker", password="password123")
        self.client = APIClient()
        self.item = MediaItem.objects.create(
            media_type="movie",
            title="Block Me",
            slug="block-me",
            release_date=date(2023, 1, 1),
            popularity=60,
            embedding=_unit(1),
        )
        Movie.objects.create(media_item=self.item, runtime=90)

    def test_unauthenticated_blocked_401(self) -> None:
        resp = self.client.post(f"/api/v1/media/{self.item.pk}/block-recommendation")
        self.assertEqual(resp.status_code, 401)

    def test_block_and_unblock_api(self) -> None:
        self.client.force_authenticate(user=self.user)

        # POST block
        resp = self.client.post(f"/api/v1/media/{self.item.pk}/block-recommendation")
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data["blocked"])
        self.assertTrue(resp.data["created"])
        self.assertEqual(resp.data["media_id"], self.item.pk)

        # GET list
        list_resp = self.client.get("/api/v1/media/blocked-recommendations")
        self.assertEqual(list_resp.status_code, 200)
        self.assertEqual(list_resp.data["total"], 1)
        self.assertEqual(list_resp.data["items"][0]["id"], self.item.pk)

        # DELETE unblock
        del_resp = self.client.delete(f"/api/v1/media/{self.item.pk}/block-recommendation")
        self.assertEqual(del_resp.status_code, 200)
        self.assertFalse(del_resp.data["blocked"])
        self.assertTrue(del_resp.data["unblocked"])

        # GET list again
        list_resp2 = self.client.get("/api/v1/media/blocked-recommendations")
        self.assertEqual(list_resp2.data["total"], 0)
