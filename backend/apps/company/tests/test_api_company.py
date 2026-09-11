"""Endpoint tests for the company API area (detail, follow, rating).

Exercises the ported legacy routes against a real test database:
``GET /api/v1/company/{id}`` (public + optional-user state) and the authed
follow/rating mutations, mirroring legacy status codes (200 detail, 204 writes,
404 with the legacy ``detail`` string).
"""

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.company.models import Company, CompanyRating, UserCompanyFollow

User = get_user_model()

COMPANY_DETAIL_KEYS = {
    "id",
    "name",
    "slug",
    "logo_url",
    "origin_country",
    "description",
    "homepage",
    "follower_count",
    "is_followed",
    "avg_rating",
    "user_rating",
}


class CompanyApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="pw")
        self.other = User.objects.create_user(username="bob", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.company = Company.objects.create(
            name="Nintendo", slug="nintendo", origin_country="JP"
        )

        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.public = APIClient()

        # A first follow dispatches the full company sync; stub the task so the
        # endpoint tests never touch the broker (eager mode would run it inline
        # and hit the TMDB network).
        sync_patcher = mock.patch("apps.integrations.tasks.sync_company")
        self.sync_mock = sync_patcher.start()
        self.addCleanup(sync_patcher.stop)

    def test_anonymous_detail_returns_public_shape(self) -> None:
        response = self.public.get(f"/api/v1/company/{self.company.id}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), COMPANY_DETAIL_KEYS)
        self.assertEqual(response.data["id"], self.company.id)
        self.assertEqual(response.data["name"], "Nintendo")
        self.assertEqual(response.data["slug"], "nintendo")
        self.assertEqual(response.data["origin_country"], "JP")
        self.assertEqual(response.data["follower_count"], 0)
        self.assertEqual(response.data["avg_rating"], None)
        # No viewer -> legacy anonymous keys are null.
        self.assertIsNone(response.data["is_followed"])
        self.assertIsNone(response.data["user_rating"])

    def test_detail_shows_viewer_state_when_authenticated(self) -> None:
        UserCompanyFollow.objects.create(user=self.user, company=self.company)
        CompanyRating.objects.create(user=self.user, company=self.company, score=4)
        CompanyRating.objects.create(user=self.other, company=self.company, score=5)

        response = self.client.get(f"/api/v1/company/{self.company.id}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["follower_count"], 1)
        self.assertEqual(response.data["avg_rating"], 4.5)
        self.assertIs(response.data["is_followed"], True)
        self.assertEqual(response.data["user_rating"], 4)

    def test_detail_unknown_id_is_404(self) -> None:
        response = self.public.get("/api/v1/company/999999")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Company not found")

    def test_detail_non_numeric_id_is_404(self) -> None:
        response = self.public.get("/api/v1/company/not-an-id")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Company not found")

    def test_follow_returns_204_and_creates_row(self) -> None:
        response = self.client.post(f"/api/v1/company/{self.company.id}/follow")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b"")
        self.assertTrue(
            UserCompanyFollow.objects.filter(user=self.user, company=self.company).exists()
        )

    def test_follow_is_idempotent(self) -> None:
        url = f"/api/v1/company/{self.company.id}/follow"
        self.client.post(url)
        self.client.post(url)

        self.assertEqual(
            UserCompanyFollow.objects.filter(user=self.user, company=self.company).count(), 1
        )

    def test_first_follow_dispatches_company_sync(self) -> None:
        self.client.post(f"/api/v1/company/{self.company.id}/follow")
        self.sync_mock.delay.assert_called_once_with(self.company.id)

    def test_repeat_follow_does_not_redispatch(self) -> None:
        url = f"/api/v1/company/{self.company.id}/follow"
        self.client.post(url)
        self.client.post(url)
        self.sync_mock.delay.assert_called_once_with(self.company.id)

    def test_follow_survives_dispatch_failure(self) -> None:
        self.sync_mock.delay.side_effect = RuntimeError("broker down")
        response = self.client.post(f"/api/v1/company/{self.company.id}/follow")

        self.assertEqual(response.status_code, 204)
        self.assertTrue(
            UserCompanyFollow.objects.filter(user=self.user, company=self.company).exists()
        )

    def test_unfollow_returns_204_and_removes_row(self) -> None:
        UserCompanyFollow.objects.create(user=self.user, company=self.company)

        response = self.client.delete(f"/api/v1/company/{self.company.id}/follow")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            UserCompanyFollow.objects.filter(user=self.user, company=self.company).exists()
        )

    def test_unfollow_without_follow_is_204_noop(self) -> None:
        response = self.client.delete(f"/api/v1/company/{self.company.id}/follow")
        self.assertEqual(response.status_code, 204)

    def test_follow_requires_authentication(self) -> None:
        response = self.public.post(f"/api/v1/company/{self.company.id}/follow")
        self.assertEqual(response.status_code, 401)

    def test_follow_unknown_company_is_404(self) -> None:
        response = self.client.post("/api/v1/company/999999/follow")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Company not found")

    def test_put_rating_creates_then_updates(self) -> None:
        url = f"/api/v1/company/{self.company.id}/rating"

        created = self.client.put(url, {"score": 5}, format="json")
        self.assertEqual(created.status_code, 204)
        self.assertEqual(
            CompanyRating.objects.get(user=self.user, company=self.company).score, 5
        )

        updated = self.client.put(url, {"score": 3}, format="json")
        self.assertEqual(updated.status_code, 204)
        self.assertEqual(
            CompanyRating.objects.filter(user=self.user, company=self.company).count(), 1
        )
        self.assertEqual(
            CompanyRating.objects.get(user=self.user, company=self.company).score, 3
        )

    def test_put_rating_rejects_out_of_range_score(self) -> None:
        url = f"/api/v1/company/{self.company.id}/rating"
        for score in (0, 6):
            response = self.client.put(url, {"score": score}, format="json")
            self.assertEqual(response.status_code, 400)

    def test_put_rating_requires_authentication(self) -> None:
        url = f"/api/v1/company/{self.company.id}/rating"
        response = self.public.put(url, {"score": 5}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_put_rating_unknown_company_is_404(self) -> None:
        response = self.client.put("/api/v1/company/999999/rating", {"score": 5}, format="json")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Company not found")

    def test_delete_rating_removes_row(self) -> None:
        CompanyRating.objects.create(user=self.user, company=self.company, score=5)

        response = self.client.delete(f"/api/v1/company/{self.company.id}/rating")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            CompanyRating.objects.filter(user=self.user, company=self.company).exists()
        )

    def test_delete_rating_without_rating_is_204_noop(self) -> None:
        response = self.client.delete(f"/api/v1/company/{self.company.id}/rating")
        self.assertEqual(response.status_code, 204)

    def test_delete_rating_unknown_company_is_404(self) -> None:
        response = self.client.delete("/api/v1/company/999999/rating")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Company not found")
