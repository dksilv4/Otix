"""Genre simplification and normalization service.

Standardizes genre taxonomy across providers (TMDB, IGDB, Steam, etc.):
1. Separates composite genres with '&', '/', or 'and' into distinct genres
   (e.g., 'Action & Adventure' -> 'Action', 'Adventure';
          'Sci-Fi & Fantasy' -> 'Science Fiction', 'Fantasy';
          'War & Politics' -> 'War', 'Politics').
   Preserves acronyms like 'R&B'.
2. Simplifies aliases:
   'Sci-Fi' -> 'Science Fiction' (sci-fi == science fiction).
3. Provides backfill logic to migrate existing database records.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterable

from django.db import transaction
from django.utils.text import slugify

logger = logging.getLogger(__name__)

# Canonical alias mapping (lower-case key -> canonical display name)
GENRE_ALIASES: dict[str, str] = {
    "sci-fi": "Science Fiction",
    "sci fi": "Science Fiction",
    "science-fiction": "Science Fiction",
    "science fiction": "Science Fiction",
}

# Regex to detect acronyms like R&B or D&D that shouldn't be split
_ACRONYM_RE = re.compile(r"^[A-Za-z]&[A-Za-z]$")

# Regex to split on &, /, \, or + (composite genres like 'Action & Adventure')
_SPLIT_RE = re.compile(r"\s*(?:&|/|\\|\+)\s*")


def split_and_simplify_genre(name: str) -> list[str]:
    """Split composite genre names and normalize aliases (e.g. Sci-Fi -> Science Fiction)."""
    if not name or not name.strip():
        return []

    cleaned = name.strip()

    # Preserve single-letter ampersand acronyms like R&B
    if _ACRONYM_RE.match(cleaned):
        canon = GENRE_ALIASES.get(cleaned.lower(), cleaned)
        return [canon]

    # Split composite strings
    parts = _SPLIT_RE.split(cleaned)
    results: list[str] = []
    seen: set[str] = set()

    for part in parts:
        p = part.strip()
        if not p:
            continue
        canon = GENRE_ALIASES.get(p.lower(), p)
        slug = slugify(canon)
        if slug and slug not in seen:
            seen.add(slug)
            results.append(canon)

    return results


def simplify_genre_names(names: Iterable[str]) -> list[str]:
    """Given an iterable of raw genre names, return deduplicated simplified genre names."""
    results: list[str] = []
    seen: set[str] = set()

    for name in names:
        for simplified in split_and_simplify_genre(name):
            slug = slugify(simplified)
            if slug and slug not in seen:
                seen.add(slug)
                results.append(simplified)

    return results


def backfill_genres() -> dict[str, int]:
    """Scan existing Genre records in the database, split & genres, and unify Sci-Fi -> Science Fiction.

    Migrates MediaGenre and MediaGenreType links to the canonical separated genres
    and removes the legacy composite/alias Genre records.
    """
    from apps.media.models.genre import Genre, MediaGenre, MediaGenreType

    stats = {
        "genres_processed": 0,
        "genres_migrated": 0,
        "genres_removed": 0,
        "links_created": 0,
    }

    with transaction.atomic():
        # Load all genres into memory to evaluate transformations
        all_genres = list(Genre.objects.all())
        stats["genres_processed"] = len(all_genres)

        for genre in all_genres:
            simplified = split_and_simplify_genre(genre.name)
            expected_slug = slugify(simplified[0]) if len(simplified) == 1 else None

            # Needs migration if it splits into multiple genres OR if its name/slug differs from canonical
            needs_migration = len(simplified) > 1 or (
                len(simplified) == 1
                and (simplified[0] != genre.name or expected_slug != genre.slug)
            )

            if not needs_migration:
                continue

            stats["genres_migrated"] += 1
            logger.info("Migrating genre %r (pk=%d) -> %r", genre.name, genre.pk, simplified)

            # Ensure canonical target genres exist
            target_genres = []
            for target_name in simplified:
                target_slug = slugify(target_name)
                target_g, _ = Genre.objects.get_or_create(
                    name=target_name,
                    defaults={"slug": target_slug},
                )
                target_genres.append(target_g)

            # Copy media types
            media_types = list(
                MediaGenreType.objects.filter(genre=genre).values_list("media_type", flat=True)
            )
            for tg in target_genres:
                for mt in media_types:
                    MediaGenreType.objects.get_or_create(genre=tg, media_type=mt)

            # Copy media item links
            media_item_ids = list(
                MediaGenre.objects.filter(genre=genre).values_list("media_item_id", flat=True)
            )
            for tg in target_genres:
                for item_id in media_item_ids:
                    _, created = MediaGenre.objects.get_or_create(media_item_id=item_id, genre=tg)
                    if created:
                        stats["links_created"] += 1

            # Delete old genre and its obsolete relations
            MediaGenre.objects.filter(genre=genre).delete()
            MediaGenreType.objects.filter(genre=genre).delete()
            genre.delete()
            stats["genres_removed"] += 1

    return stats
