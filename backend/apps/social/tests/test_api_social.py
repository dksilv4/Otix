"""Endpoint tests for the social API area (DRF).

Smoke tests per route family ported from the legacy FastAPI routers: friends
(send/accept/reject/unfriend/status), notifications (list/read/unread-count),
review votes (create/get/delete), mood check-ins (today/submit/dismiss) and the
public metric endpoint. Two users exercise the asymmetric actions.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.media.models import MediaItem
from apps.social.models import FriendRequest, Notification, Review, ReviewVote

User = get_user_model()

NOTIFICATION_KEYS = {
    "id",
    "type",
    "title",
    "body",
    "metadata_json",
    "is_read",
    "created_at",
}


class SocialApiTests(TestCase):
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

    # ── Friends ────────────────────────────────────────────────────────────

    def test_friends_require_auth(self) -> None:
        response = self.anon.get("/api/v1/friends/")
        self.assertEqual(response.status_code, 401)

    def test_friend_request_send_accept_list_unfriend_flow(self) -> None:
        send = self.alice_client.post(
            f"/api/v1/friends/requests/{self.bob.id}", {}, format="json"
        )
        self.assertEqual(send.status_code, 201)
        self.assertEqual(send.data["message"], "Friend request sent")
        request = FriendRequest.objects.get(sender=self.alice, receiver=self.bob)
        self.assertEqual(request.status, "pending")

        incoming = self.bob_client.get("/api/v1/friends/requests/incoming")
        self.assertEqual(incoming.status_code, 200)
        self.assertEqual(len(incoming.data), 1)
        self.assertEqual(incoming.data[0]["sender_id"], self.alice.id)
        self.assertEqual(incoming.data[0]["sender"]["username"], "alice")

        outgoing = self.alice_client.get("/api/v1/friends/requests/outgoing")
        self.assertEqual(outgoing.status_code, 200)
        self.assertEqual(len(outgoing.data), 1)
        self.assertEqual(outgoing.data[0]["receiver_id"], self.bob.id)

        status_ = self.alice_client.get(f"/api/v1/friends/status/{self.bob.id}")
        self.assertEqual(status_.data["status"], "pending_sent")
        self.assertEqual(status_.data["request_id"], request.id)
        bob_status = self.bob_client.get(f"/api/v1/friends/status/{self.alice.id}")
        self.assertEqual(bob_status.data["status"], "pending_received")

        accept = self.bob_client.post(f"/api/v1/friends/requests/{request.id}/accept")
        self.assertEqual(accept.status_code, 200)
        self.assertEqual(accept.data["message"], "Friend request accepted")
        request.refresh_from_db()
        self.assertEqual(request.status, "accepted")

        friends = self.alice_client.get("/api/v1/friends/")
        self.assertEqual(friends.status_code, 200)
        self.assertEqual(len(friends.data), 1)
        self.assertEqual(friends.data[0]["id"], self.bob.id)
        self.assertEqual(friends.data[0]["username"], "bob")
        self.assertIsNotNone(friends.data[0]["friends_since"])

        status_ = self.alice_client.get(f"/api/v1/friends/status/{self.bob.id}")
        self.assertEqual(status_.data["status"], "friends")

        unfriend = self.alice_client.delete(f"/api/v1/friends/{self.bob.id}")
        self.assertEqual(unfriend.status_code, 200)
        self.assertEqual(unfriend.data["message"], "Friend removed")

        friends = self.alice_client.get("/api/v1/friends/")
        self.assertEqual(friends.data, [])

        missing = self.alice_client.delete(f"/api/v1/friends/{self.bob.id}")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.data["detail"], "Friend not found")

    def test_friend_request_reject_flow(self) -> None:
        self.alice_client.post(f"/api/v1/friends/requests/{self.bob.id}", {}, format="json")
        request = FriendRequest.objects.get(sender=self.alice, receiver=self.bob)
        reject = self.bob_client.post(f"/api/v1/friends/requests/{request.id}/reject")
        self.assertEqual(reject.status_code, 200)
        self.assertEqual(reject.data["message"], "Friend request rejected")
        request.refresh_from_db()
        self.assertEqual(request.status, "rejected")

        outgoing = self.alice_client.get("/api/v1/friends/requests/outgoing")
        self.assertEqual(outgoing.data, [])
        status_ = self.alice_client.get(f"/api/v1/friends/status/{self.bob.id}")
        self.assertEqual(status_.data["status"], "none")

    def test_send_friend_request_to_self_is_400(self) -> None:
        response = self.alice_client.post(
            f"/api/v1/friends/requests/{self.alice.id}", {}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Cannot send friend request to yourself")

    def test_accept_request_only_receiver_may_accept(self) -> None:
        self.bob_client.post(f"/api/v1/friends/requests/{self.alice.id}", {}, format="json")
        request = FriendRequest.objects.get(sender=self.bob, receiver=self.alice)
        response = self.bob_client.post(f"/api/v1/friends/requests/{request.id}/accept")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["detail"], "You can only accept requests sent to you")

    def test_send_friend_request_to_unknown_user_is_404(self) -> None:
        response = self.alice_client.post("/api/v1/friends/requests/999999", {}, format="json")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "User not found")

    # ── Notifications ──────────────────────────────────────────────────────

    def test_notification_list_read_unread_flow(self) -> None:
        Notification.objects.create(user=self.alice, type="review", title="First", body="b")
        Notification.objects.create(user=self.alice, type="friend", title="Second")
        Notification.objects.create(user=self.alice, type="badge", title="Read", is_read=True)

        listing = self.alice_client.get("/api/v1/notifications/")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data["items"]), 3)
        self.assertFalse(listing.data["has_more"])
        self.assertIsNone(listing.data["next_cursor"])
        self.assertEqual(set(listing.data["items"][0]), NOTIFICATION_KEYS)

        unread = self.alice_client.get("/api/v1/notifications/unread-count")
        self.assertEqual(unread.data, {"count": 2})

        unread_id = Notification.objects.get(
            user=self.alice, is_read=False, type="review"
        ).id
        read_one = self.alice_client.post(f"/api/v1/notifications/{unread_id}/read")
        self.assertEqual(read_one.status_code, 200)
        self.assertEqual(read_one.data["message"], "Notification marked as read")
        unread = self.alice_client.get("/api/v1/notifications/unread-count")
        self.assertEqual(unread.data, {"count": 1})

        read_all = self.alice_client.post("/api/v1/notifications/read-all")
        self.assertEqual(read_all.status_code, 200)
        self.assertEqual(read_all.data["message"], "All notifications marked as read")
        unread = self.alice_client.get("/api/v1/notifications/unread-count")
        self.assertEqual(unread.data, {"count": 0})

    def test_notification_read_unknown_is_404(self) -> None:
        response = self.alice_client.post("/api/v1/notifications/999999/read")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Notification not found")

    # ── Review votes ───────────────────────────────────────────────────────

    def _bob_review(self) -> Review:
        return Review.objects.create(
            user=self.bob, media_item=self.movie, title="Great", content="A classic."
        )

    def test_review_vote_create_get_delete_flow(self) -> None:
        review = self._bob_review()

        vote = self.alice_client.post(
            f"/api/v1/reviews/{self.bob.id}/{self.movie.id}/vote",
            {"vote_type": "up"},
            format="json",
        )
        self.assertEqual(vote.status_code, 204)
        self.assertTrue(
            ReviewVote.objects.filter(voter=self.alice, review=review, vote_type="up").exists()
        )

        counts = self.alice_client.get(
            f"/api/v1/reviews/{self.bob.id}/{self.movie.id}/vote"
        )
        self.assertEqual(counts.status_code, 200)
        self.assertEqual(counts.data, {"up": 1, "down": 0, "my_vote": "up"})

        flip = self.alice_client.post(
            f"/api/v1/reviews/{self.bob.id}/{self.movie.id}/vote",
            {"vote_type": "down"},
            format="json",
        )
        self.assertEqual(flip.status_code, 204)
        review.refresh_from_db()
        counts = self.alice_client.get(
            f"/api/v1/reviews/{self.bob.id}/{self.movie.id}/vote"
        )
        self.assertEqual(counts.data, {"up": 0, "down": 1, "my_vote": "down"})

        remove = self.alice_client.delete(
            f"/api/v1/reviews/{self.bob.id}/{self.movie.id}/vote"
        )
        self.assertEqual(remove.status_code, 204)
        counts = self.alice_client.get(
            f"/api/v1/reviews/{self.bob.id}/{self.movie.id}/vote"
        )
        self.assertEqual(counts.data, {"up": 0, "down": 0, "my_vote": None})

        missing = self.alice_client.delete(
            f"/api/v1/reviews/{self.bob.id}/{self.movie.id}/vote"
        )
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.data["detail"], "Vote not found")

    def test_review_vote_toggle_same_vote_removes_it(self) -> None:
        self._bob_review()
        self.alice_client.post(
            f"/api/v1/reviews/{self.bob.id}/{self.movie.id}/vote",
            {"vote_type": "up"},
            format="json",
        )
        self.alice_client.post(
            f"/api/v1/reviews/{self.bob.id}/{self.movie.id}/vote",
            {"vote_type": "up"},
            format="json",
        )
        counts = self.alice_client.get(
            f"/api/v1/reviews/{self.bob.id}/{self.movie.id}/vote"
        )
        self.assertEqual(counts.data, {"up": 0, "down": 0, "my_vote": None})

    def test_review_vote_on_own_review_is_400(self) -> None:
        Review.objects.create(user=self.alice, media_item=self.movie, content="Mine.")
        response = self.alice_client.post(
            f"/api/v1/reviews/{self.alice.id}/{self.movie.id}/vote",
            {"vote_type": "up"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Cannot vote on your own review")

    def test_review_vote_invalid_type_is_400(self) -> None:
        self._bob_review()
        response = self.alice_client.post(
            f"/api/v1/reviews/{self.bob.id}/{self.movie.id}/vote",
            {"vote_type": "sideways"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_review_vote_missing_review_is_404(self) -> None:
        response = self.alice_client.post(
            f"/api/v1/reviews/{self.bob.id}/{self.movie.id}/vote",
            {"vote_type": "up"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Review not found")

    # ── Mood check-ins ─────────────────────────────────────────────────────

    def test_mood_checkin_today_submit_dismiss_flow(self) -> None:
        today = self.alice_client.get("/api/v1/mood-checkins/today")
        self.assertEqual(today.status_code, 200)
        self.assertTrue(today.data["due"])
        self.assertIsNone(today.data["checkin"])

        submit = self.alice_client.post(
            "/api/v1/mood-checkins/",
            {"mood": "good", "feeling": "grateful", "note": "nice day"},
            format="json",
        )
        self.assertEqual(submit.status_code, 200)
        self.assertEqual(submit.data["status"], "submitted")
        self.assertEqual(submit.data["mood"], "good")
        self.assertEqual(submit.data["feeling"], "grateful")

        today = self.alice_client.get("/api/v1/mood-checkins/today")
        self.assertFalse(today.data["due"])
        self.assertEqual(today.data["checkin"]["id"], submit.data["id"])

        dismiss = self.alice_client.post("/api/v1/mood-checkins/dismiss")
        self.assertEqual(dismiss.status_code, 200)
        self.assertEqual(dismiss.data["status"], "dismissed")

        today = self.alice_client.get("/api/v1/mood-checkins/today")
        self.assertFalse(today.data["due"])
        self.assertEqual(today.data["checkin"]["status"], "dismissed")

    def test_mood_checkin_submit_after_dismiss_resubmits(self) -> None:
        self.alice_client.post(
            "/api/v1/mood-checkins/", {"mood": "good"}, format="json"
        )
        self.alice_client.post("/api/v1/mood-checkins/dismiss")
        resubmit = self.alice_client.post(
            "/api/v1/mood-checkins/", {"mood": "great"}, format="json"
        )
        self.assertEqual(resubmit.status_code, 200)
        self.assertEqual(resubmit.data["status"], "submitted")
        self.assertEqual(resubmit.data["mood"], "great")

    # ── Metric ─────────────────────────────────────────────────────────────

    def test_metric_is_public_snapshot_shape(self) -> None:
        response = self.anon.get("/api/v1/metric/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            set(response.data),
            {"counters", "histograms", "gauges"},
        )
