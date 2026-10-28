"""Lifecycle stamps for catalog rows: content hash skip + next_sync_at."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime, timedelta
from typing import Any

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone as dj_timezone

from apps.media.models import ExternalID, MediaItem
from apps.media.services.identity import CANONICAL_PROVIDER

MAX_ESCALATION_DAYS = 90
VOLATILE_KEYS = frozenset({"popularity", "hypes"})


def compute_content_hash(raw: dict[str, Any] | None) -> str:
    """SHA256 of a provider payload, excluding volatile fields."""
    stable = {k: v for k, v in (raw or {}).items() if k not in VOLATILE_KEYS}
    return hashlib.sha256(json.dumps(stable, sort_keys=True, default=str).encode()).hexdigest()


def compute_next_sync_at(
    entity_type: str,
    raw: dict[str, Any] | None = None,
    hash_match_count: int = 0,
    *,
    now: datetime | None = None,
) -> datetime:
    """Next rehydrate time from media lifecycle, doubled on unchanged payloads."""
    now = now or datetime.now(UTC)
    raw = raw or {}
    if entity_type == "movie":
        base_hours = _movie_hours(raw, now.date())
    elif entity_type == "show":
        base_hours = _show_hours(raw, now.date())
    elif entity_type == "game":
        base_hours = _game_hours(raw, now.date())
    else:
        base_hours = 24 * 30
    escalation = 2 ** min(hash_match_count, 5)
    hours = min(base_hours * escalation, MAX_ESCALATION_DAYS * 24)
    return now + timedelta(hours=hours)


def _movie_hours(raw: dict[str, Any], today: date) -> int:
    release_str = raw.get("release_date") or ""
    age_days = _age_days(release_str, today)
    if age_days <= 90:
        return 12
    if age_days <= 730:
        return 24 * 7
    return 24 * 30


def _show_hours(raw: dict[str, Any], today: date) -> int:
    status = raw.get("status") or ""
    if status in ("Returning Series", "In Production", "Planned"):
        return 6
    if status in ("Ended", "Canceled"):
        age_days = _age_days(raw.get("last_air_date") or "", today)
        return 24 * 7 if age_days <= 730 else 24 * 30
    return 24 * 7


def _game_hours(raw: dict[str, Any], today: date) -> int:
    ts = raw.get("first_release_date")
    if ts and isinstance(ts, int | float):
        try:
            release = datetime.fromtimestamp(float(ts), tz=UTC).date()
            age_days = (today - release).days
        except (ValueError, OSError, OverflowError):
            age_days = None
    else:
        age_days = None
    if age_days is None or age_days < 0:
        return 12
    if age_days <= 90:
        return 24
    if age_days <= 730:
        return 24 * 7
    return 24 * 30


def _age_days(value: str, today: date) -> int:
    if not value:
        return 9999
    try:
        parsed = datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return 9999
    return (today - parsed).days


def record_payload_hash(
    media_id: int,
    provider: str,
    external_id: str,
    media_type: str,
    raw: dict[str, Any],
    *,
    matched: bool,
) -> int:
    """Persist the payload hash on the canonical ExternalID. Return match count."""
    ct = ContentType.objects.get_for_model(MediaItem)
    digest = compute_content_hash(raw)
    row = ExternalID.objects.filter(
        content_type=ct,
        provider=provider,
        external_id=str(external_id),
        media_type=media_type,
        object_id=media_id,
    ).first()
    if row is None:
        return 0
    if matched:
        row.hash_match_count = (row.hash_match_count or 0) + 1
    else:
        row.hash_match_count = 0
    row.content_hash = digest
    row.save(update_fields=("content_hash", "hash_match_count", "updated_at"))
    return row.hash_match_count


def payload_hash_matches(
    media_id: int, provider: str, external_id: str, media_type: str, raw: dict[str, Any]
) -> bool:
    ct = ContentType.objects.get_for_model(MediaItem)
    digest = compute_content_hash(raw)
    stored = (
        ExternalID.objects.filter(
            content_type=ct,
            provider=provider,
            external_id=str(external_id),
            media_type=media_type,
            object_id=media_id,
        )
        .values_list("content_hash", flat=True)
        .first()
    )
    return bool(stored) and stored == digest


def stamp_sync_window(
    media: MediaItem,
    raw: dict[str, Any],
    *,
    hash_match_count: int = 0,
) -> None:
    media.synced_at = dj_timezone.now()
    media.next_sync_at = compute_next_sync_at(
        media.media_type, raw, hash_match_count, now=datetime.now(UTC)
    )
    media.save(update_fields=("synced_at", "next_sync_at", "updated_at"))


def finish_catalog_seed(
    media: MediaItem,
    raw: dict[str, Any],
    *,
    provider: str,
    external_id: str,
    hash_matched: bool,
) -> None:
    """Hash + next_sync_at + SSE + pending library links after a seed/rehydrate."""
    from apps.media.services.catalog_events import publish_media_updated
    from apps.media.services.catalog_link import link_pending_library_rows
    from apps.media.services.completeness import recompute_completeness

    recompute_completeness(media)
    count = record_payload_hash(
        media.pk, provider, str(external_id), media.media_type, raw, matched=hash_matched
    )
    stamp_sync_window(media, raw, hash_match_count=count)
    media.refresh_from_db(fields=("completeness_score",))
    publish_media_updated(
        media_id=media.pk,
        media_type=media.media_type,
        completeness_score=media.completeness_score,
    )
    link_pending_library_rows(media.pk)


def canonical_external_id(media: MediaItem) -> str | None:
    provider = CANONICAL_PROVIDER.get(media.media_type)
    if not provider:
        return None
    prefetched = getattr(media, "_prefetched_objects_cache", {}).get("external_ids")
    if prefetched is not None:
        for ext in prefetched:
            if ext.provider == provider and (
                ext.media_type == media.media_type or not ext.media_type
            ):
                return ext.external_id
        return None
    ct = ContentType.objects.get_for_model(MediaItem)
    return (
        ExternalID.objects.filter(
            content_type=ct,
            object_id=media.pk,
            provider=provider,
            media_type=media.media_type,
        )
        .values_list("external_id", flat=True)
        .first()
    )
