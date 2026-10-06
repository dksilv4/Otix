"""Management command to recalculate and backfill user XP across the platform.

Usage:
    python manage.py backfill_xp [--dry-run] [--user <username>]
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.lists.models import UserList
from apps.social.models import (
    MediaItemRating,
    Review,
    UserBadge,
    UserMediaInteraction,
    UserMoodCheckIn,
)
from apps.social.services.badge_registry import BADGE_DEFS
from apps.social.services.user_badges import check_and_award_badges
from apps.social.services.xp import (
    INTERACTION_LIKE_WATCHLIST_STARTED,
    INTERACTION_WATCHED_PLAYED_LISTENED,
    LIST_CREATE,
    MOOD_CHECKIN,
    RATING_SUBMIT,
    REVIEW_SCORE_ONLY,
    REVIEW_WITH_CONTENT,
    WORKOUT_COMPLETE,
)
from apps.workout.models import Workout


class Command(BaseCommand):
    help = "Retroactively calculate and populate total_xp for users from activity history."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Calculate XP without committing changes to the database.",
        )
        parser.add_argument(
            "--user",
            type=str,
            help="Limit backfill to a single username.",
        )

    def handle(self, *args, **options) -> None:
        dry_run: bool = options["dry_run"]
        username: str | None = options["user"]

        User = get_user_model()
        users_qs = User.objects.all()
        if username:
            users_qs = users_qs.filter(username=username)

        total_users = users_qs.count()
        self.stdout.write(
            self.style.NOTICE(
                f"Starting XP backfill for {total_users} user(s) (dry_run={dry_run})..."
            )
        )

        total_xp_all = 0
        updated_users = 0

        for user in users_qs:
            user_xp = 0

            # 1. Reviews
            reviews = Review.objects.filter(user_id=user.id).values_list("content", flat=True)
            for content in reviews:
                if content and content.strip():
                    user_xp += REVIEW_WITH_CONTENT
                else:
                    user_xp += REVIEW_SCORE_ONLY

            # 2. Standalone ratings (not linked to reviews)
            reviewed_media_ids = set(
                Review.objects.filter(user_id=user.id).values_list("media_item_id", flat=True)
            )
            standalone_ratings = (
                MediaItemRating.objects.filter(user_id=user.id)
                .exclude(media_item_id__in=reviewed_media_ids)
                .count()
            )
            user_xp += standalone_ratings * RATING_SUBMIT

            # 3. Media Interactions
            interactions = UserMediaInteraction.objects.filter(user_id=user.id).values_list(
                "interaction_type", flat=True
            )
            for itype in interactions:
                if itype in ("watched", "played", "listened"):
                    user_xp += INTERACTION_WATCHED_PLAYED_LISTENED
                elif itype in ("liked", "watchlisted", "started"):
                    user_xp += INTERACTION_LIKE_WATCHLIST_STARTED

            # 4. Workouts
            workouts_count = Workout.objects.filter(user_id=user.id).count()
            user_xp += workouts_count * WORKOUT_COMPLETE

            # 5. Lists
            lists_count = UserList.objects.filter(user_id=user.id).count()
            user_xp += lists_count * LIST_CREATE

            # 6. Mood check-ins
            mood_count = UserMoodCheckIn.objects.filter(
                user_id=user.id, status="submitted"
            ).count()
            user_xp += mood_count * MOOD_CHECKIN

            # 7. Claimed Badges
            claimed_badges = UserBadge.objects.filter(user_id=user.id, claimed=True).values_list(
                "badge_key", flat=True
            )
            for bkey in claimed_badges:
                bdef = BADGE_DEFS.get(bkey)
                if bdef:
                    user_xp += bdef.xp_reward

            total_xp_all += user_xp
            updated_users += 1

            self.stdout.write(
                f"  {user.username} (id={user.id}): {user.total_xp} -> {user_xp} XP"
            )

            if not dry_run:
                with transaction.atomic():
                    User.objects.filter(pk=user.id).update(total_xp=user_xp)
                    check_and_award_badges(user.id)

        mode_str = "[DRY RUN] " if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode_str}Completed XP backfill: {updated_users} users processed, {total_xp_all} total XP calculated."
            )
        )
