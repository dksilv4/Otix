# TODO: Review this file
"""Franchise/collection name normalization for cross-provider matching."""

from __future__ import annotations

import re

_SUFFIXES = (
    " collection",
    " franchise",
    " film series",
    " series",
    " saga",
    " trilogy",
)


def normalize_franchise_name(name: str) -> str:
    """Normalize a franchise/collection name for cross-provider matching.

    Strips common suffixes, lowers, removes punctuation, collapses whitespace.
    ``"The Witcher Collection"`` and ``"The Witcher Franchise"`` both become
    ``"the witcher"``.
    """
    normalized = name.lower().strip()
    for suffix in _SUFFIXES:
        if normalized.endswith(suffix):
            normalized = normalized[: -len(suffix)]
            break
    normalized = re.sub(r"[^\w\s]", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized
