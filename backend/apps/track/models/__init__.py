"""Track domain models: saved-game upload/matching paths."""

from apps.track.models.save_path import GameSaveOfficialPath, GameSavePathSuggestion

__all__ = [
    "GameSaveOfficialPath",
    "GameSavePathSuggestion",
]
