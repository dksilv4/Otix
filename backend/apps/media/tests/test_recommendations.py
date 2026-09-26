"""Unit tests for embedding-backed similar / For You recommendations."""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.media.models import MediaItem
from apps.media.services import catalog as catalog_service
from apps.social.models import MediaItemRating, UserMediaInteraction

User = get_user_model()


def _unit(i: int, dim: int = 1024) -> list[float]:
    """Near-orthogonal-ish vector with a spike at index i % dim."""
    vec = [0.01] * dim
    vec[i % dim] = 1.0
    return vec


class RecommendationEmbeddingTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="tasteful", password="a-strong-pass")
        self.source = MediaItem.objects.create(
            media_type="movie",
            title="Source",
            slug="source",
            release_date=date(2020, 1, 1),
            popularity=50,
            embedding=_unit(0),
        )
        # Tight neighbor of source (same spike).
        self.near_source = MediaItem.objects.create(
            media_type="movie",
            title="Near Source",
            slug="near-source",
            release_date=date(2020, 2, 1),
            popularity=40,
            embedding=_unit(0),
        )
        # Tight neighbor of the user's liked title (different spike).
        self.liked = MediaItem.objects.create(
            media_type="movie",
            title="Liked Seed",
            slug="liked-seed",
            release_date=date(2019, 1, 1),
            popularity=30,
            embedding=_unit(100),
        )
        self.near_liked = MediaItem.objects.create(
            media_type="movie",
            title="Near Liked",
            slug="near-liked",
            release_date=date(2019, 2, 1),
            popularity=20,
            embedding=_unit(100),
        )
        MediaItemRating.objects.create(user=self.user, media_item=self.liked, score=9)
        UserMediaInteraction.objects.create(
            user=self.user, media_item=self.liked, interaction_type="liked"
        )

    def test_similar_prefers_embedding_neighbors(self) -> None:
        hits = catalog_service.similar_items(self.source.pk, "movie", 5)
        ids = [item.pk for item in hits]
        self.assertIn(self.near_source.pk, ids)
        self.assertEqual(ids[0], self.near_source.pk)

    def test_recommended_blends_toward_user_taste(self) -> None:
        similar = catalog_service.similar_items(self.source.pk, "movie", 5)
        for_you = catalog_service.recommended_items(
            self.source.pk, "movie", 5, user=self.user
        )
        similar_ids = [item.pk for item in similar]
        for_you_ids = [item.pk for item in for_you]

        # Similar stays near the page title; For You should surface the
        # taste-adjacent title and hide the already-liked seed.
        self.assertEqual(similar_ids[0], self.near_source.pk)
        self.assertIn(self.near_liked.pk, for_you_ids)
        self.assertNotIn(self.liked.pk, for_you_ids)

    def test_taste_reset_ignores_prior_seeds(self) -> None:
        self.user.taste_reset_at = timezone.now() + timedelta(seconds=1)
        self.user.save(update_fields=["taste_reset_at", "updated_at"])

        for_you = catalog_service.recommended_items(
            self.source.pk, "movie", 5, user=self.user
        )
        for_you_ids = [item.pk for item in for_you]
        # After reset, the liked seed no longer pulls recommendations toward
        # its neighborhood — near_source should lead again.
        self.assertEqual(for_you_ids[0], self.near_source.pk)
        self.assertNotIn(self.near_liked.pk, for_you_ids[:1])
