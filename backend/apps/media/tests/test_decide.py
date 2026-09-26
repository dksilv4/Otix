"""Unit tests for the standalone Decide-for-me picker."""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.media.models import Genre, MediaGenre, MediaItem, Movie
from apps.media.services import catalog as catalog_service
from apps.social.models import MediaItemRating, UserMediaInteraction

User = get_user_model()


def _unit(i: int, dim: int = 1024) -> list[float]:
    vec = [0.01] * dim
    vec[i % dim] = 1.0
    return vec


class DecideItemsServiceTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="decider", password="a-strong-pass")
        self.genre_a = Genre.objects.create(name="Action", slug="action")
        self.genre_b = Genre.objects.create(name="Drama", slug="drama")

        self.liked = MediaItem.objects.create(
            media_type="movie",
            title="Liked Seed",
            slug="liked-seed",
            release_date=date(2019, 1, 1),
            popularity=30,
            embedding=_unit(100),
        )
        Movie.objects.create(media_item=self.liked, runtime=120)
        MediaGenre.objects.create(media_item=self.liked, genre=self.genre_a)

        self.near_liked = MediaItem.objects.create(
            media_type="movie",
            title="Near Liked",
            slug="near-liked",
            release_date=date(2019, 2, 1),
            popularity=20,
            embedding=_unit(100),
        )
        Movie.objects.create(media_item=self.near_liked, runtime=95)
        MediaGenre.objects.create(media_item=self.near_liked, genre=self.genre_a)

        self.other = MediaItem.objects.create(
            media_type="movie",
            title="Other Neighborhood",
            slug="other-neighborhood",
            release_date=date(2020, 1, 1),
            popularity=80,
            embedding=_unit(0),
        )
        Movie.objects.create(media_item=self.other, runtime=200)
        MediaGenre.objects.create(media_item=self.other, genre=self.genre_b)

        self.short_hit = MediaItem.objects.create(
            media_type="movie",
            title="Short Near Liked",
            slug="short-near-liked",
            release_date=date(2019, 3, 1),
            popularity=15,
            embedding=_unit(100),
        )
        Movie.objects.create(media_item=self.short_hit, runtime=85)
        MediaGenre.objects.create(media_item=self.short_hit, genre=self.genre_a)

        self.show_hit = MediaItem.objects.create(
            media_type="show",
            title="Show Near Liked",
            slug="show-near-liked",
            release_date=date(2018, 1, 1),
            popularity=25,
            embedding=_unit(100),
        )

        MediaItemRating.objects.create(user=self.user, media_item=self.liked, score=9)
        UserMediaInteraction.objects.create(
            user=self.user, media_item=self.liked, interaction_type="liked"
        )

    def test_decide_excludes_seen_and_ranks_taste(self) -> None:
        items, cold = catalog_service.decide_items(
            self.user, media_types=["movie"], limit=5, seed=1
        )
        ids = [item.pk for item in items]
        self.assertFalse(cold)
        self.assertNotIn(self.liked.pk, ids)
        self.assertIn(self.near_liked.pk, ids)

    def test_genre_filter_constrains_results(self) -> None:
        items, _ = catalog_service.decide_items(
            self.user,
            media_types=["movie"],
            genre_ids=[self.genre_b.pk],
            limit=5,
            seed=1,
        )
        for item in items:
            self.assertTrue(
                item.media_genres.filter(genre_id=self.genre_b.pk).exists()
            )

    def test_runtime_filter_short(self) -> None:
        items, _ = catalog_service.decide_items(
            self.user,
            media_types=["movie"],
            runtime="short",
            limit=5,
            seed=1,
        )
        ids = [item.pk for item in items]
        self.assertIn(self.short_hit.pk, ids)
        self.assertNotIn(self.other.pk, ids)
        for item in items:
            self.assertLessEqual(item.movie.runtime, 90)

    def test_media_type_filter(self) -> None:
        items, _ = catalog_service.decide_items(
            self.user, media_types=["show"], limit=5, seed=1
        )
        self.assertTrue(all(item.media_type == "show" for item in items))
        self.assertIn(self.show_hit.pk, [item.pk for item in items])

    def test_cold_start_popularity(self) -> None:
        cold_user = User.objects.create_user(username="cold", password="a-strong-pass")
        items, cold = catalog_service.decide_items(
            cold_user, media_types=["movie"], limit=5, seed=1
        )
        self.assertTrue(cold)
        self.assertGreaterEqual(len(items), 1)

    def test_taste_reset_ignores_prior_seeds(self) -> None:
        self.user.taste_reset_at = timezone.now() + timedelta(seconds=1)
        self.user.save(update_fields=["taste_reset_at", "updated_at"])
        items, cold = catalog_service.decide_items(
            self.user, media_types=["movie"], limit=5, seed=1
        )
        self.assertTrue(cold)
        ids = [item.pk for item in items]
        # Liked seed is again eligible after reset (seen filter scoped to epoch).
        # Near-liked may still appear via popularity; assert cold path ran.
        self.assertTrue(len(ids) >= 1)


class DecideWatchApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="api-decider", password="a-strong-pass")
        self.client = APIClient()
        self.item = MediaItem.objects.create(
            media_type="movie",
            title="Popular",
            slug="popular-decide",
            release_date=date(2021, 1, 1),
            popularity=99,
            embedding=_unit(5),
        )
        Movie.objects.create(media_item=self.item, runtime=100)

    def test_unauthenticated_401(self) -> None:
        response = self.client.get("/api/v1/media/decide")
        self.assertEqual(response.status_code, 401)

    def test_authenticated_returns_pick_shape(self) -> None:
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/v1/media/decide", {"limit": 5, "seed": 42})
        self.assertEqual(response.status_code, 200)
        self.assertIn("pick", response.data)
        self.assertIn("shortlist", response.data)
        self.assertIn("cold_start", response.data)
        self.assertTrue(response.data["cold_start"])
        self.assertIsNotNone(response.data["pick"])
        self.assertEqual(response.data["pick"]["id"], self.item.pk)
