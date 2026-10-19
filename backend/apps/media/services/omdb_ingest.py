"""OMDb rating enrichment — IMDb/Rotten Tomatoes/Metacritic scores for movie/show.

The first keyed secondary-provider enrich stage of the ingestion overhaul
(plan item 1.4; ``core.providers.omdb`` is the ported async client). TMDB movie
and show seeds already write a ``provider="imdb"`` ``ExternalID`` when the
detail carries an IMDb id, so a TMDB-synced title with one is looked up on OMDb
by that id and its ``Ratings`` array + top-level ``imdbRating``/``imdbVotes``
map onto ``ExternalRating`` rows (one per provider, upserted):

- "Internet Movie Database" -> ``provider="imdb"``, score/10, votes from ``imdbVotes``
- "Rotten Tomatoes"        -> ``provider="rotten_tomatoes"``, score/100
- "Metacritic"             -> ``provider="metacritic"``, score/100

Enrichment is best-effort + media-first: an unset ``OMDB_API_KEY``, a row with
no IMDb id, or an OMDb miss are all benign no-ops (nothing fetched/raised), and
a re-sync only refreshes an existing row whose score drifted. The async driver
runs its DB read + upsert through ``sync_to_async`` (worker-thread writes), so
its async tests stub those helpers — the real DB writes are covered by the sync
``TestCase`` methods. Upserting an OMDb row also recomputes the title's
completeness (``has_external_ratings`` reads ``external_ratings.exists()``).
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.contenttypes.models import ContentType

from apps.media.models import ExternalID, ExternalRating, MediaItem
from apps.media.services.completeness import recompute_completeness

if TYPE_CHECKING:
    from core.providers.omdb import OMDbProvider

# (OMDb ``Ratings`` Source name, ExternalRating provider, max_score). ``max``
# differs per source (IMDb /10, RT + Metacritic /100), matching the legacy
# ``_RATING_SOURCES`` table in ``otix.providers.omdb.transformer``.
_RATING_SOURCES: tuple[tuple[str, str, float], ...] = (
    ("Internet Movie Database", "imdb", 10.0),
    ("Rotten Tomatoes", "rotten_tomatoes", 100.0),
    ("Metacritic", "metacritic", 100.0),
)

_VOTE_RE = re.compile(r"\d+")


def _parse_votes(raw: Any) -> int | None:
    """Parse a comma-separated vote count like '2,304,528' into 2304528."""
    if not raw or not isinstance(raw, str):
        return None
    match = _VOTE_RE.search(raw.replace(",", ""))
    if match is None:
        return None
    try:
        return int(match.group())
    except ValueError:
        return None


def _parse_score(raw: Any) -> float | None:
    """Parse '8.8/10', '79%', '67/100' or a bare '8.8' into a float."""
    if not raw or not isinstance(raw, str):
        return None
    if raw == "N/A":  # OMDb's placeholder for an unavailable value
        return None
    try:
        if raw.endswith("%"):
            return float(raw[:-1])
        parts = raw.split("/")
        if len(parts) == 2:
            return float(parts[0])
        return float(raw)
    except ValueError:
        return None


def _rating_specs(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Map an OMDb payload to the ExternalRating rows it should produce."""
    known = {name: (provider, max_score) for name, provider, max_score in _RATING_SOURCES}
    specs: list[dict[str, Any]] = []
    for entry in raw.get("Ratings") or []:
        if not isinstance(entry, dict):
            continue
        pair = known.get(entry.get("Source"))
        if pair is None:
            continue
        provider, max_score = pair
        score = _parse_score(entry.get("Value"))
        if score is None:
            continue
        specs.append(
            {
                "provider": provider,
                "score": score,
                "max_score": max_score,
                "vote_count": _parse_votes(raw.get("imdbVotes")) if provider == "imdb" else None,
            }
        )
    # The Ratings array occasionally omits the IMDb entry; fall back to the
    # top-level imdbRating/imdbVotes fields.
    if not any(spec["provider"] == "imdb" for spec in specs):
        score = _parse_score(raw.get("imdbRating"))
        if score is not None:
            specs.append(
                {
                    "provider": "imdb",
                    "score": score,
                    "max_score": 10.0,
                    "vote_count": _parse_votes(raw.get("imdbVotes")),
                }
            )
    return specs


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

    One ``ExternalRating`` per provider (the natural key other ingest stages
    share); an existing row's ``score``/``max_score``/``vote_count`` are refreshed
    when they drifted. Recomputes the item's completeness when anything changed.
    """
    specs = _rating_specs(raw)
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
        from apps.media.services.rating import compute_and_store_overall_rating

        compute_and_store_overall_rating(media.pk)
    return added


async def omdb_enrich_ratings(
    media_item_id: int,
    *,
    provider: OMDbProvider | None = None,
) -> dict[str, Any]:
    """Fetch + attach a title's OMDb ratings; a benign no-op when inapplicable.

    Media-first: a row with no ``provider="imdb"`` ``ExternalID`` (or an unset
    ``OMDB_API_KEY``) returns immediately without a fetch; an OMDb miss is also a
    benign no-op, never a hard failure — ratings are best-effort enrichment.
    *provider* is injectable for tests and defaults to a real OMDb client.
    """
    if not settings.OMDB_API_KEY:
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
        from core.providers.omdb import OMDbProvider  # local: avoid eager build

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
