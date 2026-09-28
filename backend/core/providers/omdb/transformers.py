"""Pure transformer functions for OMDb API payloads.

Parses IMDb, Rotten Tomatoes, and Metacritic rating values into canonical
``NormalizedRating`` instances defined in ``core.providers.framework``.
"""

from __future__ import annotations

import re
from typing import Any

from core.providers.framework import NormalizedRating

_RATING_SOURCES: tuple[tuple[str, str, float, str], ...] = (
    ("Internet Movie Database", "imdb", 10.0, "audience"),
    ("Rotten Tomatoes", "rotten_tomatoes", 100.0, "critic"),
    ("Metacritic", "metacritic", 100.0, "critic"),
)

_VOTE_RE = re.compile(r"\d+")


def parse_votes(raw: Any) -> int | None:
    """Parse a comma-separated vote count like '2,304,528' into an integer."""
    if not raw or not isinstance(raw, str):
        return None
    if raw == "N/A":
        return None
    match = _VOTE_RE.search(raw.replace(",", ""))
    if match is None:
        return None
    try:
        return int(match.group())
    except ValueError:
        return None


def parse_score(raw: Any) -> float | None:
    """Parse '8.8/10', '79%', '67/100', or a bare '8.8' into a float score."""
    if not raw or not isinstance(raw, str):
        return None
    if raw == "N/A":
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


def transform_ratings(raw: dict[str, Any]) -> list[NormalizedRating]:
    """Parse OMDb payload into NormalizedRating instances.

    Maps:
      - "Internet Movie Database" -> provider="imdb", max_score=10.0, votes from imdbVotes
      - "Rotten Tomatoes" -> provider="rotten_tomatoes", max_score=100.0, type="critic"
      - "Metacritic" -> provider="metacritic", max_score=100.0, type="critic"

    Falls back to top-level ``imdbRating`` / ``imdbVotes`` if the ``Ratings`` array
    omits the IMDb entry.
    """
    known = {
        name: (provider, max_score, r_type) for name, provider, max_score, r_type in _RATING_SOURCES
    }
    ratings: list[NormalizedRating] = []

    for entry in raw.get("Ratings") or []:
        if not isinstance(entry, dict):
            continue
        source = entry.get("Source")
        meta = known.get(source)
        if meta is None:
            continue
        provider, max_score, r_type = meta
        score = parse_score(entry.get("Value"))
        if score is None:
            continue
        votes = parse_votes(raw.get("imdbVotes")) if provider == "imdb" else None
        ratings.append(
            NormalizedRating(
                provider=provider,
                score=score,
                max_score=max_score,
                votes=votes,
                type=r_type,
            )
        )

    # Top-level fallback if IMDb was omitted from Ratings array
    if not any(r.provider == "imdb" for r in ratings):
        score = parse_score(raw.get("imdbRating"))
        if score is not None:
            ratings.append(
                NormalizedRating(
                    provider="imdb",
                    score=score,
                    max_score=10.0,
                    votes=parse_votes(raw.get("imdbVotes")),
                    type="audience",
                )
            )

    return ratings


def rating_specs(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Map an OMDb payload to ExternalRating field dictionary specs."""
    normalized = transform_ratings(raw)
    return [
        {
            "provider": r.provider,
            "score": r.score,
            "max_score": r.max_score,
            "vote_count": r.votes,
        }
        for r in normalized
    ]
