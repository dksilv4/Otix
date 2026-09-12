# TODO: Review this file
"""Helpers for normalizing genre names from external providers."""

from __future__ import annotations

import re
from collections.abc import Iterable

from otix.lib.slug import slugify

_GENRE_SEPARATOR_RE = re.compile(r"\s*(?:\s[&+]\s|[/\\|,])\s*")
_WHITESPACE_RE = re.compile(r"\s+")


def split_genre_name(name: str) -> list[str]:
    """Split composite external genre labels into individual genre names."""
    parts: list[str] = []
    seen_slugs: set[str] = set()

    for raw_part in _GENRE_SEPARATOR_RE.split(name):
        part = _WHITESPACE_RE.sub(" ", raw_part).strip()
        slug = slugify(part)
        if not part or not slug or slug in seen_slugs:
            continue
        parts.append(part)
        seen_slugs.add(slug)

    return parts


def normalize_genre_names(names: Iterable[str]) -> dict[str, str]:
    """Return slug -> display name for external genre names after splitting."""
    normalized: dict[str, str] = {}

    for name in names:
        for part in split_genre_name(name):
            slug = slugify(part)
            if slug not in normalized:
                normalized[slug] = part

    return normalized
