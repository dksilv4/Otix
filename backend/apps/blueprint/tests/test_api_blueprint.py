"""Endpoint tests for the blueprint API area (list, create, detail, like, download).

Exercises the ported legacy routes against a real test database:
``/api/v1/blueprints/`` list+create, detail/update/delete by id, the POST like
toggle, and POST download, mirroring legacy status codes (201 create, 200 reads,
204 delete) and the legacy 404 ``detail`` strings.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.blueprint.models import Blueprint

User = get_user_model()

DETAIL_KEYS = {
    "id",
    "user_id",
    "author_name",
    "title",
    "description",
    "blueprint_string",
    "parsed_data",
    "tags",
    "downloads",
    "likes_count",
    "has_liked",
    "created_at",
    "updated_at",
}

LIST_ITEM_KEYS = DETAIL_KEYS - {"blueprint_string", "updated_at"}

LIST_ENVELOPE_KEYS = {"count", "next", "previous", "results"}

LIST_URL = "/api/v1/blueprints/"


class BlueprintApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="pw")
        self.other = User.objects.create_user(username="bob", password="pw")
        self.token = Token.objects.create(user=self.user)

        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.public = APIClient()

        self.bobs = Blueprint.objects.create(
            user=self.other,
            title="Factorio Mall",
            description="Early-game bus mall",
            blueprint_string="0eNqrB...",
            parsed_data={"tiles": 128},
            tags=["factorio", "mall"],
            downloads=3,
        )
        self.own = Blueprint.objects.create(
            user=self.user,
            title="My BP",
            description="desc",
            blueprint_string="abc",
            parsed_data=None,
            tags=None,
            downloads=0,
        )

    def _detail_url(self, blueprint_id: int) -> str:
        return f"/api/v1/blueprints/{blueprint_id}"

    # --- create ---
    def test_create_returns_201_and_detail_shape(self) -> None:
        payload = {
            "title": "Krastorio Base",
            "description": "Late-game smelter",
            "blueprint_string": "0eNqrD...",
            "parsed_data": {"tiles": 256},
            "tags": ["krastorio", "smelter"],
        }
        response = self.client.post(LIST_URL, payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(set(response.data), DETAIL_KEYS)
        self.assertEqual(response.data["user_id"], self.user.id)
        self.assertEqual(response.data["author_name"], "alice")
        self.assertEqual(response.data["title"], "Krastorio Base")
        self.assertEqual(response.data["description"], "Late-game smelter")
        self.assertEqual(response.data["blueprint_string"], "0eNqrD...")
        self.assertEqual(response.data["parsed_data"], {"tiles": 256})
        self.assertEqual(response.data["tags"], ["krastorio", "smelter"])
        self.assertEqual(response.data["downloads"], 0)
        self.assertEqual(response.data["likes_count"], 0)
        self.assertIs(response.data["has_liked"], False)
        self.assertIsNotNone(response.data["created_at"])
        self.assertIsNotNone(response.data["updated_at"])
        self.assertTrue(Blueprint.objects.filter(title="Krastorio Base").exists())

    def test_create_requires_authentication(self) -> None:
        payload = {"title": "T", "blueprint_string": "abc"}
        response = self.public.post(LIST_URL, payload, format="json")
        self.assertEqual(response.status_code, 401)

    def test_create_rejects_missing_required_fields(self) -> None:
        no_title = self.client.post(LIST_URL, {"blueprint_string": "abc"}, format="json")
        self.assertEqual(no_title.status_code, 400)

        no_string = self.client.post(LIST_URL, {"title": "T"}, format="json")
        self.assertEqual(no_string.status_code, 400)

    # --- list ---
    def test_list_returns_paginated_envelope(self) -> None:
        response = self.public.get(LIST_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), LIST_ENVELOPE_KEYS)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 2)
        item = response.data["results"][0]
        self.assertEqual(set(item), LIST_ITEM_KEYS)
        self.assertNotIn("blueprint_string", item)
        self.assertNotIn("updated_at", item)

    def test_list_anonymous_has_liked_false(self) -> None:
        self.bobs.likes.create(user=self.user)

        response = self.public.get(LIST_URL)
        bobs_result = next(r for r in response.data["results"] if r["id"] == self.bobs.id)

        self.assertEqual(bobs_result["likes_count"], 1)
        self.assertIs(bobs_result["has_liked"], False)

    def test_list_authenticated_shows_has_liked(self) -> None:
        self.bobs.likes.create(user=self.user)

        response = self.client.get(LIST_URL)
        bobs_result = next(r for r in response.data["results"] if r["id"] == self.bobs.id)

        self.assertEqual(bobs_result["likes_count"], 1)
        self.assertIs(bobs_result["has_liked"], True)

    def test_list_search_filters(self) -> None:
        response = self.public.get(LIST_URL, {"search": "mall"})

        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.bobs.id)

    def test_list_requires_no_auth(self) -> None:
        response = self.public.get(LIST_URL)
        self.assertEqual(response.status_code, 200)

    # --- detail ---
    def test_detail_public_without_user_state(self) -> None:
        response = self.public.get(self._detail_url(self.bobs.id))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), DETAIL_KEYS)
        self.assertEqual(response.data["id"], self.bobs.id)
        self.assertEqual(response.data["user_id"], self.other.id)
        self.assertEqual(response.data["author_name"], "bob")
        self.assertEqual(response.data["blueprint_string"], "0eNqrB...")
        self.assertEqual(response.data["parsed_data"], {"tiles": 128})
        self.assertEqual(response.data["downloads"], 3)
        self.assertEqual(response.data["likes_count"], 0)
        self.assertIs(response.data["has_liked"], False)

    def test_detail_authenticated_shows_has_liked(self) -> None:
        self.bobs.likes.create(user=self.user)

        response = self.client.get(self._detail_url(self.bobs.id))

        self.assertEqual(response.data["likes_count"], 1)
        self.assertIs(response.data["has_liked"], True)

    def test_detail_unknown_id_is_404(self) -> None:
        response = self.public.get(self._detail_url(999999))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Blueprint not found")

    def test_detail_non_numeric_id_is_404(self) -> None:
        response = self.public.get("/api/v1/blueprints/not-an-id")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Blueprint not found")

    # --- update ---
    def test_patch_partially_updates_owned_blueprint(self) -> None:
        response = self.client.patch(
            self._detail_url(self.own.id), {"title": "Renamed BP"}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), DETAIL_KEYS)
        self.assertEqual(response.data["title"], "Renamed BP")
        self.assertEqual(response.data["description"], "desc")
        self.own.refresh_from_db()
        self.assertEqual(self.own.title, "Renamed BP")
        self.assertEqual(self.own.description, "desc")

    def test_patch_updates_parsed_data_and_tags(self) -> None:
        payload = {"parsed_data": {"tiles": 512}, "tags": ["compact"]}
        response = self.client.patch(self._detail_url(self.own.id), payload, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["parsed_data"], {"tiles": 512})
        self.assertEqual(response.data["tags"], ["compact"])

    def test_patch_not_owned_returns_404(self) -> None:
        response = self.client.patch(
            self._detail_url(self.bobs.id), {"title": "Hijack"}, format="json"
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Blueprint not found or not owned by user")

    def test_patch_requires_authentication(self) -> None:
        response = self.public.patch(self._detail_url(self.own.id), {"title": "X"}, format="json")
        self.assertEqual(response.status_code, 401)

    # --- delete ---
    def test_delete_owned_returns_204(self) -> None:
        response = self.client.delete(self._detail_url(self.own.id))

        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b"")
        self.assertFalse(Blueprint.objects.filter(pk=self.own.id).exists())

    def test_delete_not_owned_returns_404(self) -> None:
        response = self.client.delete(self._detail_url(self.bobs.id))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Blueprint not found or not owned by user")
        self.assertTrue(Blueprint.objects.filter(pk=self.bobs.id).exists())

    def test_delete_requires_authentication(self) -> None:
        response = self.public.delete(self._detail_url(self.own.id))
        self.assertEqual(response.status_code, 401)

    # --- like toggle ---
    def test_like_toggles_on_then_off(self) -> None:
        url = f"{self._detail_url(self.bobs.id)}/like"

        liked = self.client.post(url)
        self.assertEqual(liked.status_code, 200)
        self.assertIs(liked.data["is_liked"], True)
        self.assertEqual(liked.data["like_count"], 1)
        self.assertEqual(self.bobs.likes.count(), 1)

        unliked = self.client.post(url)
        self.assertEqual(unliked.status_code, 200)
        self.assertIs(unliked.data["is_liked"], False)
        self.assertEqual(unliked.data["like_count"], 0)
        self.assertEqual(self.bobs.likes.count(), 0)

    def test_like_is_single_row_per_user(self) -> None:
        url = f"{self._detail_url(self.bobs.id)}/like"
        self.client.post(url)
        self.assertEqual(self.bobs.likes.filter(user=self.user).count(), 1)

    def test_like_unknown_blueprint_is_404(self) -> None:
        response = self.client.post("/api/v1/blueprints/999999/like")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Blueprint not found")

    def test_like_requires_authentication(self) -> None:
        response = self.public.post(f"{self._detail_url(self.bobs.id)}/like")
        self.assertEqual(response.status_code, 401)

    # --- download ---
    def test_download_increments_counter(self) -> None:
        response = self.client.post(f"{self._detail_url(self.bobs.id)}/download")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"downloads": 4})
        self.bobs.refresh_from_db()
        self.assertEqual(self.bobs.downloads, 4)

    def test_download_allows_anonymous(self) -> None:
        response = self.public.post(f"{self._detail_url(self.bobs.id)}/download")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"downloads": 4})

    def test_download_unknown_blueprint_is_404(self) -> None:
        response = self.public.post("/api/v1/blueprints/999999/download")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Blueprint not found")
