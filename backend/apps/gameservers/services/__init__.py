"""Game server services package."""

from apps.gameservers.services.query import (
    query_a2s,
    query_game_server,
    query_generic,
    query_minecraft,
)

__all__ = [
    "query_a2s",
    "query_game_server",
    "query_generic",
    "query_minecraft",
]
