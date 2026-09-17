"""Mood check-in request/response shapes (social domain).

Mirrors ``old-backend/otix/schemas/mood.py``: ``MoodCheckInCreate`` is the request
body, ``MoodCheckInOut`` the persisted row and ``MoodCheckInTodayResponse`` the
``/today`` envelope. Allowed ``mood``/``feeling`` values come straight off the
model module so serializer choices can never drift from the CheckConstraints.
"""

from rest_framework import serializers

from apps.social.models import UserMoodCheckIn
from apps.social.models.gamification import FEELING_VALUES, MOOD_VALUES


class MoodCheckInOutSerializer(serializers.ModelSerializer):
    """A persisted mood check-in (legacy ``MoodCheckInOut``)."""

    class Meta:
        model = UserMoodCheckIn
        fields = (
            "id",
            "user_id",
            "checkin_date",
            "status",
            "mood",
            "feeling",
            "note",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class MoodCheckInTodaySerializer(serializers.Serializer):
    """``GET /mood-checkins/today`` envelope (legacy ``MoodCheckInTodayResponse``)."""

    due = serializers.BooleanField(read_only=True)
    checkin = MoodCheckInOutSerializer(read_only=True, allow_null=True)


class MoodCreateBodySerializer(serializers.Serializer):
    """Mood submit body (legacy ``MoodCheckInCreate``)."""

    mood = serializers.ChoiceField(choices=MOOD_VALUES)
    feeling = serializers.ChoiceField(
        choices=FEELING_VALUES, required=False, allow_null=True, allow_blank=True
    )
    note = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=280
    )
