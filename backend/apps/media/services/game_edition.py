"""Game editions detection, resolution, and deduplication service."""

from __future__ import annotations

import logging
import re
from typing import Any

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.utils.text import slugify

from apps.media.models import ExternalID, Game, GameEdition, MediaItem
from apps.media.services.game_matcher import _strip_edition_markers

logger = logging.getLogger(__name__)

# Known standalone game exclusions (full remakes, standalone sequel/expansions)
STANDALONE_IGDB_CATEGORIES = {
    4,  # standalone_expansion
    8,  # remake
}

# Delimiter or explicit edition keyword required for pure title heuristics
EDITION_DELIMITER_OR_EXPLICIT = re.compile(
    r"(?:"
    r"[-–—:|(/\[]\s*(?:The\s+)?(?:Game\s+of\s+the\s+Year|GOTY|Complete|Enhanced|Deluxe|Definitive|Ultimate|Collector'?s|Anniversary|Special|Standard|Gold|Celebration|Day One|Digital\s+Deluxe|Premium|Royal|Final\s+Cut|Starter\s+Access|Re-Elected)"
    r"|\b(?:Game\s+of\s+the\s+Year|GOTY|Director'?s\s*Cut|Final\s+Cut|Starter\s+Access|Re-Elected)\b"
    r"|\b(?:Edition|Pack|Version|Collection)\b"
    r")",
    re.IGNORECASE,
)

# Recognized edition patterns with canonical edition labels
EDITION_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(?:Game\s+of\s+the\s+Year|GOTY)(?:\s+Edition)?\b", re.IGNORECASE), "Game of the Year Edition"),
    (re.compile(r"\b(?:Digital\s+)?Deluxe(?:\s+Edition)?\b", re.IGNORECASE), "Deluxe Edition"),
    (re.compile(r"\bUltimate(?:\s+Edition)?\b", re.IGNORECASE), "Ultimate Edition"),
    (re.compile(r"\bComplete(?:\s+Edition|\s+Collection)?\b", re.IGNORECASE), "Complete Edition"),
    (re.compile(r"\bDefinitive(?:\s+Edition)?\b", re.IGNORECASE), "Definitive Edition"),
    (re.compile(r"\bGold(?:\s+Edition)?\b", re.IGNORECASE), "Gold Edition"),
    (re.compile(r"\bCollector'?s(?:\s+Edition)?\b", re.IGNORECASE), "Collector's Edition"),
    (re.compile(r"\bSpecial(?:\s+Edition)?\b", re.IGNORECASE), "Special Edition"),
    (re.compile(r"\bAnniversary(?:\s+Edition)?\b", re.IGNORECASE), "Anniversary Edition"),
    (re.compile(r"\bEnhanced(?:\s+Edition)?\b", re.IGNORECASE), "Enhanced Edition"),
    (re.compile(r"\bDirector'?s\s*Cut(?:\s+Edition)?\b", re.IGNORECASE), "Director's Cut"),
    (re.compile(r"\bPremium(?:\s+Edition)?\b", re.IGNORECASE), "Premium Edition"),
    (re.compile(r"\bDay\s+One(?:\s+Edition)?\b", re.IGNORECASE), "Day One Edition"),
    (re.compile(r"\bRoyal(?:\s+Edition)?\b", re.IGNORECASE), "Royal Edition"),
    (re.compile(r"\bCelebration(?:\s+Edition)?\b", re.IGNORECASE), "Celebration Edition"),
    (re.compile(r"\bFinal\s+Cut\b", re.IGNORECASE), "Final Cut"),
    (re.compile(r"\bStarter\s+Access\b", re.IGNORECASE), "Starter Access"),
    (re.compile(r"\bRe-Elected\b", re.IGNORECASE), "Re-Elected"),
    (re.compile(r"\bStandard(?:\s+Edition)?\b", re.IGNORECASE), "Standard Edition"),
]


def extract_edition_name(title: str) -> str | None:
    """Extract canonical edition name from title if matching edition heuristics."""
    if not title:
        return None
    for pattern, canonical_name in EDITION_PATTERNS:
        if pattern.search(title):
            return canonical_name
    return None


