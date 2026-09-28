"""Base interfaces and data structures for free game providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class FreeGameItem:
    """Standardized representation of a promotional free game."""

    id: str
    store: str
    store_name: str
    title: str
    description: str | None = None
    original_price: str | None = None
    discount_percentage: int = 100
    is_free_now: bool = True
    start_date: str | None = None
    end_date: str | None = None
    claim_url: str | None = None
    poster_url: str | None = None
    backdrop_url: str | None = None
    logo_url: str | None = None
    external_id: str | None = None
    media_item: dict[str, Any] | None = None
    raw_data: dict[str, Any] = field(default_factory=dict)


class BaseFreeGamesProvider(ABC):
    """Abstract base class for all free games store providers."""

    @property
    @abstractmethod
    def store_id(self) -> str:
        """Unique identifier for the store (e.g. 'epic', 'steam')."""
        ...

    @property
    @abstractmethod
    def store_name(self) -> str:
        """Human-readable display name (e.g. 'Epic Games Store')."""
        ...

    @abstractmethod
    def fetch_free_games(self) -> list[FreeGameItem]:
        """Fetch current and upcoming promotional free games from this store."""
        ...
