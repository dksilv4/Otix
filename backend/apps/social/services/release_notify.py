"""Release notifications for followed studios (companies).

A user follows a company (``UserCompanyFollow``); when a title involving that
company enters the catalog, or an announced title's release date arrives, the
user gets a ``studio_release`` ``Notification``. Two producers call in:

- the TMDB sync engine, right after a not-previously-mapped title is seeded
  (works because the Wikidata distributor enrich runs inside that same fetch, so
  distributor-only studios like A24 are attached before this fires);
- the ``social.notify_release_transitions`` beat task, which catches titles that
  were seeded earlier as *upcoming* and whose release date has now arrived.

Both are idempotent: ``Notification.dedupe_key`` is unique, so a title notifies a
given user at most once per ``(kind)``. ``kind`` is ``"announced"`` (future/undated
release) or ``"available"`` (released), so an upcoming title yields an announced
notification at seed and an available one once the date lands.
"""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import QuerySet
from django.utils import timezone

from apps.company.models import InvolvedCompany, UserCompanyFollow
from apps.media.models import MediaItem
from apps.social.models import Notification

# A newly-created catalog row only notifies when its release is current-ish: this
# keeps a bulk backfill of the historical catalog from firing release alerts for
# decades-old titles. Applied to the ingest path only (the transition sweep is
# inherently date-current).
RECENT_RELEASE_WINDOW_DAYS = 90

STUDIO_RELEASE_TYPE = "studio_release"
_PREF_KEY = "studio_release"


def involved_company_ids(media_item_id: int) -> list[int]:
    """Company ids attached to the media item (producers and distributors)."""
    return list(
        InvolvedCompany.objects.filter(media_item_id=media_item_id).values_list(
            "company_id", flat=True
        )
    )


def has_followers(company_ids: list[int]) -> bool:
    """True when any of *company_ids* has at least one follower."""
    if not company_ids:
        return False
    return UserCompanyFollow.objects.filter(company_id__in=company_ids).exists()


def media_has_followed_company(media_item_id: int) -> bool:
    """True when any company on the title is followed by a user."""
    return has_followers(involved_company_ids(media_item_id))


def is_recent_release(
    media: MediaItem, window_days: int = RECENT_RELEASE_WINDOW_DAYS
) -> bool:
    """True for an undated title or one releasing within the trailing window."""
    if media.release_date is None:
        return True
    return media.release_date >= timezone.localdate() - timedelta(days=window_days)


def kind_for(media: MediaItem) -> str:
    """``"available"`` once released, else ``"announced"`` (future or undated)."""
    if media.release_date is not None and media.release_date <= timezone.localdate():
        return "available"
    return "announced"


def _release_phrase(media: MediaItem) -> str:
    if media.release_date is None:
        return ""
    return f" — {media.release_date.strftime('%b %d, %Y')}"


def notify_company_followers(media_item_id: int, *, kind: str) -> list[Notification]:
    """Create a ``studio_release`` notification per follower of the title's studios.

    Deduped by ``(user, media, kind)``; users who disabled the ``studio_release``
    preference are skipped. Returns the notifications actually created (web-push
    and SSE fan-out run via the ``Notification`` post_save signal).
    """
    media = MediaItem.objects.filter(pk=media_item_id).first()
    if media is None:
        return []
    follows = (
        UserCompanyFollow.objects.filter(company_id__in=involved_company_ids(media_item_id))
        .select_related("company")
        .order_by("created_at")
    )
    by_user: dict[int, list] = {}
    for follow in follows:
        by_user.setdefault(follow.user_id, []).append(follow.company)
    if not by_user:
        return []

    user_model = get_user_model()
    prefs = dict(
        user_model.objects.filter(pk__in=by_user).values_list(
            "id", "notification_preferences"
        )
    )

    created: list[Notification] = []
    for user_id, companies in by_user.items():
        if (prefs.get(user_id) or {}).get(_PREF_KEY, True) is False:
            continue
        company = companies[0]
        verb = "Now available" if kind == "available" else "Coming soon"
        title = f"{verb} from {company.name}"
        body = f"{media.title}{_release_phrase(media) if kind == 'announced' else ''}"
        notification, was_created = Notification.objects.get_or_create(
            dedupe_key=f"{STUDIO_RELEASE_TYPE}:{user_id}:{media_item_id}:{kind}",
            defaults={
                "user_id": user_id,
                "type": STUDIO_RELEASE_TYPE,
                "title": title,
                "body": body,
                "metadata_json": {
                    "mediaId": media.pk,
                    "mediaSlug": media.slug,
                    "mediaType": media.media_type,
                    "companyId": company.pk,
                    "companyName": company.name,
                    "kind": kind,
                },
            },
        )
        if was_created:
            created.append(notification)
    return created


def transitioning_titles(window_days: int = 1) -> QuerySet[MediaItem]:
    """Titles whose release date landed within the trailing *window_days*.

    Restricted to titles carrying a followed studio so the sweep never touches
    the wider catalog.
    """
    today = timezone.localdate()
    return MediaItem.objects.filter(
        release_date__gt=today - timedelta(days=window_days),
        release_date__lte=today,
        involved_companies__company__followers__isnull=False,
    ).distinct()


__all__ = [
    "RECENT_RELEASE_WINDOW_DAYS",
    "STUDIO_RELEASE_TYPE",
    "has_followers",
    "involved_company_ids",
    "is_recent_release",
    "kind_for",
    "media_has_followed_company",
    "notify_company_followers",
    "transitioning_titles",
]
