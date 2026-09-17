"""Match raw free-game references from the desktop aggregator to the catalog.

Ports ``old-backend/otix/api/discover/free_games/router.py``. Per-ref resolution
order: exact ``ExternalID`` lookup (store + external id), Epic bare-offerId
fallback (earlier seeds store the bare id, the aggregator sends
``namespace:offerId``), then IGDB hydration for unmatched Epic refs that carry
a title. Hydration is exact-match-only (never fuzzy) and seeds a ``Game`` row
with the IGDB cover poster — SteamGrid artwork stays deferred. Unmatched
non-Epic / title-less refs simply return ``matched=False``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from django.contrib.contenttypes.models import ContentType

from apps.media.models import ExternalID, MediaItem
from apps.media.services.game_matcher import GameMatcher

logger = logging.getLogger(__name__)


@dataclass
class FreeGameMatch:
    media_item: MediaItem | None
    matched: bool
    store: str
    store_label: str | None
    original_price: str | None
    free_end_date: str | None
    claim_url: str | None
    poster_url: str | None
    title: str | None
    external_id: str


def _media_content_type() -> ContentType:
    return ContentType.objects.get_for_model(MediaItem)


def _find_media(provider: str, external_id: str) -> MediaItem | None:
    """Look up a MediaItem by an ExternalID mapping (store + external id)."""
    row = (
        ExternalID.objects.filter(
            content_type=_media_content_type(),
            provider=provider,
            external_id=external_id,
        )
        .only("object_id")
        .order_by("-updated_at")
        .first()
    )
    if row is None or not row.object_id:
        return None
    return MediaItem.objects.filter(pk=row.object_id).first()


def _match_one(matcher: GameMatcher, ref: dict) -> FreeGameMatch:
    store = ref.get("store") or ""
    external_id = ref.get("external_id") or ""
    media = _find_media(store, external_id)

    # The aggregator sends "namespace:offerId" for Epic; earlier seeds store the
    # bare offerId.
    if media is None and store == "epic" and ":" in external_id:
        offer_id = external_id.split(":", 1)[1]
        media = _find_media("epic", offer_id)

    # Unmatched Epic free game with a title → hydrate into the catalog from
    # IGDB so it lands in the user's library with artwork.
    if media is None and store == "epic" and ref.get("title"):
        try:
            media_id = matcher.hydrate_free_game(
                title=ref["title"],
                store=store,
                external_id=external_id,
            )
            if media_id:
                media = MediaItem.objects.filter(pk=media_id).first()
        except Exception:
            logger.exception("free game hydration failed title=%s", ref["title"])

    return FreeGameMatch(
        media_item=media,
        matched=media is not None,
        store=store,
        store_label=ref.get("store_label"),
        original_price=ref.get("original_price"),
        free_end_date=ref.get("free_end_date"),
        claim_url=ref.get("claim_url"),
        poster_url=ref.get("poster_url"),
        title=ref.get("title"),
        external_id=external_id,
    )


def match_free_games(games: list[dict]) -> list[FreeGameMatch]:
    """Match a batch of free-game refs, sharing one matcher instance.

    Processed serially — hydration seeds rows, so concurrent writes within a
    request would risk duplicates.
    """
    matcher = GameMatcher()
    return [_match_one(matcher, ref) for ref in games]
