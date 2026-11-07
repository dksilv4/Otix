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

        user_ids = list(users_qs.values_list("id", flat=True))
        if not user_ids:
            self.stdout.write("No users to process.")
            return

        from collections import defaultdict
        from django.db.models import Count

        # 1. Bulk Reviews
        reviews_by_user = defaultdict(list)
        reviewed_media_ids_by_user = defaultdict(set)
        for uid, content, mid in Review.objects.filter(user_id__in=user_ids).values_list("user_id", "content", "media_item_id"):
            reviews_by_user[uid].append(content)
            if mid:
                reviewed_media_ids_by_user[uid].add(mid)

        # 2. Standalone ratings
        ratings_by_user = defaultdict(int)
        for uid, mid in MediaItemRating.objects.filter(user_id__in=user_ids).values_list("user_id", "media_item_id"):
            if mid not in reviewed_media_ids_by_user[uid]:
                ratings_by_user[uid] += 1

        # 3. Interactions
        interactions_by_user = defaultdict(list)
        for uid, itype in UserMediaInteraction.objects.filter(user_id__in=user_ids).values_list("user_id", "interaction_type"):
            interactions_by_user[uid].append(itype)

        # 4. Workouts
        workouts_by_user = dict(Workout.objects.filter(user_id__in=user_ids).values("user_id").annotate(c=Count("id")).values_list("user_id", "c"))

        # 5. Lists
        lists_by_user = dict(UserList.objects.filter(user_id__in=user_ids).values("user_id").annotate(c=Count("id")).values_list("user_id", "c"))

        # 6. Mood check-ins
        mood_by_user = dict(UserMoodCheckIn.objects.filter(user_id__in=user_ids, status="submitted").values("user_id").annotate(c=Count("id")).values_list("user_id", "c"))

        # 7. Claimed Badges
        badges_by_user = defaultdict(list)
        for uid, bkey in UserBadge.objects.filter(user_id__in=user_ids, claimed=True).values_list("user_id", "badge_key"):
            badges_by_user[uid].append(bkey)

        for user in users_qs:
            user_xp = 0

            # 1. Reviews
            for content in reviews_by_user.get(user.id, []):
                if content and content.strip():
                    user_xp += REVIEW_WITH_CONTENT
                else:
                    user_xp += REVIEW_SCORE_ONLY

            # 2. Standalone ratings (not linked to reviews)
            user_xp += ratings_by_user.get(user.id, 0) * RATING_SUBMIT

            # 3. Media Interactions
            for itype in interactions_by_user.get(user.id, []):
                if itype in ("watched", "played", "listened"):
                    user_xp += INTERACTION_WATCHED_PLAYED_LISTENED
                elif itype in ("liked", "watchlisted", "started"):
                    user_xp += INTERACTION_LIKE_WATCHLIST_STARTED

            # 4. Workouts
            user_xp += workouts_by_user.get(user.id, 0) * WORKOUT_COMPLETE

            # 5. Lists
            user_xp += lists_by_user.get(user.id, 0) * LIST_CREATE

            # 6. Mood check-ins
            user_xp += mood_by_user.get(user.id, 0) * MOOD_CHECKIN

            # 7. Claimed Badges
            for bkey in badges_by_user.get(user.id, []):
                bdef = BADGE_DEFS.get(bkey)
                if bdef:
                    user_xp += bdef.xp_reward

            total_xp_all += user_xp
            updated_users += 1

            self.stdout.write(f"  {user.username} (id={user.id}): {user.total_xp} -> {user_xp} XP")

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
