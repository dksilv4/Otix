"""Schemas and typed data structures for Wikidata game credits and cast."""

from __future__ import annotations

from typing import TypedDict


class CastCredit(TypedDict):
    person_name: str
    character_name: str
    photo_url: str | None
    role: str  # "cast"
    sort_order: int


class CrewCredit(TypedDict):
    person_name: str
    role: str  # "director", "writer", "composer"
    photo_url: str | None
    sort_order: int


class CharacterClaim(TypedDict, total=False):
    character_name: str
    wikidata_id: str
    image_url: str | None
    fandom_id: str | None
    wikipedia_title: str | None
    btva_id: str | None


class GameCreditsPayload(TypedDict):
    entity_id: str | None
    fandom_id: str | None
    cast: list[CastCredit]
    crew: list[CrewCredit]
    characters: list[CharacterClaim]
