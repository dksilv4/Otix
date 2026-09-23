"""Transformers and normalizers for Wikidata game credits and person data."""

from __future__ import annotations

import re
import unicodedata
import urllib.parse

from core.providers.wikidata.schemas import CastCredit, CrewCredit


def normalize_character_name(name: str | None) -> str:
    """Normalize a character name for resilient matching.

    Folds unicode accents (e.g. 'Maëlle' -> 'maelle'), removes parenthetical
    qualifiers (e.g. 'Gustave (English)' -> 'gustave'), and cleans whitespace.
    """
    if not name:
        return ""
    # Strip parenthetical clarifications like "(voice)" or "(English)"
    cleaned = re.sub(r"\s*\(.*?\)", "", name).strip()
    # Normalize unicode accents to ASCII base characters
    nfkd = unicodedata.normalize("NFKD", cleaned)
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c))
    return ascii_str.lower().strip()


def wikimedia_image_url(filename: str | None, width: int = 500) -> str | None:
    """Convert a Wikimedia Commons file name to a direct CDN image URL."""
    if not filename:
        return None
    cleaned = filename.strip()
    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        return cleaned
    encoded = urllib.parse.quote(cleaned.replace(" ", "_"))
    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{encoded}?width={width}"


def transform_cast_credit(
    person_name: str,
    character_name: str,
    photo_filename: str | None = None,
    sort_order: int = 0,
) -> CastCredit | None:
    """Validate and build a CastCredit payload."""
    p_name = person_name.strip()
    c_name = character_name.strip()
    if not p_name or not c_name:
        return None
    return {
        "person_name": p_name,
        "character_name": c_name,
        "photo_url": wikimedia_image_url(photo_filename),
        "role": "cast",
        "sort_order": sort_order,
    }


def transform_crew_credit(
    person_name: str,
    role: str,
    photo_filename: str | None = None,
    sort_order: int = 0,
) -> CrewCredit | None:
    """Validate and build a CrewCredit payload."""
    p_name = person_name.strip()
    if not p_name or not role:
        return None
    return {
        "person_name": p_name,
        "role": role,
        "photo_url": wikimedia_image_url(photo_filename),
        "sort_order": sort_order,
    }
