"""IGDB game ingest — seed catalog game rows from IGDB detail JSON.

The first consumer of the ported async IGDB client (``core.providers.igdb``,
increment 37). Mirrors the sync posture ``GameMatcher._seed_game_from_igdb``
established in increment 26: an IGDB game lookup maps onto the Django MTI graph
(``MediaItem`` hub with ``media_type="game"`` + ``Game`` subtype) plus a
``provider="igdb"`` ``ExternalID`` row and the cover as the top poster
``MediaAsset``. Seeding is intentionally *minimal* like every catalog-seed
engine — ``completeness_score`` starts 0.15 and ``next_sync_at`` is stamped so
the later full-hydration pass (platforms/involved companies/screenshots/videos,
SteamGrid artwork) completes the row.

Resolution is by the igdb ``ExternalID`` first; a same-slug ``game`` catalog
title is the cross-provider fallback (Steam/other seeds write an igdb id too, so
a title seeded via a different provider is refreshed rather than duplicated) —
the same semantics the GameMatcher seeder uses, so both idempotently agree. The
async fetch driver returns a bare media id; raised provider errors (or an id
IGDB has no game for) bubble to the caller (a sync engine), which turns them
into an ``error`` terminal frame.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from django.utils.text import slugify

from apps.media.models import ExternalID, Game, MediaAsset, MediaItem
from apps.media.services.igdb import cover_url

if TYPE_CHECKING:
    from core.providers.igdb import IGDBProvider

# Field set the seed consumes. Platform/company/screenshot/video enrichment and
# SteamGrid artwork stay the deferred full-hydration pass.
GAME_SEED_FIELDS = "id,name,slug,cover.image_id,first_release_date,storyline,summary"

_MEDIA_CT: ContentType | None = None


def _media_ct() -> ContentType:
    global _MEDIA_CT
    if _MEDIA_CT is None:
        _MEDIA_CT = ContentType.objects.get_for_model(MediaItem)
    return _MEDIA_CT


def _ts_to_date(ts: Any) -> date | None:
    """IGDB ``first_release_date`` (unix seconds) -> a naive date."""
    if not ts:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=UTC).date()
    except (TypeError, ValueError, OverflowError):
        return None


def _game_slug(raw: dict[str, Any], title: str) -> str:
    """IGDB slug when present, else a sanitized slugify of the title."""
    raw_slug = (raw.get("slug") or "").strip()
    base = raw_slug if raw_slug else slugify(title)
    return re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")[:200] or slugify("game")


def _upsert_external(object_id: int, igdb_id: str) -> None:
    """Create-or-update the media's igdb ``ExternalID`` row."""
    row, created = ExternalID.objects.get_or_create(
        content_type=_media_ct(),
        provider="igdb",
        external_id=igdb_id,
        media_type="game",
        defaults={"object_id": object_id},
    )
    if not created and row.object_id != object_id:
        row.object_id = object_id
        row.save(update_fields=("object_id", "updated_at"))


def _upsert_poster_asset(media: MediaItem, url: str) -> None:
    """Store the IGDB cover as the best-scoring poster asset for ``media``."""
    MediaAsset.objects.get_or_create(
        media_item=media,
        asset_type="poster",
        url=url,
        defaults={"label": "official", "provider": "igdb", "score": 100},
    )


def seed_game_from_igdb(raw: dict[str, Any], igdb_id: int) -> int:
    """Map an IGDB game lookup onto a minimal MediaItem + Game; return its pk.

    Idempotent: an existing igdb ``ExternalID`` resolves to its media row and
    returns early; otherwise a same-slug ``game`` title is reused (refreshing a
    missing overview + poster, mirroring the GameMatcher cross-provider dedup);
    otherwise a fresh hub + subtype row is created. All growth fields start at
    the minimal-seed posture so the later hydration pass fills them in.
    """
    igdb_id_str = str(igdb_id)
    existing = ExternalID.objects.filter(
        content_type=_media_ct(),
        provider="igdb",
        external_id=igdb_id_str,
        media_type="game",
    ).first()
    if existing is not None and existing.object_id:
        return existing.object_id

    title = (raw.get("name") or "Unknown Game").strip() or "Unknown Game"
    overview = raw.get("storyline") or raw.get("summary")
    poster_url = cover_url(raw.get("cover"))
    slug = _game_slug(raw, title)
    release_date = _ts_to_date(raw.get("first_release_date"))

    media = MediaItem.objects.filter(media_type="game", slug=slug).first()
    if media is None:
        media = MediaItem.objects.create(
            media_type="game",
            title=title,
            slug=slug,
            overview=overview,
            release_date=release_date,
            completeness_score=0.15,
            next_sync_at=timezone.now(),
        )
    elif media.overview is None and overview:
        media.overview = overview
        media.save(update_fields=("overview", "updated_at"))
    media_id = media.pk
    Game.objects.get_or_create(media_item_id=media_id)
    if poster_url:
        _upsert_poster_asset(media, poster_url)
    _upsert_external(media_id, igdb_id_str)
    return media_id


async def fetch_and_seed_game(
    igdb_id: int, *, provider: IGDBProvider | None = None
) -> int:
    """Fetch an IGDB game through the async client, then seed it."""
    if provider is None:
        from core.providers.igdb import IGDBProvider  # local: avoid eager client build

        provider = IGDBProvider()
    raw = await provider.get_game(igdb_id, GAME_SEED_FIELDS)
    if not raw:
        raise ValueError(f"IGDB returned no game for id {igdb_id}")
    return await sync_to_async(seed_game_from_igdb)(raw, igdb_id)
