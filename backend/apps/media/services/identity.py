"""Catalog identity: ExternalID is the only link between platforms.

A ``MediaItem`` is never created here. Callers look up or attach provider ids,
and ``merge_media_items`` collapses existing stub twins that share a canonical
id. Hub rows are created only by TMDB/IGDB seed engines.
"""

from __future__ import annotations

import logging
from typing import Any

from django.apps import apps
from django.contrib.contenttypes.models import ContentType
from django.db import IntegrityError, transaction
from django.db.models import UniqueConstraint

from apps.media.models import ExternalID, MediaItem

logger = logging.getLogger(__name__)

CANONICAL_PROVIDER = {
    "movie": "tmdb",
    "show": "tmdb",
    "game": "igdb",
}

LIVE_JOB_STATUSES = ("pending", "running")


def _media_ct() -> ContentType:
    return ContentType.objects.get_for_model(MediaItem)


def find_media_id(provider: str, external_id: str, media_type: str | None) -> int | None:
    """Return the hub pk recorded for this provider id, or ``None``."""
    if not provider or not external_id:
        return None
    qs = ExternalID.objects.filter(
        content_type=_media_ct(),
        provider=provider,
        external_id=str(external_id),
    )
    if media_type is None:
        qs = qs.filter(media_type__isnull=True)
    else:
        qs = qs.filter(media_type=media_type)
    return qs.values_list("object_id", flat=True).first()


def find_media_id_any(ids: dict[str, str], media_type: str) -> int | None:
    """First hub that already owns any of *ids* (canonical providers first)."""
    canonical = CANONICAL_PROVIDER.get(media_type)
    ordered: list[tuple[str, str]] = []
    if canonical and canonical in ids:
        ordered.append((canonical, ids[canonical]))
    for provider, external_id in ids.items():
        if provider == canonical:
            continue
        ordered.append((provider, external_id))
    for provider, external_id in ordered:
        found = find_media_id(provider, external_id, media_type)
        if found is not None:
            return found
        if provider in ("plex",):
            found = find_media_id(provider, external_id, None)
            if found is not None:
                return found
    return None


def _has_canonical(media_id: int, media_type: str) -> bool:
    provider = CANONICAL_PROVIDER.get(media_type)
    if not provider:
        return False
    return ExternalID.objects.filter(
        content_type=_media_ct(),
        object_id=media_id,
        provider=provider,
        media_type=media_type,
    ).exists()


def _prefer_canonical(left_id: int, right_id: int, media_type: str) -> tuple[int, int]:
    """Return ``(winner, loser)``. Prefer the row that already holds the canonical id."""
    left_canon = _has_canonical(left_id, media_type)
    right_canon = _has_canonical(right_id, media_type)
    if left_canon and not right_canon:
        return left_id, right_id
    if right_canon and not left_canon:
        return right_id, left_id
    winner = min(left_id, right_id)
    loser = max(left_id, right_id)
    return winner, loser


def attach_external_id(
    media_id: int,
    provider: str,
    external_id: str,
    media_type: str | None,
) -> int:
    """Map *provider*/*external_id* onto *media_id*. Merge on collision.

    Returns the surviving hub pk (may differ from *media_id* after a merge).
    """
    if not provider or not external_id:
        return media_id
    ext = str(external_id)
    row, created = ExternalID.objects.get_or_create(
        content_type=_media_ct(),
        provider=provider,
        external_id=ext,
        media_type=media_type,
        defaults={"object_id": media_id},
    )
    if created or row.object_id == media_id:
        return media_id
    media = MediaItem.objects.filter(pk=media_id).values_list("media_type", flat=True).first()
    media_type_for_merge = media or media_type or "movie"
    winner, loser = _prefer_canonical(row.object_id, media_id, media_type_for_merge)
    return merge_media_items(winner, loser)


def attach_external_ids(media_id: int, ids: dict[str, str], media_type: str) -> int:
    """Attach every provider id in *ids*. Returns the surviving hub pk."""
    current = media_id
    for provider, external_id in ids.items():
        mt = None if provider == "plex" else media_type
        if not MediaItem.objects.filter(pk=current).exists():
            break
        current = attach_external_id(current, provider, str(external_id), mt)
    return current


def merge_media_items(winner_id: int, loser_id: int) -> int:
    """Move FKs + ExternalIDs from *loser* onto *winner*, then delete *loser*."""
    if winner_id == loser_id:
        return winner_id
    winner = MediaItem.objects.filter(pk=winner_id).first()
    loser = MediaItem.objects.filter(pk=loser_id).first()
    if winner is None:
        return loser_id if loser is not None else winner_id
    if loser is None:
        return winner_id

    with transaction.atomic():
        _reassign_external_ids(winner_id, loser_id)
        _reassign_media_fks(winner_id, loser_id)
        loser.delete()

    try:
        from apps.media.services.catalog_events import publish_media_merged

        publish_media_merged(from_id=loser_id, to_id=winner_id, media_type=winner.media_type)
    except Exception:  # noqa: BLE001 - merge must survive a publish hiccup
        logger.exception("media.merged publish failed from=%s to=%s", loser_id, winner_id)
    return winner_id


def _reassign_external_ids(winner_id: int, loser_id: int) -> None:
    for row in ExternalID.objects.filter(content_type=_media_ct(), object_id=loser_id):
        clash = ExternalID.objects.filter(
            content_type=_media_ct(),
            provider=row.provider,
            external_id=row.external_id,
            media_type=row.media_type,
            object_id=winner_id,
        ).exists()
        if clash:
            row.delete()
            continue
        row.object_id = winner_id
        row.save(update_fields=("object_id", "updated_at"))


def _reassign_media_fks(winner_id: int, loser_id: int) -> None:
    for model, field in _media_fk_fields():
        if field.one_to_one and getattr(field, "primary_key", False):
            continue
        name = field.name
        unique_field_sets = [
            tuple(c.fields)
            for c in model._meta.constraints
            if isinstance(c, UniqueConstraint) and name in c.fields
        ]
        for row in model.objects.filter(**{name: loser_id}):
            setattr(row, f"{name}_id", winner_id)
            try:
                with transaction.atomic():
                    update = [f"{name}_id"]
                    if any(f.name == "updated_at" for f in model._meta.fields):
                        update.append("updated_at")
                    row.save(update_fields=update)
            except IntegrityError:
                if unique_field_sets:
                    row.delete()
                else:
                    raise


def _media_fk_fields() -> list[tuple[Any, Any]]:
    fields: list[tuple[Any, Any]] = []
    for model in apps.get_models():
        for field in model._meta.get_fields():
            if not getattr(field, "is_relation", False):
                continue
            if not (getattr(field, "many_to_one", False) or getattr(field, "one_to_one", False)):
                continue
            if getattr(field, "related_model", None) is not MediaItem:
                continue
            if not hasattr(field, "attname"):
                continue
            fields.append((model, field))
    return fields
