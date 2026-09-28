"""Endpoint tests for the ported ``/users`` engagement surface.

Smoke tests per route family: follow send/status/accept/decline/unfollow and
the follower/following lists, peer user rating GET/PUT/DELETE, badge claiming,
karma reads, the public badge/achievement list, reviews, media-rating
distribution/top-rated, activity reads and the aggregate stats reads. Two users
exercise the asymmetric actions.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.media.models import MediaItem
from apps.social.models import (
    Follow,
    FollowRequest,
    KarmaTransaction,
    MediaItemRating,
    Review,
    UserBadge,
    UserMediaInteraction,
)
from apps.workout.models import UserRating

User = get_user_model()


class UserSurfaceApiTests(TestCase):
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

    # ── Follow ─────────────────────────────────────────────────────────────

    def test_follow_requires_auth(self) -> None:
        response = self.anon.post("/api/v1/users/bob/follow")
        self.assertEqual(response.status_code, 401)

    def test_follow_unfollow_and_counts_flow(self) -> None:
        follow = self.alice_client.post("/api/v1/users/bob/follow")
        self.assertEqual(follow.status_code, 201)
        self.assertEqual(follow.data["status"], "following")
        self.assertTrue(Follow.objects.filter(follower=self.alice, followed=self.bob).exists())

        status_ = self.alice_client.get("/api/v1/users/bob/follow/status")
        self.assertTrue(status_.data["is_following"])

        counts = self.anon.get("/api/v1/users/bob/follow/counts")
        self.assertEqual(counts.status_code, 200)
        self.assertEqual(counts.data["followers"], 1)

        followers = self.anon.get("/api/v1/users/bob/followers")
        self.assertEqual(followers.data["results"][0]["username"], "alice")
        following = self.anon.get("/api/v1/users/alice/following")
        self.assertEqual(following.data["results"][0]["username"], "bob")

        unfollow = self.alice_client.delete("/api/v1/users/bob/follow")
        self.assertEqual(unfollow.status_code, 204)
        self.assertFalse(Follow.objects.filter(follower=self.alice, followed=self.bob).exists())
        status_ = self.alice_client.get("/api/v1/users/bob/follow/status")
        self.assertFalse(status_.data["is_following"])

    def test_user_friends_list_is_public(self) -> None:
        from apps.social.models import FriendRequest

        FriendRequest.objects.create(sender=self.alice, receiver=self.bob, status="accepted")
        alice_friends = self.anon.get("/api/v1/users/alice/friends")
        self.assertEqual(alice_friends.status_code, 200)
        self.assertEqual(len(alice_friends.data), 1)
        self.assertEqual(alice_friends.data[0]["username"], "bob")

        bob_friends = self.anon.get("/api/v1/users/bob/friends")
        self.assertEqual(bob_friends.status_code, 200)
        self.assertEqual(bob_friends.data[0]["username"], "alice")

        missing = self.anon.get("/api/v1/users/ghost/friends")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.data["detail"], "User not found")

    def test_follow_self_is_400_and_unknown_user_is_404(self) -> None:
        self_response = self.alice_client.post("/api/v1/users/alice/follow")
        self.assertEqual(self_response.status_code, 400)
        self.assertEqual(self_response.data["detail"], "Cannot follow yourself")

        missing = self.alice_client.post("/api/v1/users/ghost/follow")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.data["detail"], "User not found")

    def test_follow_request_accept_flow(self) -> None:
        request = FollowRequest.objects.create(
            requester=self.alice, target=self.bob, status="pending"
        )
        accept = self.bob_client.post(f"/api/v1/users/bob/follow/requests/{request.id}/accept")
        self.assertEqual(accept.status_code, 200)
        self.assertEqual(accept.data["message"], "Follow request accepted")
        request.refresh_from_db()
        self.assertEqual(request.status, "accepted")
        self.assertTrue(Follow.objects.filter(follower=self.alice, followed=self.bob).exists())

    def test_follow_request_decline_flow(self) -> None:
        request = FollowRequest.objects.create(
            requester=self.alice, target=self.bob, status="pending"
        )
        decline = self.bob_client.post(f"/api/v1/users/bob/follow/requests/{request.id}/decline")
        self.assertEqual(decline.status_code, 200)
        self.assertEqual(decline.data["message"], "Follow request declined")
        request.refresh_from_db()
        self.assertEqual(request.status, "declined")
        self.assertFalse(Follow.objects.filter(follower=self.alice, followed=self.bob).exists())

    def test_follow_requests_are_owner_only(self) -> None:
        FollowRequest.objects.create(requester=self.alice, target=self.bob, status="pending")
        own = self.bob_client.get("/api/v1/users/bob/follow/requests")
        self.assertEqual(own.status_code, 200)
        self.assertEqual(own.data["total"], 1)
        self.assertEqual(own.data["requests"][0]["requester"]["username"], "alice")

        denied = self.alice_client.get("/api/v1/users/bob/follow/requests")
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(denied.data["detail"], "You can only view your own follow requests")

    # ── Peer user rating ───────────────────────────────────────────────────

    def test_peer_rating_requires_auth(self) -> None:
        response = self.anon.get("/api/v1/users/bob/rating")
        self.assertEqual(response.status_code, 401)

    def test_peer_rating_put_get_delete_flow(self) -> None:
        put = self.alice_client.put("/api/v1/users/bob/rating", {"score": 9}, format="json")
        self.assertEqual(put.status_code, 200)
        self.assertEqual(put.data["rater_id"], self.alice.id)
        self.assertEqual(put.data["rated_user_id"], self.bob.id)
        self.assertEqual(put.data["score"], 9)
        self.assertTrue(UserRating.objects.filter(rater=self.alice, rated_user=self.bob).exists())

        get = self.alice_client.get("/api/v1/users/bob/rating")
        self.assertEqual(get.data["score"], 9)

        update = self.alice_client.put("/api/v1/users/bob/rating", {"score": 8}, format="json")
        self.assertEqual(update.data["score"], 8)

        delete = self.alice_client.delete("/api/v1/users/bob/rating")
        self.assertEqual(delete.status_code, 204)
        self.assertFalse(UserRating.objects.filter(rater=self.alice, rated_user=self.bob).exists())

        missing = self.alice_client.delete("/api/v1/users/bob/rating")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.data["detail"], "Rating not found")

    def test_rating_self_is_null_get_and_400_put(self) -> None:
        get = self.alice_client.get("/api/v1/users/alice/rating")
        self.assertIsNone(get.data)
        put = self.alice_client.put("/api/v1/users/alice/rating", {"score": 9}, format="json")
        self.assertEqual(put.status_code, 400)
        self.assertEqual(put.data["detail"], "Cannot rate yourself")

    # ── Badges / achievements ──────────────────────────────────────────────

    def test_achievements_and_badges_are_public(self) -> None:
        achievements = self.anon.get("/api/v1/users/achievements")
        self.assertEqual(achievements.status_code, 200)
        self.assertGreater(len(achievements.data), 0)
        self.assertIn("badge_key", achievements.data[0])

        badges = self.anon.get("/api/v1/users/bob/badges")
        self.assertEqual(badges.status_code, 200)
        self.assertEqual(len(badges.data), len(achievements.data))

    def test_badge_claim_flow(self) -> None:
        UserBadge.objects.create(user=self.alice, badge_key="first_review")
        claim = self.alice_client.post("/api/v1/users/me/badges/first_review/claim")
        self.assertEqual(claim.status_code, 200)
        self.assertEqual(claim.data["status"], "ok")
        self.assertEqual(claim.data["xp_awarded"], 150)

        again = self.alice_client.post("/api/v1/users/me/badges/first_review/claim")
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.data["detail"], "Badge reward already claimed")

    def test_badge_claim_unknown_or_not_earned(self) -> None:
        unknown = self.alice_client.post("/api/v1/users/me/badges/nope/claim")
        self.assertEqual(unknown.status_code, 404)
        self.assertEqual(unknown.data["detail"], "Badge definition not found")

        not_earned = self.alice_client.post("/api/v1/users/me/badges/reviews_5/claim")
        self.assertEqual(not_earned.status_code, 400)
        self.assertEqual(not_earned.data["detail"], "Badge not earned yet")

    # ── Karma ──────────────────────────────────────────────────────────────

    def test_karma_balance_and_transactions(self) -> None:
        KarmaTransaction.objects.create(user=self.bob, amount=25, reason="review")
        KarmaTransaction.objects.create(user=self.bob, amount=-5, reason="downvoted")

        balance = self.anon.get("/api/v1/users/bob/karma")
        self.assertEqual(balance.status_code, 200)
        self.assertEqual(balance.data["balance"], 20)

        history = self.anon.get("/api/v1/users/bob/karma/transactions")
        self.assertEqual(history.data["count"], 2)

    # ── Reviews ────────────────────────────────────────────────────────────

    def test_user_reviews_list(self) -> None:
        Review.objects.create(
            user=self.bob, media_item=self.movie, title="Great", content="A classic."
        )
        listing = self.anon.get("/api/v1/users/bob/reviews")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.data["count"], 1)
        row = listing.data["results"][0]
        self.assertEqual(row["content"], "A classic.")
        self.assertEqual(row["user"]["username"], "bob")
        self.assertIsNone(row["rating"])

    # ── Media rating aggregates ────────────────────────────────────────────

    def test_rating_distribution_and_top_rated(self) -> None:
        MediaItemRating.objects.create(user=self.bob, media_item=self.movie, score=9)

        distribution = self.anon.get("/api/v1/users/bob/rating-distribution")
        self.assertEqual(distribution.status_code, 200)
        self.assertEqual(distribution.data["total_ratings"], 1)
        bucket = distribution.data["distribution"][8]
        self.assertEqual(bucket["score"], 9)
        self.assertEqual(bucket["movie"], 1)

        top = self.anon.get("/api/v1/users/bob/top-rated")
        self.assertEqual(top.status_code, 200)
        self.assertEqual(len(top.data), 1)
        self.assertEqual(top.data[0]["media_item"]["title"], "The Godfather")

    # ── Activity / daily rollups ───────────────────────────────────────────

    def test_activity_and_mood_timeline_are_public(self) -> None:
        activity = self.anon.get("/api/v1/users/bob/activity")
        self.assertEqual(activity.status_code, 200)
        self.assertIsInstance(activity.data, list)

        mood = self.anon.get("/api/v1/users/bob/mood-timeline")
        self.assertEqual(mood.status_code, 200)
        self.assertEqual(mood.data["checkins"], [])

    def test_me_activity_endpoints_require_auth(self) -> None:
        heatmap_anon = self.anon.get("/api/v1/users/me/activity-heatmap")
        self.assertEqual(heatmap_anon.status_code, 401)
        daily_anon = self.anon.get("/api/v1/users/me/daily-activity")
        self.assertEqual(daily_anon.status_code, 401)
        friends_anon = self.anon.get("/api/v1/users/me/friends/activity")
        self.assertEqual(friends_anon.status_code, 401)

        heatmap = self.alice_client.get("/api/v1/users/me/activity-heatmap")
        self.assertEqual(heatmap.status_code, 200)
        self.assertIn("dates", heatmap.data)
        daily = self.alice_client.get("/api/v1/users/me/daily-activity")
        self.assertEqual(daily.status_code, 200)
        self.assertEqual(daily.data["reviews"], [])
        friends = self.alice_client.get("/api/v1/users/me/friends/activity")
        self.assertEqual(friends.status_code, 200)
        self.assertEqual(friends.data, [])

    # ── Stats / reputation / hall-of-fame / library-stats ──────────────────

    def test_stats_reputation_hall_of_fame_library_are_public(self) -> None:
        stats = self.anon.get("/api/v1/users/bob/stats")
        self.assertEqual(stats.status_code, 200)
        self.assertEqual(stats.data["review_count"], 0)

        reputation = self.anon.get("/api/v1/users/bob/reputation")
        self.assertEqual(reputation.status_code, 200)
        self.assertEqual(reputation.data["composite_score"], 100)

        hof = self.anon.get("/api/v1/users/bob/hall-of-fame")
        self.assertEqual(hof.status_code, 200)
        self.assertEqual(hof.data, [])

        library = self.anon.get("/api/v1/users/bob/library-stats")
        self.assertEqual(library.status_code, 200)
        self.assertEqual(library.data["total_items"], 0)

    def test_watched_interaction_shows_in_library_stats(self) -> None:
        UserMediaInteraction.objects.create(
            user=self.bob, media_item=self.movie, interaction_type="watched"
        )
        stats = self.anon.get("/api/v1/users/bob/stats")
        self.assertEqual(stats.data["interaction_count"], 1)
        library = self.anon.get("/api/v1/users/bob/library-stats")
        self.assertEqual(library.data["total_items"], 1)
        self.assertEqual(library.data["by_media_type"]["movie"], 1)
