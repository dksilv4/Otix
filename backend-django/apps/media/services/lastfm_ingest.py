"""Last.fm album enrichment — wiki overview, tags, playcount/listeners.

The second keyed secondary-provider enrich stage of the ingestion overhaul
(plan item 1.5; ``core.providers.lastfm`` is the ported async client). A
MusicBrainz-seeded album is looked up on Last.fm by its primary artist credit +
album title (passing the stored release MBID when present), and the ``album``
payload maps onto the Django graph:

- ``wiki.summary`` -> ``MediaItem.overview`` when the row has none (HTML/Read-more
  suffix stripped),
- ``tags``/``toptags`` (first 6) -> ``Genre`` + ``MediaGenre`` rows (mirroring the
  MBZ album genre path),
- ``playcount`` -> ``ExternalRating(lastfm, /1_000_000)`` and ``listeners`` ->
  ``ExternalRating(lastfm_listeners, /100_000)`` (one row per provider, upserted).

Enrichment is best-effort + media-first: an unset ``LASTFM_API_KEY``, an album
with no resolvable primary-artist credit/title, or a Last.fm miss are all benign
no-ops (nothing fetched/raised). The async driver runs its DB read + write via
``sync_to_async`` (worker-thread), so its async tests stub those helpers — real
DB behavior is covered by the sync ``TestCase`` methods.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.utils.text import slugify

from apps.media.models import ExternalID, ExternalRating, MediaItem
from apps.media.models.genre import Genre, MediaGenre
from apps.media.services.completeness import recompute_completeness
from apps.people.models import MediaCredit

if TYPE_CHECKING:
    from core.providers.lastfm import LastFMProvider

_PLAYCOUNT_MAX = 1_000_000
_LISTENERS_MAX = 100_000


def _clean_summary(summary: str) -> str:
    """Strip a Last.fm wiki summary to plain text (drop tags + Read-more link)."""
    plain = summary.split("<a href=", 1)[0]
    plain = re.sub(r"<[^>]+>", "", plain)
    return re.sub(r"\s+", " ", plain).strip()


def extract_wiki_summary(info: dict[str, Any]) -> str | None:
    """The album's cleaned ``wiki.summary`` (``None`` when absent/blank)."""
    wiki = info.get("wiki")
    if not isinstance(wiki, dict):
        return None
    summary = wiki.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        return None
    cleaned = _clean_summary(summary)
    return cleaned or None


def extract_tags(info: dict[str, Any]) -> list[str]:
    """Album tag names from ``tags.tag`` or ``toptags.tag`` (blank names dropped)."""
    container = info.get("tags")
    if not isinstance(container, dict):
        container = info.get("toptags")
    tags = container.get("tag") if isinstance(container, dict) else None
    if not isinstance(tags, list):
        return []
    return [
        str(t["name"]).strip()
        for t in tags
        if isinstance(t, dict) and t.get("name") and str(t["name"]).strip()
    ]


def _count(raw: Any) -> int | None:
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str) and raw.strip().isdigit():
        return int(raw)
    return None


def _lastfm_rating_rows(info: dict[str, Any]) -> list[tuple[str, int, int]]:
    """(provider, score, max_score) rows for the album's playcount/listeners.

    A missing or zero count emits no row — a 0/``None`` popularity signal is not
    meaningful enough to record (a freshly-added album reports 0 listeners).
    """
    rows: list[tuple[str, int, int]] = []
    playcount = _count(info.get("playcount"))
    if playcount:
        rows.append(("lastfm", playcount, _PLAYCOUNT_MAX))
    listeners = _count(info.get("listeners"))
    if listeners:
        rows.append(("lastfm_listeners", listeners, _LISTENERS_MAX))
    return rows


def _media_ct() -> ContentType:
    return ContentType.objects.get_for_model(MediaItem)


def _album_context(media_item_id: int) -> dict[str, Any] | None:
    """The (primary-artist, album-title, mbid) tuple Last.fm resolves on.

    ``None`` when the album has no title or no ``role="primary"`` artist credit —
    the enrichment has nothing to look up by.
    """
    title = (
        MediaItem.objects.filter(pk=media_item_id)
        .values_list("title", flat=True)
        .first()
    )
    if not title:
        return None
    credit = (
        MediaCredit.objects.filter(media_item_id=media_item_id, role="primary")
        .select_related("person")
        .first()
    )
    if credit is None or not credit.person.name:
        return None
    mbid = (
        ExternalID.objects.filter(
            content_type=_media_ct(),
            provider="musicbrainz",
            object_id=media_item_id,
        )
        .values_list("external_id", flat=True)
        .first()
    )
    return {"artist": credit.person.name, "title": title, "mbid": mbid}


def apply_album_enrichment(media_item_id: int, info: dict[str, Any]) -> bool:
    """Write a Last.fm album payload onto the album; return True if anything changed.

    Overview fills only when the row has none; tags/genres and the two rating
    rows are add-only/upserted per provider. Recomputed the album's completeness
    score whenever a row/field changed.
    """
    media = MediaItem.objects.get(pk=media_item_id)
    changed = False

    overview = extract_wiki_summary(info)
    if overview and not media.overview:
        media.overview = overview
        media.save(update_fields=("overview", "updated_at"))
        changed = True

    existing = set(
        MediaGenre.objects.filter(media_item=media).values_list("genre_id", flat=True)
    )
    for tag in extract_tags(info)[:6]:
        if not tag:
            continue
        genre, _ = Genre.objects.get_or_create(name=tag, defaults={"slug": slugify(tag)})
        if genre.pk in existing:
            continue
        existing.add(genre.pk)
        MediaGenre.objects.create(media_item=media, genre=genre)
        changed = True

    for provider, score, max_score in _lastfm_rating_rows(info):
        row = ExternalRating.objects.filter(media_item=media, provider=provider).first()
        if row is None:
            ExternalRating.objects.create(
                media_item=media, provider=provider, score=float(score), max_score=max_score
            )
            changed = True
        elif row.score != float(score):
            row.score = float(score)
            row.save(update_fields=("score",))
            changed = True

    if changed:
        recompute_completeness(media)
    return changed


async def lastfm_enrich_album(
    media_item_id: int,
    *,
    provider: LastFMProvider | None = None,
) -> dict[str, Any]:
    """Fetch + attach an album's Last.fm info; a benign no-op when inapplicable.

    Media-first: an unset ``LASTFM_API_KEY`` or an album with no primary-artist
    context returns without a fetch; a Last.fm miss is also a benign no-op, never
    a hard failure — enrichment is best-effort. *provider* is injectable for
    tests and defaults to a real Last.fm client.
    """
    if not settings.LASTFM_API_KEY:
        return {
            "media_item_id": media_item_id,
            "enriched": False,
            "reason": "unconfigured",
        }
    context = await sync_to_async(_album_context)(media_item_id)
    if context is None:
        return {
            "media_item_id": media_item_id,
            "enriched": False,
            "reason": "no context",
        }
    if provider is None:
        from core.providers.lastfm import LastFMProvider  # local: avoid eager build

        provider = LastFMProvider()
    info = await provider.album_get_info(
        artist=context["artist"], album=context["title"], mbid=context["mbid"]
    )
    if info is None:
        return {
            "media_item_id": media_item_id,
            "enriched": False,
            "reason": "no result",
        }
    changed = await sync_to_async(apply_album_enrichment)(media_item_id, info)
    return {
        "media_item_id": media_item_id,
        "artist": context["artist"],
        "album": context["title"],
        "enriched": bool(changed),
        "reason": None,
    }
