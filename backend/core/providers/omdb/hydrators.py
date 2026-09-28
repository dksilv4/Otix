"""OMDb rating enrichment into Django ExternalRating models.

Mirrors and expands ``apps.media.services.omdb_ingest`` to provide
complete rating enrichment for movies and shows.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.contenttypes.models import ContentType

from apps.media.models import ExternalID, ExternalRating, MediaItem
from apps.media.services.completeness import recompute_completeness
from core.providers.framework import NormalizedRating
from core.providers.omdb.transformers import rating_specs

if TYPE_CHECKING:
    from core.providers.omdb.client import OMDbProvider


def _stored_imdb_id(media_item_id: int) -> str | None:
    """The media row's IMDb id (``provider="imdb"`` ``ExternalID``), if any."""
    return (
        ExternalID.objects.filter(
            content_type=ContentType.objects.get_for_model(MediaItem),
            provider="imdb",
            object_id=media_item_id,
        )
        .values_list("external_id", flat=True)
        .first()
    )


def upsert_omdb_ratings(media_item_id: int, raw: dict[str, Any]) -> int:
    """Upsert the OMDb ratings for *media_item_id*; return rows newly created.

    One ``ExternalRating`` per provider; an existing row's ``score``/``max_score``/
    ``vote_count`` are refreshed when they drifted. Recomputes completeness when
    anything changed.
    """
    specs = rating_specs(raw)
    if not specs:
        return 0
    media = MediaItem.objects.get(pk=media_item_id)
    added = 0
    changed = False
    for spec in specs:
        provider = spec["provider"]
        row = ExternalRating.objects.filter(media_item=media, provider=provider).first()
        if row is None:
            ExternalRating.objects.create(media_item=media, **spec)
            added += 1
            changed = True
            continue
        updates = {
            key: value
            for key, value in spec.items()
            if key != "provider" and getattr(row, key) != value
        }
        if updates:
            for key, value in updates.items():
                setattr(row, key, value)
            row.save(update_fields=tuple(updates))
            changed = True
    if changed:
        recompute_completeness(media)
    return added


def hydrate_normalized_ratings(media_item_id: int, ratings: list[NormalizedRating]) -> int:
    """Hydrate a list of NormalizedRating instances into ExternalRating records."""
    if not ratings:
        return 0
    media = MediaItem.objects.get(pk=media_item_id)
    added = 0
    changed = False
    for r in ratings:
        row = ExternalRating.objects.filter(media_item=media, provider=r.provider).first()
        spec = {
            "score": r.score,
            "max_score": r.max_score,
            "vote_count": r.votes,
        }
        if row is None:
            ExternalRating.objects.create(media_item=media, provider=r.provider, **spec)
            added += 1
            changed = True
        else:
            updates = {key: value for key, value in spec.items() if getattr(row, key) != value}
            if updates:
                for key, value in updates.items():
                    setattr(row, key, value)
                row.save(update_fields=tuple(updates))
                changed = True
    if changed:
        recompute_completeness(media)
    return added


async def omdb_enrich_ratings(
    media_item_id: int,
    *,
    provider: OMDbProvider | None = None,
) -> dict[str, Any]:
    """Fetch + attach a title's OMDb ratings; a benign no-op when inapplicable."""
    if not getattr(settings, "OMDB_API_KEY", ""):
        return {
            "media_item_id": media_item_id,
            "imdb_id": None,
            "enriched": False,
            "ratings_added": 0,
            "reason": "unconfigured",
        }
    imdb_id = await sync_to_async(_stored_imdb_id)(media_item_id)
    if imdb_id is None:
        return {
            "media_item_id": media_item_id,
            "imdb_id": None,
            "enriched": False,
            "ratings_added": 0,
            "reason": "no imdb id",
        }
    if provider is None:
        from core.providers.omdb.client import OMDbProvider

        provider = OMDbProvider()
    raw = await provider.get_by_imdb_id(imdb_id)
    if raw is None:
        return {
            "media_item_id": media_item_id,
            "imdb_id": imdb_id,
            "enriched": False,
            "ratings_added": 0,
            "reason": "no result",
        }
    added = await sync_to_async(upsert_omdb_ratings)(media_item_id, raw)
    return {
        "media_item_id": media_item_id,
        "imdb_id": imdb_id,
        "enriched": added > 0,
        "ratings_added": added,
        "reason": None,
    }
