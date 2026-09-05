"""Gamification and check-in state: badges, streaks, karma, mood.

Ported from the legacy ``user_badge.py`` / ``user_streak.py`` /
``karma_transaction.py`` / ``mood.py`` domain modules. ``user_streaks`` keyed
its single row on the user id, so it is modeled as a ``OneToOneField`` PK like
the media subtype pattern.
"""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel

MOOD_STATUS_VALUES = ("submitted", "dismissed")
MOOD_VALUES = ("bad", "low", "okay", "good", "great")
FEELING_VALUES = (
    "heartbroken",
    "stressed",
    "anxious",
    "tired",
    "lonely",
    "bored",
    "calm",
    "focused",
    "excited",
    "grateful",
)


class UserBadge(TimestampedModel):
    """A badge key earned (and possibly claimed) by a user."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="badges"
    )
    badge_key = models.CharField(max_length=100)
    claimed = models.BooleanField(default=False)

    class Meta(TimestampedModel.Meta):
        db_table = "user_badges"
        constraints = [
            models.UniqueConstraint(fields=["user", "badge_key"], name="uq_user_badge"),
        ]
        indexes = [
            models.Index(fields=["user"], name="ix_user_badges_user"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.badge_key}"


class UserStreak(TimestampedModel):
    """One streak ledger row per user (PK is the user id)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="streak",
    )
    current_login_streak = models.IntegerField(default=0)
    longest_login_streak = models.IntegerField(default=0)
    current_review_streak = models.IntegerField(default=0)
    longest_review_streak = models.IntegerField(default=0)
    current_workout_streak = models.IntegerField(default=0)
    longest_workout_streak = models.IntegerField(default=0)
    last_activity_date = models.DateField(null=True, blank=True)
    last_review_week = models.DateField(null=True, blank=True)
    last_workout_date = models.DateField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "user_streaks"

    def __str__(self) -> str:
        return f"streak:{self.user_id}"


class KarmaTransaction(TimestampedModel):
    """A karma delta applied to a user for a reason."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="karma_transactions"
    )
    amount = models.IntegerField()
    reason = models.CharField(max_length=50)
    reference_id = models.CharField(max_length=100, null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "karma_transactions"
        indexes = [
            models.Index(fields=["user"], name="ix_karma_transactions_user"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.reason}={self.amount}"


class UserMoodCheckIn(TimestampedModel):
    """A user's daily mood/feeling check-in (one per user per day)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mood_checkins"
    )
    checkin_date = models.DateField()
    status = models.CharField(max_length=20)
    mood = models.CharField(max_length=20, null=True, blank=True)
    feeling = models.CharField(max_length=32, null=True, blank=True)
    note = models.TextField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "user_mood_checkins"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "checkin_date"], name="uq_user_mood_checkins_user_date"
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=MOOD_STATUS_VALUES),
                name="ck_user_mood_checkins_status",
            ),
            models.CheckConstraint(
                condition=models.Q(mood__isnull=True) | models.Q(mood__in=MOOD_VALUES),
                name="ck_user_mood_checkins_mood",
            ),
            models.CheckConstraint(
                condition=models.Q(feeling__isnull=True) | models.Q(feeling__in=FEELING_VALUES),
                name="ck_user_mood_checkins_feeling",
            ),
            models.CheckConstraint(
                condition=~models.Q(status="dismissed", mood__isnull=True),
                name="ck_user_mood_checkins_submitted_mood",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "checkin_date"], name="ix_user_mood_checkin_date"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.checkin_date}:{self.status}"
