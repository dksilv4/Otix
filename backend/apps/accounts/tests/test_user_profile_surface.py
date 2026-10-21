"""Endpoint tests for the accounts-owned ``/users`` profile-hub routes.

Smoke coverage for public profile detail (optional-auth viewer fields), public
username search, and the authenticated ``me/continue`` hub route. Two users
exercise the viewer-relative fields.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.accounts.models.user import DEFAULT_PROFILE_SECTIONS
from apps.media.models import MediaItem
from apps.social.models import UserMediaInteraction

User = get_user_model()


class UserProfileHubApiTests(TestCase):
    def setUp(self) -> None:
        self.alice = User.objects.create_user(username="alice", password="a-strong-pass")
        self.bob = User.objects.create_user(username="bob", password="a-strong-pass")
        self.alice_token = Token.objects.create(user=self.alice)
        self.bob_token = Token.objects.create(user=self.bob)

        self.anon = APIClient()
        self.alice_client = APIClient()
        self.alice_client.credentials(HTTP_AUTHORIZATION=f"Token {self.alice_token.key}")
        self.bob_client = APIClient()
        self.bob_client.credentials(HTTP_AUTHORIZATION=f"Token {self.bob_token.key}")

        self.movie = MediaItem.objects.create(
            media_type="movie", title="The Godfather", slug="the-godfather"
        )

    def test_user_detail_is_public(self) -> None:
        response = self.anon.get("/api/v1/users/bob")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "bob")
        self.assertEqual(response.data["level_title"], "Novice")
        self.assertFalse(response.data["is_private"])
        self.assertFalse(response.data["is_following"])

    def test_user_detail_unknown_is_404(self) -> None:
        response = self.anon.get("/api/v1/users/ghost")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "User not found")

    def test_user_detail_includes_viewer_relative_friendship_fields(self) -> None:
        response = self.alice_client.get("/api/v1/users/bob")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["friendship_status"]["status"], "none")
        self.assertEqual(response.data["follower_count"], 0)
        self.assertEqual(response.data["friend_count"], 0)
        # Visitor sees only public sections (game_sessions is private by default)
        expected_visitor_sections = [
            sec for sec in DEFAULT_PROFILE_SECTIONS if sec != "game_sessions"
        ]
        self.assertEqual(response.data["profile_sections"], expected_visitor_sections)
        self.assertEqual(response.data["total_xp"], 0)
        self.assertFalse(response.data["is_private"])

        # Owner sees all sections including private ones
        self_resp = self.alice_client.get("/api/v1/users/alice")
        self.assertEqual(self_resp.status_code, 200)
        self.assertEqual(self_resp.data["profile_sections"], DEFAULT_PROFILE_SECTIONS)
        self.assertEqual(self_resp.data["section_visibility"]["game_sessions"], "private")

    def test_user_search_is_public(self) -> None:
        response = self.anon.get("/api/v1/users/search", {"q": "ali"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["has_more"])
        self.assertEqual(response.data["items"][0]["username"], "alice")
        self.assertEqual(response.data["items"][0]["media_type"], "user")

    def test_user_search_requires_q(self) -> None:
        response = self.anon.get("/api/v1/users/search")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "The q query parameter is required.")

    def test_continue_watching_requires_auth_and_returns_interactions(self) -> None:
        anon = self.anon.get("/api/v1/users/me/continue")
        self.assertEqual(anon.status_code, 401)

        empty = self.alice_client.get("/api/v1/users/me/continue")
        self.assertEqual(empty.status_code, 200)
        self.assertEqual(empty.data, [])

        UserMediaInteraction.objects.create(
            user=self.alice, media_item=self.movie, interaction_type="watched"
        )
        listing = self.alice_client.get("/api/v1/users/me/continue")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data), 1)
        self.assertEqual(listing.data[0]["title"], "The Godfather")
        self.assertEqual(listing.data[0]["interaction_type"], "watched")
