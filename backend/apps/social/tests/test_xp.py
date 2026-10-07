"""Unit and integration tests for the XP awarding and gamification system."""

from __future__ import annotations

import io
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.lists.services.list import create_list
from apps.media.models import MediaItem
from apps.media.services.interaction import set_interaction
from apps.media.services.rating import upsert_rating as upsert_media_rating
from apps.media.services.review import upsert_review
from apps.social.models import UserStreak
from apps.social.services import (
    award_xp,
    calculate_level,
    calculate_xp_rank_and_percentile,
    claim_badge,
    get_user_badges,
    submit_checkin,
    update_login_streak,
)
from apps.social.services.xp import (
    INTERACTION_LIKE_WATCHLIST_STARTED,
    INTERACTION_WATCHED_PLAYED_LISTENED,
    LIST_CREATE,
    MOOD_CHECKIN,
    RATING_SUBMIT,
    WORKOUT_COMPLETE,
)
from apps.workout.services.workout import create_workout

User = get_user_model()


class XpSystemTests(TestCase):
    def setUp(self) -> None:
        self.user1 = User.objects.create_user(
            username="alice", email="alice@example.com", password="password123", total_xp=0
        )
        self.user2 = User.objects.create_user(
            username="bob", email="bob@example.com", password="password123", total_xp=600
        )
        self.movie = MediaItem.objects.create(
            media_type="movie",
            title="Inception",
            slug="inception",
            release_date=timezone.now().date(),
        )

    def test_award_xp_increments_atomically(self) -> None:
        new_xp = award_xp(self.user1.id, 150)
        self.assertEqual(new_xp, 150)
        self.user1.refresh_from_db()
        self.assertEqual(self.user1.total_xp, 150)

        # Award more XP
        new_xp = award_xp(self.user1.id, 50)
        self.assertEqual(new_xp, 200)
        self.user1.refresh_from_db()
        self.assertEqual(self.user1.total_xp, 200)

    def test_calculate_level_and_titles(self) -> None:
        lvl, title = calculate_level(0)
        self.assertEqual(lvl, 1)
        self.assertEqual(title, "Novice")

        lvl, title = calculate_level(299)
        self.assertEqual(lvl, 1)
        self.assertEqual(title, "Novice")

        lvl, title = calculate_level(300)
        self.assertEqual(lvl, 2)
        self.assertEqual(title, "Novice")

        lvl, title = calculate_level(1200)  # (1200 // 300) + 1 = 5
        self.assertEqual(lvl, 5)
        self.assertEqual(title, "Apprentice")

        lvl, title = calculate_level(3000)  # Level 11
        self.assertEqual(lvl, 11)
        self.assertEqual(title, "Adept")

        lvl, title = calculate_level(30000)  # Level 101
        self.assertEqual(lvl, 101)
        self.assertEqual(title, "Transcendent")

    def test_calculate_rank_and_percentile(self) -> None:
        # alice has 0, bob has 600
        rank, pctl = calculate_xp_rank_and_percentile(self.user2)
        self.assertEqual(rank, 1)
        self.assertEqual(pctl, 100.0)

        rank, pctl = calculate_xp_rank_and_percentile(self.user1)
        self.assertEqual(rank, 2)
        self.assertEqual(pctl, 50.0)

    def test_login_streak_and_milestone_xp(self) -> None:
        streak_data = update_login_streak(self.user1.id)
        self.assertEqual(streak_data["streak"], 1)
        self.assertFalse(streak_data["milestone_hit"])

        # Manually set streak to 6 and last activity to yesterday
        streak = UserStreak.objects.get(user_id=self.user1.id)
        streak.current_login_streak = 6
        streak.last_activity_date = timezone.localdate() - timedelta(days=1)
        streak.save()

        # Update login streak today -> hits 7!
        streak_data = update_login_streak(self.user1.id)
        self.assertEqual(streak_data["streak"], 7)
        self.assertTrue(streak_data["milestone_hit"])
        self.assertEqual(streak_data["bonus_xp"], 50)

        self.user1.refresh_from_db()
        self.assertEqual(self.user1.total_xp, 50)

    def test_badge_auto_award_and_claim(self) -> None:
        # Alice writes first review
        upsert_review(
            self.user1,
            self.movie.id,
            title="Great",
            content="Superb masterpiece",
            is_spoiler=False,
            is_private=False,
        )

        # "first_review" badge should be awarded
        badges = get_user_badges(self.user1.id)
        first_review_badge = next((b for b in badges if b["badge_key"] == "first_review"), None)
        self.assertIsNotNone(first_review_badge)
        self.assertTrue(first_review_badge["earned"])
        self.assertFalse(first_review_badge["claimed"])

        # Claim the badge
        self.user1.refresh_from_db()
        initial_xp = self.user1.total_xp  # Has 150 from the review
        awarded = claim_badge(self.user1.id, "first_review")
        self.assertEqual(awarded, 150)  # special tier = 150 XP

        self.user1.refresh_from_db()
        self.assertEqual(self.user1.total_xp, initial_xp + 150)

    def test_interaction_awards_xp(self) -> None:
        initial_xp = self.user1.total_xp
        set_interaction(self.user1, self.movie.id, "watched")
        self.user1.refresh_from_db()
        self.assertEqual(self.user1.total_xp, initial_xp + INTERACTION_WATCHED_PLAYED_LISTENED)

        # Toggling like awards 10 XP
        initial_xp = self.user1.total_xp
        set_interaction(self.user1, self.movie.id, "liked")
        self.user1.refresh_from_db()
        self.assertEqual(self.user1.total_xp, initial_xp + INTERACTION_LIKE_WATCHLIST_STARTED)

    def test_workout_awards_xp(self) -> None:
        initial_xp = self.user1.total_xp
        create_workout(self.user1.id, "Pushups 3x10", [{"exercise_name": "Pushups", "sets": [10, 10, 10]}])
        self.user1.refresh_from_db()
        self.assertEqual(self.user1.total_xp, initial_xp + WORKOUT_COMPLETE)

    def test_list_creation_awards_xp(self) -> None:
        initial_xp = self.user1.total_xp
        create_list(self.user1.id, name="My Sci-Fi Favorites", description="Best movies", is_public=True)
        self.user1.refresh_from_db()
        self.assertEqual(self.user1.total_xp, initial_xp + LIST_CREATE)

    def test_mood_checkin_awards_xp(self) -> None:
        initial_xp = self.user1.total_xp
        submit_checkin(self.user1.id, mood="great", feeling="focused", note="Productive morning")
        self.user1.refresh_from_db()
        self.assertEqual(self.user1.total_xp, initial_xp + MOOD_CHECKIN)

    def test_media_rating_awards_xp(self) -> None:
        initial_xp = self.user1.total_xp
        upsert_media_rating(self.user1, self.movie.id, score=9)
        self.user1.refresh_from_db()
        self.assertEqual(self.user1.total_xp, initial_xp + RATING_SUBMIT)

    def test_backfill_xp_command(self) -> None:
        # Create activities for user1 without XP
        User.objects.filter(pk=self.user1.id).update(total_xp=0)
        self.user1.refresh_from_db()
        self.assertEqual(self.user1.total_xp, 0)

        # Add 1 review (150 XP), 1 workout (100 XP), 1 list (50 XP)
        upsert_review(
            self.user1,
            self.movie.id,
            title="Review",
            content="Awesome film",
            is_spoiler=False,
            is_private=False,
        )
        create_workout(self.user1.id, "Squats", [{"exercise_name": "Squats", "sets": [10]}])
        create_list(self.user1.id, name="Favorites", description="", is_public=True)

        # Reset total_xp to 0
        User.objects.filter(pk=self.user1.id).update(total_xp=0)

        out = io.StringIO()
        call_command("backfill_xp", user="alice", stdout=out)

        self.user1.refresh_from_db()
        # Expect at least 150 (review) + 100 (workout) + 50 (list) = 300 XP
        self.assertEqual(self.user1.total_xp, 300)
        self.assertIn("Completed XP backfill", out.getvalue())

    def test_record_gaming_heartbeat_intervals_and_final(self) -> None:
        from django.core.cache import cache

        from apps.social.services import record_gaming_heartbeat

        cache.clear()
        session_id = "test-session-123"

        # Duration 120s (2 min) without is_final: tracks 2 XP live, awards 0 XP during session
        res1 = record_gaming_heartbeat(
            user_id=self.user1.id,
            game_id="elden-ring",
            game_title="Elden Ring",
            duration_seconds=120,
            session_id=session_id,
            is_final=False,
        )
        self.assertEqual(res1["xp_awarded"], 0)
        self.assertEqual(res1["session_xp"], 2)
        self.assertEqual(res1["total_xp"], 0)

        # Duration 300s (5 min) without is_final: tracks 5 XP live, awards 0 XP during session
        res2 = record_gaming_heartbeat(
            user_id=self.user1.id,
            game_id="elden-ring",
            game_title="Elden Ring",
            duration_seconds=300,
            session_id=session_id,
            is_final=False,
        )
        self.assertEqual(res2["xp_awarded"], 0)
        self.assertEqual(res2["session_xp"], 5)
        self.assertEqual(res2["total_xp"], 0)

        # Duration 600s (10 min) without is_final: tracks 10 XP live, awards 0 XP during session
        res3 = record_gaming_heartbeat(
            user_id=self.user1.id,
            game_id="elden-ring",
            game_title="Elden Ring",
            duration_seconds=600,
            session_id=session_id,
            is_final=False,
        )
        self.assertEqual(res3["xp_awarded"], 0)
        self.assertEqual(res3["session_xp"], 10)
        self.assertEqual(res3["total_xp"], 0)

        # Final heartbeat at 750s (12 min 30 sec): awards 12 XP (1 XP per full minute) at end of session
        res4 = record_gaming_heartbeat(
            user_id=self.user1.id,
            game_id="elden-ring",
            game_title="Elden Ring",
            duration_seconds=750,
            session_id=session_id,
            is_final=True,
        )
        self.assertEqual(res4["xp_awarded"], 12)
        self.assertEqual(res4["session_xp"], 12)
        self.assertEqual(res4["total_xp"], 12)

    def test_record_gaming_heartbeat_has_no_daily_cap(self) -> None:
        from django.core.cache import cache

        from apps.social.services import record_gaming_heartbeat

        cache.clear()
        today_str = timezone.now().strftime("%Y-%m-%d")
        daily_key = f"gaming_daily:{self.user1.id}:{today_str}"
        # Set daily XP already very high (e.g. 1500 XP)
        cache.set(daily_key, 1500, timeout=86400)

        res = record_gaming_heartbeat(
            user_id=self.user1.id,
            game_id="elden-ring",
            game_title="Elden Ring",
            duration_seconds=300,
            session_id="no-cap-session",
            is_final=True,
        )
        # Awards full 5 XP (5 minutes) regardless of how much XP was gained today
        self.assertEqual(res["xp_awarded"], 5)
        self.assertEqual(res["daily_xp"], 1505)

    def test_gaming_heartbeat_api_endpoint(self) -> None:
        from rest_framework.test import APIClient

        client = APIClient()

        # Anonymous request -> 401
        anon_resp = client.post(
            "/api/v1/users/me/gaming-heartbeat",
            {"game_id": "game-1", "duration_seconds": 300},
            format="json",
        )
        self.assertEqual(anon_resp.status_code, 401)

        # Authenticated request without game_id -> 400
        client.force_authenticate(user=self.user1)
        bad_resp = client.post(
            "/api/v1/users/me/gaming-heartbeat",
            {"duration_seconds": 300},
            format="json",
        )
        self.assertEqual(bad_resp.status_code, 400)

        # Valid authenticated request -> 200
        ok_resp = client.post(
            "/api/v1/users/me/gaming-heartbeat",
            {
                "game_id": "elden-ring",
                "game_title": "Elden Ring",
                "duration_seconds": 300,
                "session_id": "api-sess-1",
            },
            format="json",
        )
        self.assertEqual(ok_resp.status_code, 200)
        data = ok_resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("xp_awarded", data)
        self.assertIn("session_xp", data)
        self.assertIn("total_xp", data)
