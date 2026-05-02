"""OMDb JSON → domain models.

Stateless pure functions. Extracts external ratings (IMDb, Rotten Tomatoes,
Metacritic) from OMDb API responses.
"""

from __future__ import annotations

import re

from otix.domain.asset import ExternalRating
from otix.lib.types import JSONValue

# (omdb_source_name, provider_key, max_score)
_RATING_SOURCES: list[tuple[str, str, float]] = [
    ("Internet Movie Database", "imdb", 10.0),
    ("Rotten Tomatoes", "rotten_tomatoes", 100.0),
    ("Metacritic", "metacritic", 100.0),
]

_VOTE_RE = re.compile(r"[\d,]+")


def _parse_votes(raw: str) -> int | None:
    """Parse a comma-separated vote count like '2,304,528' → 2304528."""
    if not raw:
        return None
    match = _VOTE_RE.search(raw.replace(",", ""))
    if match:
        try:
            return int(match.group())
        except ValueError:
            return None
    return None


def _parse_score(raw: str) -> float | None:
    """Parse a rating value like '8.8', '8.8/10', '80%', '67/100' → float."""
    if not raw or not isinstance(raw, str):
        return None
    # "N/A" or similar non-numeric
    if raw == "N/A":
        return None
    # Percentage format: "80%"
    if raw.endswith("%"):
        try:
            return float(raw[:-1])
        except ValueError:
            return None
    # Fraction format: "8.8/10"
    parts = raw.split("/")
    if len(parts) == 2:
        try:
            return float(parts[0])
        except ValueError:
            return None
    # Bare number: "8.8"
    try:
        return float(raw)
    except ValueError:
        return None


def omdb_to_ratings(raw: dict[str, JSONValue], media_item_id: str) -> list[ExternalRating]:
    """Extract ExternalRating rows from an OMDb response.

    Returns a list of ExternalRating objects — one per recognized rating source
    (IMDb, Rotten Tomatoes, Metacritic). Sources with missing/unparseable
    values are skipped.
    """
    ratings: list[ExternalRating] = []

    # Extract from the Ratings array (structured)
    ratings_raw = raw.get("Ratings", [])
    if isinstance(ratings_raw, list):
        for entry in ratings_raw:
            if not isinstance(entry, dict):
                continue
            source = entry.get("Source", "")
            value = entry.get("Value", "")
            if not source or not value:
                continue

            for known_source, provider_key, max_score in _RATING_SOURCES:
                if source == known_source:
                    score = _parse_score(value)
                    if score is not None:
                        ratings.append(
                            ExternalRating(
                                media_item_id=media_item_id,
                                provider=provider_key,
                                score=score,
                                max_score=max_score,
                            )
                        )
                    break

    # IMDb votes (separate field, not in Ratings array)
    imdb_rating = next((r for r in ratings if r.provider == "imdb"), None)
    if imdb_rating is not None:
        votes_raw = raw.get("imdbVotes", "")
        if isinstance(votes_raw, str):
            imdb_rating.vote_count = _parse_votes(votes_raw)
    else:
        # Fallback: extract from top-level imdbRating/imdbVotes when
        # the Ratings array doesn't include an "Internet Movie Database" entry.
        score = _parse_score(raw.get("imdbRating", ""))
        if score is not None:
            votes_raw = raw.get("imdbVotes", "")
            vote_count = _parse_votes(votes_raw) if isinstance(votes_raw, str) else None
            ratings.append(
                ExternalRating(
                    media_item_id=media_item_id,
                    provider="imdb",
                    score=score,
                    max_score=10.0,
                    vote_count=vote_count,
                )
            )

    return ratings
