"""Endpoint tests for the lists API area (DRF).

Exercises all 18 frozen ``/api/v1/list/`` routes against a real test database,
mirroring legacy status codes (201 create/invite/add, 204 writes, 200 reads,
404 detail strings) and response keys from ``backend/otix/schemas/list.py``.
"""

import json
from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.lists.models import (
    ListItemRankHistory,
    MediaListCollaborator,
    MediaListLike,
    UserList,
    UserListItem,
)
from apps.media.models import ExternalID, MediaAsset, MediaItem

User = get_user_model()

LIST_OUT_KEYS = {
    "id",
    "user_id",
    "name",
    "description",
    "is_public",
    "like_count",
    "is_liked",
    "created_at",
    "updated_at",
}
LIST_DETAIL_KEYS = LIST_OUT_KEYS | {"items", "collaborators"}
COLLABORATOR_KEYS = {"id", "user_id", "permission", "status", "created_at", "user"}
HISTORY_KEYS = {
    "id",
    "media_item_id",
    "user_id",
    "old_sort_order",
    "new_sort_order",
    "changed_at",
    "media_item",
}


def _make_movie(title: str, slug: str, *, release_date=None) -> MediaItem:
    return MediaItem.objects.create(
        media_type="movie",
        title=title,
        slug=slug,
        release_date=release_date,
        avg_rating=7.5,
    )


class ListApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="pw")
        self.other = User.objects.create_user(username="bob", password="pw")
        self.third = User.objects.create_user(username="carol", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.other_token = Token.objects.create(user=self.other)
        self.third_token = Token.objects.create(user=self.third)

        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.other_client = APIClient()
        self.other_client.credentials(HTTP_AUTHORIZATION=f"Token {self.other_token.key}")
        self.third_client = APIClient()
        self.third_client.credentials(HTTP_AUTHORIZATION=f"Token {self.third_token.key}")
        self.public = APIClient()

        self.movie = _make_movie("Iron Man", "iron-man", release_date=date(2008, 5, 2))
        self.movie2 = _make_movie("The Matrix", "the-matrix", release_date=date(1999, 3, 31))

        poster = MediaAsset.objects.create(
            media_item=self.movie, asset_type="poster", url="https://img.example.com/poster.jpg"
        )
        self.poster_url = poster.url
        media_type = ContentType.objects.get_for_model(MediaItem)
        ExternalID.objects.create(
            content_type=media_type,
            object_id=self.movie.pk,
            provider="tmdb",
            external_id="1726",
            media_type="movie",
        )

        self.public_list = UserList.objects.create(
            user=self.user,
            name="Favorites",
            description="My picks.",
            is_public=True,
        )
        self.private_list = UserList.objects.create(
            user=self.user,
            name="Secret",
            description=None,
            is_public=False,
        )

    # --- create ---
    def test_create_list_returns_201_with_out_shape(self) -> None:
        response = self.client.post(
            "/api/v1/list/", {"name": "Watchlist", "is_public": True}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(set(response.data), LIST_OUT_KEYS)
        self.assertEqual(response.data["name"], "Watchlist")
        self.assertEqual(response.data["user_id"], self.user.id)
        self.assertTrue(response.data["is_public"])
        self.assertEqual(response.data["like_count"], 0)
        self.assertIs(response.data["is_liked"], False)
        self.assertTrue(UserList.objects.filter(pk=response.data["id"]).exists())

    def test_create_list_requires_authentication(self) -> None:
        response = self.public.post(
            "/api/v1/list/", {"name": "Nope", "is_public": False}, format="json"
        )
        self.assertEqual(response.status_code, 401)

    def test_create_list_validates_name(self) -> None:
        response = self.client.post("/api/v1/list/", {"name": ""}, format="json")
        self.assertEqual(response.status_code, 400)

    # --- public discovery + mine ---
    def test_public_list_discovery_is_paginated_and_public_only(self) -> None:
        response = self.public.get("/api/v1/list/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"count", "next", "previous", "results"})
        self.assertEqual(response.data["count"], 1)
        result = response.data["results"][0]
        self.assertEqual(set(result), LIST_OUT_KEYS)
        self.assertEqual(result["name"], "Favorites")

    def test_mine_returns_owned_and_shared_lists(self) -> None:
        MediaListCollaborator.objects.create(
            list=self.public_list, user=self.other, permission="VIEW", status="accepted"
        )
        response = self.other_client.get("/api/v1/list/mine")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.public_list.id)

    def test_mine_requires_authentication(self) -> None:
        response = self.public.get("/api/v1/list/mine")
        self.assertEqual(response.status_code, 401)

    # --- detail ---
    def test_detail_public_list_anonymous(self) -> None:
        response = self.public.get(f"/api/v1/list/{self.public_list.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), LIST_DETAIL_KEYS)
        self.assertEqual(response.data["name"], "Favorites")
        self.assertEqual(response.data["items"], [])
        self.assertEqual(response.data["collaborators"], [])
        self.assertEqual(response.data["like_count"], 0)
        self.assertIs(response.data["is_liked"], False)

    def test_detail_includes_media_item_summaries(self) -> None:
        UserListItem.objects.create(list=self.public_list, media_item=self.movie, sort_order=0)
        response = self.public.get(f"/api/v1/list/{self.public_list.id}")
        self.assertEqual(response.status_code, 200)
        items = response.data["items"]
        self.assertEqual(len(items), 1)
        item = items[0]
        self.assertEqual(item["id"], self.movie.id)
        self.assertEqual(item["media_type"], "movie")
        self.assertEqual(item["title"], "Iron Man")
        self.assertEqual(item["release_date"], "2008-05-02")
        self.assertEqual(item["poster_url"], self.poster_url)
        self.assertEqual(item["tmdb_id"], "1726")

    def test_detail_unknown_list_is_404(self) -> None:
        response = self.public.get("/api/v1/list/999999")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "List not found")

    def test_detail_private_list_requires_owner_or_collaborator(self) -> None:
        # Anonymous cannot see it.
        response = self.public.get(f"/api/v1/list/{self.private_list.id}")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "List not found")
        # A random authenticated user cannot see it either.
        response = self.other_client.get(f"/api/v1/list/{self.private_list.id}")
        self.assertEqual(response.status_code, 404)
        # The owner can.
        response = self.client.get(f"/api/v1/list/{self.private_list.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.private_list.id)
        # An accepted collaborator can.
        MediaListCollaborator.objects.create(
            list=self.private_list, user=self.other, permission="VIEW", status="accepted"
        )
        response = self.other_client.get(f"/api/v1/list/{self.private_list.id}")
        self.assertEqual(response.status_code, 200)

    def test_detail_reflects_authenticated_like_state(self) -> None:
        MediaListLike.objects.create(list=self.public_list, user=self.other)
        anonymous = self.public.get(f"/api/v1/list/{self.public_list.id}")
        self.assertIs(anonymous.data["is_liked"], False)
        self.assertEqual(anonymous.data["like_count"], 1)
        liked = self.other_client.get(f"/api/v1/list/{self.public_list.id}")
        self.assertIs(liked.data["is_liked"], True)
        self.assertEqual(liked.data["like_count"], 1)

    # --- update / delete ---
    def test_update_list_owner_only_and_partial(self) -> None:
        url = f"/api/v1/list/{self.public_list.id}"
        response = self.client.patch(url, {"name": "Renamed"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), LIST_OUT_KEYS)
        self.assertEqual(response.data["name"], "Renamed")
        self.assertEqual(response.data["description"], "My picks.")
        self.assertTrue(response.data["is_public"])

        response = self.client.patch(url, {"is_public": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_public"])

    def test_update_list_non_owner_is_404(self) -> None:
        response = self.other_client.patch(
            f"/api/v1/list/{self.public_list.id}", {"name": "Hijack"}, format="json"
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "List not found")

    def test_update_list_requires_authentication(self) -> None:
        response = self.public.patch(
            f"/api/v1/list/{self.public_list.id}", {"name": "Nope"}, format="json"
        )
        self.assertEqual(response.status_code, 401)

    def test_delete_list_owner_removes_and_returns_204(self) -> None:
        response = self.client.delete(f"/api/v1/list/{self.private_list.id}")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(UserList.objects.filter(pk=self.private_list.id).exists())

    def test_delete_list_non_owner_is_404(self) -> None:
        response = self.other_client.delete(f"/api/v1/list/{self.public_list.id}")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "List not found")

    # --- items ---
    def test_add_item_returns_201_and_creates_row(self) -> None:
        response = self.client.post(
            f"/api/v1/list/{self.public_list.id}/item",
            {"media_item_id": self.movie.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(set(response.data), LIST_OUT_KEYS)
        self.assertTrue(
            UserListItem.objects.filter(
                list=self.public_list, media_item=self.movie
            ).exists()
        )

    def test_add_item_to_unowned_list_is_404(self) -> None:
        response = self.other_client.post(
            f"/api/v1/list/{self.public_list.id}/item",
            {"media_item_id": self.movie.id},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "List not found")

    def test_remove_item_returns_204(self) -> None:
        UserListItem.objects.create(list=self.public_list, media_item=self.movie, sort_order=0)
        response = self.client.delete(
            f"/api/v1/list/{self.public_list.id}/item/{self.movie.id}"
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            UserListItem.objects.filter(
                list=self.public_list, media_item=self.movie
            ).exists()
        )

    def test_remove_missing_item_is_404(self) -> None:
        response = self.client.delete(
            f"/api/v1/list/{self.public_list.id}/item/{self.movie.id}"
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Item not found")

    def test_reorder_returns_204_and_records_history(self) -> None:
        UserListItem.objects.create(list=self.public_list, media_item=self.movie, sort_order=0)
        UserListItem.objects.create(list=self.public_list, media_item=self.movie2, sort_order=1)

        response = self.client.put(
            f"/api/v1/list/{self.public_list.id}/item",
            {"media_item_ids": [self.movie2.id, self.movie.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 204)
        orders = dict(
            UserListItem.objects.filter(list=self.public_list).values_list(
                "media_item_id", "sort_order"
            )
        )
        self.assertEqual(orders[self.movie2.id], 0)
        self.assertEqual(orders[self.movie.id], 1)
        self.assertEqual(
            ListItemRankHistory.objects.filter(list=self.public_list).count(), 2
        )

    def test_reorder_unowned_list_is_404(self) -> None:
        response = self.other_client.put(
            f"/api/v1/list/{self.public_list.id}/item",
            {"media_item_ids": [self.movie.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "List not found")

    # --- collaborators ---
    def test_invite_collaborator_returns_201(self) -> None:
        response = self.client.post(
            f"/api/v1/list/{self.public_list.id}/collaborators",
            {"user_id": self.other.id, "permission": "EDIT"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(set(response.data), COLLABORATOR_KEYS)
        self.assertEqual(response.data["user_id"], self.other.id)
        self.assertEqual(response.data["permission"], "EDIT")
        self.assertEqual(response.data["status"], "pending")
        self.assertIsNone(response.data["user"])

    def test_invite_collaborator_requires_owner_or_editor(self) -> None:
        response = self.other_client.post(
            f"/api/v1/list/{self.public_list.id}/collaborators",
            {"user_id": self.third.id},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "List not found")

    def test_list_collaborators_includes_nested_user(self) -> None:
        MediaListCollaborator.objects.create(
            list=self.public_list, user=self.other, permission="VIEW", status="pending"
        )
        response = self.client.get(f"/api/v1/list/{self.public_list.id}/collaborators")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        entry = response.data[0]
        self.assertEqual(set(entry), COLLABORATOR_KEYS)
        self.assertEqual(entry["user"]["id"], self.other.id)
        self.assertEqual(entry["user"]["username"], "bob")

    def test_accept_and_decline_invitation(self) -> None:
        url = f"/api/v1/list/{self.public_list.id}/collaborators"
        self.client.post(url, {"user_id": self.other.id, "permission": "EDIT"}, format="json")
        response = self.other_client.post(f"{url}/accept")
        self.assertEqual(response.status_code, 204)
        collab = MediaListCollaborator.objects.get(list=self.public_list, user=self.other)
        self.assertEqual(collab.status, "accepted")

        self.client.post(url, {"user_id": self.third.id, "permission": "VIEW"}, format="json")
        response = self.third_client.post(f"{url}/decline")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            MediaListCollaborator.objects.filter(list=self.public_list, user=self.third).exists()
        )

    def test_accept_missing_invitation_is_404(self) -> None:
        response = self.other_client.post(
            f"/api/v1/list/{self.public_list.id}/collaborators/accept"
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Invitation not found")

    def test_remove_collaborator_returns_204(self) -> None:
        MediaListCollaborator.objects.create(
            list=self.public_list, user=self.other, permission="VIEW", status="pending"
        )
        response = self.client.delete(
            f"/api/v1/list/{self.public_list.id}/collaborators/{self.other.id}"
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            MediaListCollaborator.objects.filter(list=self.public_list, user=self.other).exists()
        )

    def test_remove_missing_collaborator_is_404(self) -> None:
        response = self.client.delete(
            f"/api/v1/list/{self.public_list.id}/collaborators/{self.other.id}"
        )
        self.assertEqual(response.status_code, 404)

    # --- likes ---
    def test_like_and_unlike_returns_like_status(self) -> None:
        url = f"/api/v1/list/{self.public_list.id}/like"
        response = self.other_client.post(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"like_count": 1, "is_liked": True})

        # Idempotent.
        response = self.other_client.post(url)
        self.assertEqual(response.data, {"like_count": 1, "is_liked": True})

        response = self.other_client.delete(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"like_count": 0, "is_liked": False})

    def test_like_unknown_list_is_404(self) -> None:
        response = self.other_client.post("/api/v1/list/999999/like")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "List not found")

    def test_like_requires_authentication(self) -> None:
        response = self.public.post(f"/api/v1/list/{self.public_list.id}/like")
        self.assertEqual(response.status_code, 401)

    # --- export ---
    def test_export_public_list_as_json(self) -> None:
        UserListItem.objects.create(list=self.public_list, media_item=self.movie, sort_order=0)
        response = self.public.get(f"/api/v1/list/{self.public_list.id}/export")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/json")
        payload = json.loads(response.content.decode())
        self.assertEqual(payload["list_name"], "Favorites")
        self.assertEqual(len(payload["items"]), 1)
        item = payload["items"][0]
        self.assertEqual(
            set(item), {"rank", "title", "media_type", "release_date", "avg_rating"}
        )
        self.assertEqual(item["rank"], 1)
        self.assertEqual(item["title"], "Iron Man")
        self.assertEqual(item["release_date"], "2008-05-02")
        self.assertEqual(item["avg_rating"], 7.5)

    def test_export_public_list_as_csv(self) -> None:
        UserListItem.objects.create(list=self.public_list, media_item=self.movie, sort_order=0)
        response = self.public.get(
            f"/api/v1/list/{self.public_list.id}/export", {"format": "csv"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        body = response.content.decode()
        self.assertTrue(body.startswith("rank,title,media_type,release_date,avg_rating"))
        self.assertIn("Iron Man", body)

    def test_export_private_or_missing_list_is_404(self) -> None:
        response = self.public.get(f"/api/v1/list/{self.private_list.id}/export")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "List not found")
        response = self.public.get("/api/v1/list/999999/export")
        self.assertEqual(response.status_code, 404)

    # --- history ---
    def test_history_returns_rank_changes(self) -> None:
        UserListItem.objects.create(list=self.public_list, media_item=self.movie, sort_order=0)
        UserListItem.objects.create(list=self.public_list, media_item=self.movie2, sort_order=1)
        ListItemRankHistory.objects.create(
            list=self.public_list,
            media_item=self.movie2,
            user=self.user,
            old_sort_order=1,
            new_sort_order=0,
        )
        response = self.public.get(f"/api/v1/list/{self.public_list.id}/history")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        entry = response.data[0]
        self.assertEqual(set(entry), HISTORY_KEYS)
        self.assertEqual(entry["media_item_id"], self.movie2.id)
        self.assertEqual(entry["old_sort_order"], 1)
        self.assertEqual(entry["new_sort_order"], 0)
        self.assertEqual(entry["media_item"]["title"], "The Matrix")
