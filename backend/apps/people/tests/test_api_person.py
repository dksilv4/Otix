"""Endpoint tests for the person API area (DRF).

Covers list/search/detail/follow/rating with concrete URLs, mirroring the legacy
FastAPI status codes and response keys.
"""

from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.media.models import Episode, ExternalID, MediaItem, Season, Show
from apps.people.models import MediaCredit, Person, PersonRating, UserPersonFollow

User = get_user_model()

DETAIL_KEYS = {
    "id",
    "name",
    "tmdb_id",
    "imdb_id",
    "photo_url",
    "biography",
    "birthday",
    "deathday",
    "place_of_birth",
    "synced_at",
    "follower_count",
    "is_followed",
    "avg_rating",
    "user_rating",
    "rating_count",
    "credits",
}


class PersonApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="a-strong-pass")
        self.token = Token.objects.create(user=self.user)

        self.client = APIClient()  # anonymous
        self.auth_client = APIClient()
        self.auth_client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

        self.alicia = Person.objects.create(
            name="Alicia Vikander",
            photo_url="https://img.example.com/alicia.jpg",
            biography="Swedish actress.",
            birthday=date(1988, 10, 3),
            place_of_birth="Gothenburg, Sweden",
        )
        self.trent = Person.objects.create(name="Trent Reznor", place_of_birth="Mercer, PA")

        person_type = ContentType.objects.get_for_model(Person)
        ExternalID.objects.create(
            content_type=person_type,
            object_id=self.alicia.pk,
            provider="tmdb",
            external_id="64671",
        )
        ExternalID.objects.create(
            content_type=person_type,
            object_id=self.alicia.pk,
            provider="imdb",
            external_id="nm0000705",
        )

        media_item = MediaItem.objects.create(
            media_type="show", title="Chernobyl", slug="chernobyl"
        )
        show = Show.objects.create(media_item=media_item)
        season = Season.objects.create(show=show, season_number=1, name="Miniseries")
        Episode.objects.create(
            season=season, episode_number=1, name="1:23:45", air_date=date(2019, 5, 6)
        )
        MediaCredit.objects.create(
            media_item=media_item,
            person=self.alicia,
            role="Actor",
            character_name="Valery Legasov",
            sort_order=0,
        )

    # --- list ---
    def test_list_is_public_and_paginated_summaries(self) -> None:
        # Note: the empty list route resolves at ``/api/v1/person/`` because
        # ``config/urls.py`` mounts the include with a trailing slash.
        response = self.client.get("/api/v1/person/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data.keys()), {"count", "next", "previous", "results"})
        self.assertEqual(response.data["count"], 2)
        names = [item["name"] for item in response.data["results"]]
        self.assertIn("Alicia Vikander", names)
        first = response.data["results"][0]
        self.assertEqual(
            set(first.keys()), {"id", "name", "photo_url", "birthday", "place_of_birth"}
        )
        # Ordered by name.
        self.assertEqual(names, ["Alicia Vikander", "Trent Reznor"])

    # --- search ---
    def test_search_returns_matching_person(self) -> None:
        response = self.client.get("/api/v1/person/search", {"q": "alicia"})
        self.assertEqual(response.status_code, 200)
        results = response.data["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "Alicia Vikander")
        self.assertEqual(results[0]["id"], self.alicia.pk)

    def test_search_no_match_returns_empty_results(self) -> None:
        response = self.client.get("/api/v1/person/search", {"q": "zzzznobody"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_search_requires_q(self) -> None:
        response = self.client.get("/api/v1/person/search")
        self.assertEqual(response.status_code, 400)

    # --- detail ---
    def test_detail_public_without_user_state(self) -> None:
        response = self.client.get(f"/api/v1/person/{self.alicia.pk}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data.keys()), DETAIL_KEYS)
        self.assertEqual(response.data["id"], self.alicia.pk)
        self.assertEqual(response.data["name"], "Alicia Vikander")
        self.assertEqual(response.data["tmdb_id"], 64671)
        self.assertEqual(response.data["imdb_id"], "nm0000705")
        self.assertEqual(response.data["photo_url"], "https://img.example.com/alicia.jpg")
        # Anonymous -> no per-user state.
        self.assertIsNone(response.data["is_followed"])
        self.assertIsNone(response.data["user_rating"])
        self.assertEqual(response.data["follower_count"], 0)
        self.assertEqual(response.data["rating_count"], 0)
        self.assertIsNone(response.data["avg_rating"])

        credits = response.data["credits"]
        self.assertEqual(len(credits), 1)
        credit = credits[0]
        self.assertEqual(
            set(credit.keys()), {"id", "media_item", "role", "character_name", "sort_order"}
        )
        self.assertEqual(credit["role"], "Actor")
        self.assertEqual(credit["character_name"], "Valery Legasov")
        media_item = credit["media_item"]
        self.assertEqual(media_item["media_type"], "show")
        self.assertEqual(media_item["title"], "Chernobyl")
        self.assertEqual(media_item["slug"], "chernobyl")
        seasons = media_item["seasons"]
        self.assertEqual(len(seasons), 1)
        self.assertEqual(seasons[0]["season_number"], 1)
        self.assertEqual(seasons[0]["first_air_date"], "2019-05-06")
        self.assertEqual(seasons[0]["last_air_date"], "2019-05-06")
        self.assertEqual(len(seasons[0]["episodes"]), 1)
        self.assertEqual(seasons[0]["episodes"][0]["name"], "1:23:45")

    def test_detail_unknown_id_returns_404(self) -> None:
        response = self.client.get("/api/v1/person/999999")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Person not found")

    def test_detail_reflects_authenticated_user_state(self) -> None:
        UserPersonFollow.objects.create(user=self.user, person=self.alicia)
        PersonRating.objects.create(user=self.user, person=self.alicia, score=4)

        response = self.auth_client.get(f"/api/v1/person/{self.alicia.pk}")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_followed"])
        self.assertEqual(response.data["user_rating"], 4)
        self.assertEqual(response.data["follower_count"], 1)
        self.assertEqual(response.data["rating_count"], 1)
        self.assertEqual(response.data["avg_rating"], 4.0)

    def test_detail_authed_without_follow_or_rating(self) -> None:
        response = self.auth_client.get(f"/api/v1/person/{self.trent.pk}")
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["is_followed"], False)
        self.assertIsNone(response.data["user_rating"])

    # --- follow ---
    def test_follow_and_unfollow(self) -> None:
        url = f"/api/v1/person/{self.alicia.pk}/follow"
        response = self.auth_client.post(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"followed": True, "follower_count": 1})
        is_following = UserPersonFollow.objects.filter(user=self.user, person=self.alicia).exists()
        self.assertTrue(is_following)

        # Idempotent.
        response = self.auth_client.post(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"followed": True, "follower_count": 1})

        response = self.auth_client.delete(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"followed": False, "follower_count": 0})
        is_following = UserPersonFollow.objects.filter(user=self.user, person=self.alicia).exists()
        self.assertFalse(is_following)

    def test_follow_requires_authentication(self) -> None:
        response = self.client.post(f"/api/v1/person/{self.alicia.pk}/follow")
        self.assertEqual(response.status_code, 401)

    def test_follow_unknown_person_returns_404(self) -> None:
        response = self.auth_client.post("/api/v1/person/999999/follow")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Person not found")

    # --- rating ---
    def test_rate_creates_then_updates(self) -> None:
        url = f"/api/v1/person/{self.alicia.pk}/rating"
        response = self.auth_client.put(url, {"score": 5}, format="json")
        self.assertEqual(response.status_code, 204)
        rating = PersonRating.objects.get(user=self.user, person=self.alicia)
        self.assertEqual(rating.score, 5)

        response = self.auth_client.put(url, {"score": 3}, format="json")
        self.assertEqual(response.status_code, 204)
        rating.refresh_from_db()
        self.assertEqual(rating.score, 3)

    def test_unrate_removes_rating(self) -> None:
        PersonRating.objects.create(user=self.user, person=self.alicia, score=5)
        url = f"/api/v1/person/{self.alicia.pk}/rating"
        response = self.auth_client.delete(url)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(PersonRating.objects.filter(user=self.user, person=self.alicia).exists())

        # Idempotent delete when no rating exists.
        response = self.auth_client.delete(url)
        self.assertEqual(response.status_code, 204)

    def test_rating_requires_authentication(self) -> None:
        response = self.client.put(
            f"/api/v1/person/{self.alicia.pk}/rating", {"score": 5}, format="json"
        )
        self.assertEqual(response.status_code, 401)

    def test_rating_rejects_score_out_of_range(self) -> None:
        response = self.auth_client.put(
            f"/api/v1/person/{self.alicia.pk}/rating", {"score": 11}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_rating_unknown_person_returns_404(self) -> None:
        response = self.auth_client.put("/api/v1/person/999999/rating", {"score": 5}, format="json")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Person not found")