def is_duplicate_edition(
    title: str,
    igdb_category: int | None = None,
    parent_name: str | None = None,
    version_parent_id: int | None = None,
) -> tuple[bool, str]:
    """Determine whether a game title / metadata indicates a duplicate edition variant.

    Returns:
        (is_edition, canonical_edition_name)
    """
    if igdb_category is not None and igdb_category in STANDALONE_IGDB_CATEGORIES:
        return False, ""

    # Explicit version parent pointer from IGDB
    if version_parent_id:
        detected = extract_edition_name(title)
        if detected:
            return True, detected
        if parent_name and parent_name.lower().strip() != title.lower().strip():
            # Derive edition subtitle from title difference
            diff = re.sub(re.escape(parent_name), "", title, flags=re.IGNORECASE).strip(" -:–—")
            if diff:
                return True, diff
        return True, "Special Edition"

    # Title heuristics check requires explicit edition marker or delimiter to avoid false positives
    if not EDITION_DELIMITER_OR_EXPLICIT.search(title):
        return False, ""

    detected = extract_edition_name(title)
    if detected:
        stripped = _strip_edition_markers(title)
        # Verify stripped base differs meaningfully from raw title
        if stripped and stripped.lower().strip() != title.lower().strip():
            return True, detected

    return False, ""


def find_canonical_base_game(
    title: str,
    igdb_id: int | str | None = None,
    version_parent_id: int | str | None = None,
) -> MediaItem | None:
    """Locate the canonical base MediaItem for a given edition candidate."""
    media_item_ct = ContentType.objects.get_for_model(MediaItem)

    # 1. Direct version parent lookup via IGDB ID
    if version_parent_id:
        parent_ext = (
            ExternalID.objects.filter(
                content_type=media_item_ct,
                provider="igdb",
                external_id=str(version_parent_id),
                media_type="game",
            )
            .select_related()
            .first()
        )
        if parent_ext and isinstance(parent_ext.content_object, MediaItem):
            return parent_ext.content_object

    # 2. Stripped title lookup
    stripped_title = _strip_edition_markers(title).strip()
    if not stripped_title or stripped_title.lower() == title.lower().strip():
        return None

    # Exact title match
    matches = list(MediaItem.objects.filter(media_type="game", title__iexact=stripped_title))
    if len(matches) == 1:
        return matches[0]
    elif len(matches) > 1:
        # Prefer the base game with highest popularity or oldest release
        matches.sort(key=lambda m: (-m.popularity, m.release_date or m.created_at))
        return matches[0]

    # Slug match
    target_slug = slugify(stripped_title)
    if target_slug:
        slug_matches = list(MediaItem.objects.filter(media_type="game", slug=target_slug))
        if len(slug_matches) == 1:
            return slug_matches[0]
        elif len(slug_matches) > 1:
            slug_matches.sort(key=lambda m: (-m.popularity, m.release_date or m.created_at))
            return slug_matches[0]

    return None


@transaction.atomic
def resolve_or_create_game_edition(
    parent_media_item: MediaItem,
    edition_data: dict[str, Any],
) -> GameEdition:
    """Create or update a GameEdition record attached to parent_media_item's Game subtype."""
    game, _ = Game.objects.get_or_create(media_item=parent_media_item)

    name = edition_data.get("name") or "Special Edition"
    raw_title = edition_data.get("raw_title") or parent_media_item.title
    igdb_id = str(edition_data.get("igdb_id")).strip() if edition_data.get("igdb_id") else None
    release_date = edition_data.get("release_date")
    new_external_ids = edition_data.get("external_ids") or {}
    cover_image_id = edition_data.get("cover_image_id")
    summary = edition_data.get("summary")
    is_default = bool(edition_data.get("is_default", False))

    edition: GameEdition | None = None
    if igdb_id:
        edition = GameEdition.objects.filter(game=game, igdb_id=igdb_id).first()
    if not edition:
        edition = GameEdition.objects.filter(game=game, name__iexact=name).first()

    if edition:
        # Merge external IDs
        merged_ids = dict(edition.external_ids or {})
        merged_ids.update(new_external_ids)
        edition.external_ids = merged_ids

        if not edition.raw_title:
            edition.raw_title = raw_title
        if not edition.release_date and release_date:
            edition.release_date = release_date
        if not edition.cover_image_id and cover_image_id:
            edition.cover_image_id = cover_image_id
        if not edition.summary and summary:
            edition.summary = summary
        edition.save()
        return edition

    return GameEdition.objects.create(
        game=game,
        name=name,
        raw_title=raw_title,
        igdb_id=igdb_id,
        release_date=release_date,
        external_ids=new_external_ids,
        cover_image_id=cover_image_id,
        summary=summary,
        is_default=is_default,
    )
