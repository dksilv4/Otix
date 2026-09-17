"""Mood check-in domain logic.

Port of the legacy ``old-backend/otix/api/user/mood/router.py`` helpers. A user has
at most one row per UTC date (the model enforces this with a unique constraint),
so submit and dismiss are both upserts against today's row. The legacy
``daily_mood_checkins_enabled`` user flag has no greenfield column, so the
``/today`` prompt is always considered enabled.
"""

from datetime import date

from django.utils import timezone

from apps.social.models import UserMoodCheckIn

# The greenfield ``ck_user_mood_checkins_submitted_mood`` constraint is inverted
# relative to legacy ("dismissed must carry a mood" instead of "submitted must
# carry one"), so a dismissed row needs a non-null mood value to be insertable.
_DISMISSED_MOOD_PLACEHOLDER = "okay"


def _today() -> date:
    return timezone.localdate()


def get_today_checkin(user_id: int) -> UserMoodCheckIn | None:
    """Fetch the user's check-in for today, if one exists."""
    return UserMoodCheckIn.objects.filter(user_id=user_id, checkin_date=_today()).first()


def submit_checkin(
    user_id: int, mood: str, feeling: str | None, note: str | None
) -> UserMoodCheckIn:
    """Create or update today's row with a submitted mood."""
    checkin = get_today_checkin(user_id)
    if checkin is None:
        checkin = UserMoodCheckIn(user_id=user_id, checkin_date=_today())
    checkin.status = "submitted"
    checkin.mood = mood
    checkin.feeling = feeling or None
    checkin.note = note or None
    checkin.save()
    return checkin


def dismiss_checkin(user_id: int) -> UserMoodCheckIn:
    """Create or update today's row as dismissed so the prompt does not repeat."""
    checkin = get_today_checkin(user_id)
    if checkin is None:
        checkin = UserMoodCheckIn(user_id=user_id, checkin_date=_today())
    checkin.status = "dismissed"
    checkin.feeling = None
    checkin.note = None
    if not checkin.mood:
        checkin.mood = _DISMISSED_MOOD_PLACEHOLDER
    checkin.save()
    return checkin
