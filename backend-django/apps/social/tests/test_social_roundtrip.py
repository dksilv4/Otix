"""Model round-trip smoke tests for the social app.

Exercises the cross-app hub (accounts user, media Movie/Show/Episode) and the
social user graph / review / interaction / gamification tables, asserting FK
reverse accessors behave on both sides of each relationship.
"""

from datetime import date

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.media.models import Episode, MediaItem, Movie, Season, Show
from apps.social.models import (
    Follow,
    FollowRequest,
    FriendRequest,
    KarmaTransaction,
    MediaItemRating,
    Notification,
    Review,
    ReviewVote,
    UserBadge,
    UserEpisodeInteraction,
    UserMediaInteraction,
    UserMoodCheckIn,
    UserStreak,
)

User = get_user_model()


def _media_item(media_type: str, title: str, slug: str) -> MediaItem:
    return MediaItem.objects.create(media_type=media_type, title=title, slug=slug)


def _movie() -> MediaItem:
    item = _media_item("movie", "The Godfather", "the-godfather")
    Movie.objects.create(media_item=item, runtime=175)
    return item


def _show_episode() -> Episode:
    item = _media_item("show", "Severance", "severance")
    show = Show.objects.create(media_item=item)
    season = Season.objects.create(show=show, season_number=1)
    return Episode.objects.create(season=season, episode_number=1)


class SocialRoundTripTests(TestCase):
    def setUp(self) -> None:
        self.alice = User.objects.create_user(username="alice", password="x")
        self.bob = User.objects.create_user(username="bob", password="x")

    def test_review_and_vote_roundtrip(self) -> None:
        movie = _movie()
        review = Review.objects.create(
            user=self.alice, media_item=movie, title="A classic", content="Great film."
        )
        vote = ReviewVote.objects.create(voter=self.bob, review=review, vote_type="up")

        self.assertEqual(list(self.alice.reviews.all()), [review])
        self.assertEqual(list(movie.reviews.all()), [review])
        self.assertEqual(review.media_item, movie)
        self.assertEqual(list(review.votes.all()), [vote])
        self.assertEqual(list(self.bob.given_votes.all()), [vote])

    def test_media_interaction_and_rating_roundtrip(self) -> None:
        movie = _movie()
        interaction = UserMediaInteraction.objects.create(
            user=self.alice, media_item=movie, interaction_type="watched", extra_data={"pos": 0.5}
        )
        rating = MediaItemRating.objects.create(user=self.bob, media_item=movie, score=9)

        self.assertEqual(list(self.alice.interactions.all()), [interaction])
        self.assertEqual(list(movie.interactions.all()), [interaction])
        self.assertEqual(interaction.extra_data, {"pos": 0.5})
        self.assertEqual(list(self.bob.media_ratings.all()), [rating])
        self.assertEqual(list(movie.ratings.all()), [rating])

    def test_episode_interaction_roundtrip(self) -> None:
        episode = _show_episode()
        interaction = UserEpisodeInteraction.objects.create(user=self.alice, episode=episode)

        self.assertEqual(list(self.alice.episode_interactions.all()), [interaction])
        self.assertEqual(list(episode.episode_interactions.all()), [interaction])
        self.assertEqual(interaction.episode, episode)

    def test_friend_and_follow_roundtrip(self) -> None:
        friend = FriendRequest.objects.create(sender=self.alice, receiver=self.bob)
        follow = Follow.objects.create(follower=self.alice, followed=self.bob)
        follow_req = FollowRequest.objects.create(requester=self.alice, target=self.bob)

        self.assertEqual(list(self.alice.sent_requests.all()), [friend])
        self.assertEqual(list(self.bob.received_requests.all()), [friend])
        self.assertEqual(list(self.alice.following.all()), [follow])
        self.assertEqual(list(self.bob.followers.all()), [follow])
        self.assertEqual(list(self.alice.follow_requests_sent.all()), [follow_req])
        self.assertEqual(list(self.bob.follow_requests_received.all()), [follow_req])

    def test_gamification_and_notification_roundtrip(self) -> None:
        badge = UserBadge.objects.create(user=self.alice, badge_key="first_review")
        streak = UserStreak.objects.create(user=self.alice, current_login_streak=3)
        karma = KarmaTransaction.objects.create(user=self.alice, amount=5, reason="review")
        mood = UserMoodCheckIn.objects.create(
            user=self.alice, checkin_date=date(2026, 9, 4), status="submitted", mood="good"
        )
        notif = Notification.objects.create(user=self.alice, type="review", title="Hi")

        self.assertEqual(list(self.alice.badges.all()), [badge])
        self.assertEqual(self.alice.streak, streak)
        self.assertEqual(list(self.alice.karma_transactions.all()), [karma])
        self.assertEqual(list(self.alice.mood_checkins.all()), [mood])
        self.assertEqual(list(self.alice.notifications.all()), [notif])
        self.assertFalse(notif.is_read)

    def test_natural_key_uniqueness_enforced(self) -> None:
        movie = _movie()
        Review.objects.create(user=self.alice, media_item=movie)
        MediaItemRating.objects.create(user=self.alice, media_item=movie, score=8)
        Follow.objects.create(follower=self.alice, followed=self.bob)
        FriendRequest.objects.create(sender=self.alice, receiver=self.bob)

        for create_dupe in [
            lambda: Review.objects.create(user=self.alice, media_item=movie),
            lambda: MediaItemRating.objects.create(user=self.alice, media_item=movie, score=9),
            lambda: Follow.objects.create(follower=self.alice, followed=self.bob),
            lambda: FriendRequest.objects.create(sender=self.alice, receiver=self.bob),
        ]:
            with self.subTest(create_dupe=create_dupe):
                with self.assertRaises(IntegrityError):
                    with transaction.atomic():
                        create_dupe()
