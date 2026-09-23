"""Wikidata provider package for game credits and characters."""

from core.providers.wikidata.client import WikidataProvider
from core.providers.wikidata.schemas import CastCredit, CrewCredit, GameCreditsPayload
from core.providers.wikidata.transformers import (
    normalize_character_name,
    transform_cast_credit,
    transform_crew_credit,
)

__all__ = [
    "WikidataProvider",
    "CastCredit",
    "CrewCredit",
    "GameCreditsPayload",
    "normalize_character_name",
    "transform_cast_credit",
    "transform_crew_credit",
]
