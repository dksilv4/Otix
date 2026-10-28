"""Tests for profile section visibility and privacy toggles.

Covers:
- Default section visibility on new accounts.
- Toggling a section from public to private and vice versa via PATCH /auth/me.
- Owner seeing all configured sections (public and private).
- Visitor seeing only public sections.
- Synchronization between section_visibility['game_sessions'] and game_sessions_private.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

User = get_user_model()


class SectionPrivacyTests(TestCase):
    def setUp(self) -> None:
        self.owner = User.objects.create_user(
            username="alice", email="alice@example.com", password="alice-password-123"
        )
        self.visitor = User.objects.create_user(
            username="bob", email="bob@example.com", password="bob-password-123"
        )
        self.friend = User.objects.create_user(
            username="charlie", email="charlie@example.com", password="charlie-password-123"
        )
        self.owner_token = Token.objects.create(user=self.owner)
        self.visitor_token = Token.objects.create(user=self.visitor)
        self.friend_token = Token.objects.create(user=self.friend)

        self.owner_client = APIClient()
        self.owner_client.credentials(HTTP_AUTHORIZATION=f"Token {self.owner_token.key}")

        self.visitor_client = APIClient()
        self.visitor_client.credentials(HTTP_AUTHORIZATION=f"Token {self.visitor_token.key}")

        self.friend_client = APIClient()
        self.friend_client.credentials(HTTP_AUTHORIZATION=f"Token {self.friend_token.key}")

        from apps.social.models import FriendRequest

        FriendRequest.objects.create(sender=self.owner, receiver=self.friend, status="accepted")

        self.anon_client = APIClient()

    def test_owner_sees_all_sections_and_section_visibility(self) -> None:
        response = self.owner_client.get(f"/api/v1/users/{self.owner.username}")
        self.assertEqual(response.status_code, 200)
        self.assertIn("game_sessions", response.data["profile_sections"])
        self.assertIn("reviews", response.data["profile_sections"])
        self.assertEqual(response.data["section_visibility"]["game_sessions"], "private")

    def test_visitor_and_anon_see_only_public_sections(self) -> None:
        # Visitor
        resp_vis = self.visitor_client.get(f"/api/v1/users/{self.owner.username}")
        self.assertEqual(resp_vis.status_code, 200)
        self.assertNotIn("game_sessions", resp_vis.data["profile_sections"])
        self.assertIn("reviews", resp_vis.data["profile_sections"])

        # Anonymous
        resp_anon = self.anon_client.get(f"/api/v1/users/{self.owner.username}")
        self.assertEqual(resp_anon.status_code, 200)
        self.assertNotIn("game_sessions", resp_anon.data["profile_sections"])
        self.assertIn("reviews", resp_anon.data["profile_sections"])

    def test_owner_can_make_game_sessions_public(self) -> None:
        # Patch game_sessions to public
        patch_resp = self.owner_client.patch(
            "/api/v1/auth/me",
            {"section_visibility": {"game_sessions": "public"}},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, 200)
        self.assertEqual(patch_resp.data["section_visibility"]["game_sessions"], "public")

        self.owner.refresh_from_db()
        self.assertFalse(self.owner.game_sessions_private)

        # Now visitor should see game_sessions
        resp_vis = self.visitor_client.get(f"/api/v1/users/{self.owner.username}")
        self.assertEqual(resp_vis.status_code, 200)
        self.assertIn("game_sessions", resp_vis.data["profile_sections"])

    def test_owner_can_make_reviews_private(self) -> None:
        # Patch reviews to private
        patch_resp = self.owner_client.patch(
            "/api/v1/auth/me",
            {"section_visibility": {"reviews": "private"}},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, 200)

        # Owner still sees reviews in profile_sections
        resp_owner = self.owner_client.get(f"/api/v1/users/{self.owner.username}")
        self.assertIn("reviews", resp_owner.data["profile_sections"])
        self.assertEqual(resp_owner.data["section_visibility"]["reviews"], "private")

        # Visitor no longer sees reviews in profile_sections
        resp_vis = self.visitor_client.get(f"/api/v1/users/{self.owner.username}")
        self.assertNotIn("reviews", resp_vis.data["profile_sections"])

    def test_owner_can_make_section_friends_only(self) -> None:
        # Patch reviews to friends
        patch_resp = self.owner_client.patch(
            "/api/v1/auth/me",
            {"section_visibility": {"reviews": "friends"}},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, 200)
        self.assertEqual(patch_resp.data["section_visibility"]["reviews"], "friends")

        # Owner sees reviews
        resp_owner = self.owner_client.get(f"/api/v1/users/{self.owner.username}")
        self.assertIn("reviews", resp_owner.data["profile_sections"])
        self.assertEqual(resp_owner.data["section_visibility"]["reviews"], "friends")

        # Friend sees reviews with friends visibility
        resp_friend = self.friend_client.get(f"/api/v1/users/{self.owner.username}")
        self.assertEqual(resp_friend.status_code, 200)
        self.assertIn("reviews", resp_friend.data["profile_sections"])
        self.assertEqual(resp_friend.data["section_visibility"]["reviews"], "friends")

        # Non-friend visitor does NOT see reviews
        resp_vis = self.visitor_client.get(f"/api/v1/users/{self.owner.username}")
        self.assertNotIn("reviews", resp_vis.data["profile_sections"])

        # Anon does NOT see reviews
        resp_anon = self.anon_client.get(f"/api/v1/users/{self.owner.username}")
        self.assertNotIn("reviews", resp_anon.data["profile_sections"])

    def test_validation_rejects_invalid_visibility(self) -> None:
        patch_resp = self.owner_client.patch(
            "/api/v1/auth/me",
            {"section_visibility": {"reviews": "unknown_level"}},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, 400)
        self.assertIn("section_visibility", patch_resp.data)

    def test_top_5_favorites_endpoint_and_privacy(self) -> None:
        from apps.media.models import MediaItem

        media = MediaItem.objects.create(
            title="The Matrix",
            media_type="movie",
            slug="the-matrix-1999",
        )
        self.owner.hall_of_fame_media_ids = {"top_5": [media.id]}
        self.owner.save(update_fields=["hall_of_fame_media_ids"])

        # Owner gets resolved Top 5
        res_owner = self.owner_client.get(
            f"/api/v1/users/{self.owner.username}/hall-of-fame?media_type=top_5"
        )
        self.assertEqual(res_owner.status_code, 200)
        self.assertEqual(len(res_owner.data), 1)
        self.assertEqual(res_owner.data[0]["title"], "The Matrix")

        # When public, visitor gets it too
        res_vis = self.visitor_client.get(
            f"/api/v1/users/{self.owner.username}/hall-of-fame?media_type=top_5"
        )
        self.assertEqual(res_vis.status_code, 200)
        self.assertEqual(len(res_vis.data), 1)

        # Make top_5 friends
        self.owner.section_visibility = {"top_5": "friends"}
        self.owner.save(update_fields=["section_visibility"])

        # Friend gets it
        res_friend = self.friend_client.get(
            f"/api/v1/users/{self.owner.username}/hall-of-fame?media_type=top_5"
        )
        self.assertEqual(res_friend.status_code, 200)
        self.assertEqual(len(res_friend.data), 1)

        # Visitor gets empty list
        res_vis_f = self.visitor_client.get(
            f"/api/v1/users/{self.owner.username}/hall-of-fame?media_type=top_5"
        )
        self.assertEqual(res_vis_f.status_code, 200)
        self.assertEqual(res_vis_f.data, [])

        # Make top_5 private
        self.owner.section_visibility = {"top_5": "private"}
        self.owner.save(update_fields=["section_visibility"])

        # Friend gets empty list when private
        res_friend_priv = self.friend_client.get(
            f"/api/v1/users/{self.owner.username}/hall-of-fame?media_type=top_5"
        )
        self.assertEqual(res_friend_priv.data, [])

        # Visitor gets empty list
        res_vis2 = self.visitor_client.get(
            f"/api/v1/users/{self.owner.username}/hall-of-fame?media_type=top_5"
        )
        self.assertEqual(res_vis2.status_code, 200)
        self.assertEqual(res_vis2.data, [])

        # Owner still sees it
        res_owner2 = self.owner_client.get(
            f"/api/v1/users/{self.owner.username}/hall-of-fame?media_type=top_5"
        )
        self.assertEqual(len(res_owner2.data), 1)

    def test_activity_heatmap_endpoint_and_privacy(self) -> None:
        # Public by default
        res = self.visitor_client.get(
            f"/api/v1/users/{self.owner.username}/activity-heatmap?weeks=12"
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("dates", res.data)
        self.assertEqual(res.data["weeks"], 12)

        # Make friends
        self.owner.section_visibility = {"activity_heatmap": "friends"}
        self.owner.save(update_fields=["section_visibility"])

        # Friend sees full dates
        res_friend = self.friend_client.get(
            f"/api/v1/users/{self.owner.username}/activity-heatmap?weeks=12"
        )
        self.assertEqual(res_friend.status_code, 200)
        self.assertTrue(len(res_friend.data["dates"]) > 0)

        # Visitor receives empty dates
        res_vis_f = self.visitor_client.get(f"/api/v1/users/{self.owner.username}/activity-heatmap")
        self.assertEqual(res_vis_f.status_code, 200)
        self.assertEqual(res_vis_f.data["dates"], [])

        # Make private
        self.owner.section_visibility = {"activity_heatmap": "private"}
        self.owner.save(update_fields=["section_visibility"])

        # Friend receives empty dates
        res_friend_priv = self.friend_client.get(
            f"/api/v1/users/{self.owner.username}/activity-heatmap"
        )
        self.assertEqual(res_friend_priv.data["dates"], [])

        # Visitor receives empty dates
        res_vis = self.visitor_client.get(f"/api/v1/users/{self.owner.username}/activity-heatmap")
        self.assertEqual(res_vis.status_code, 200)
        self.assertEqual(res_vis.data["dates"], [])

        # Owner sees full dates
        res_owner = self.owner_client.get(
            f"/api/v1/users/{self.owner.username}/activity-heatmap?weeks=12"
        )
        self.assertEqual(res_owner.status_code, 200)
        self.assertTrue(len(res_owner.data["dates"]) > 0)

    def test_user_hardware_endpoint_and_privacy(self) -> None:
        from apps.library.models import UserGameSession

        UserGameSession.objects.create(
            user=self.owner,
            game_id="game_1",
            game_title="Portal 2",
            start_time="2026-10-10T12:00:00Z",
            hardware={"gpu": "RTX 4080", "cpu": "Ryzen 7 7800X3D"},
        )

        # Public check (default)
        res = self.owner_client.get(f"/api/v1/library/users/{self.owner.username}/hardware")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["gpu"], "RTX 4080")
        self.assertEqual(res.data["cpu"], "Ryzen 7 7800X3D")
        self.assertTrue(res.data["has_hardware"])

        # Make hardware_rig friends
        self.owner.section_visibility = {"hardware_rig": "friends"}
        self.owner.save(update_fields=["section_visibility"])

        # Friend sees specs
        res_friend = self.friend_client.get(f"/api/v1/library/users/{self.owner.username}/hardware")
        self.assertEqual(res_friend.status_code, 200)
        self.assertFalse(res_friend.data["is_private"])
        self.assertEqual(res_friend.data["gpu"], "RTX 4080")

        # Visitor receives private notice
        res_vis_f = self.visitor_client.get(f"/api/v1/library/users/{self.owner.username}/hardware")
        self.assertEqual(res_vis_f.status_code, 200)
        self.assertTrue(res_vis_f.data["is_private"])
        self.assertIsNone(res_vis_f.data["gpu"])

        # Make hardware_rig private
        self.owner.section_visibility = {"hardware_rig": "private"}
        self.owner.save(update_fields=["section_visibility"])

        # Visitor receives private notice without specs
        res_vis = self.visitor_client.get(f"/api/v1/library/users/{self.owner.username}/hardware")
        self.assertEqual(res_vis.status_code, 200)
        self.assertTrue(res_vis.data["is_private"])
        self.assertIsNone(res_vis.data["gpu"])

        # Owner still sees specs
        res_owner = self.owner_client.get(f"/api/v1/library/users/{self.owner.username}/hardware")
        self.assertEqual(res_owner.status_code, 200)
        self.assertFalse(res_owner.data["is_private"])
        self.assertEqual(res_owner.data["gpu"], "RTX 4080")
