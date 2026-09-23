"""Schemas and data containers for Fandom provider."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FandomImage:
    """An image asset extracted from a Fandom wiki page."""

    url: str
    title: str
    width: int | None = None
    height: int | None = None
    is_primary: bool = False
    caption: str | None = None


@dataclass
class FandomActor:
    """A cast member / voice actor extracted from a character infobox."""

    name: str
    language: str = "English"
    role: str = "cast"


@dataclass
class FandomCharacter:
    """Character data and assets retrieved from a Fandom wiki."""

    name: str
    community: str
    page_title: str
    full_url: str
    primary_image_url: str | None = None
    images: list[FandomImage] = field(default_factory=list)
    description: str | None = None
    gender: str | None = None
    species: str | None = None
    aliases: list[str] = field(default_factory=list)
    actors: list[FandomActor] = field(default_factory=list)
