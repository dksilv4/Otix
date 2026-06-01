"""NZBPlanet transformer — formats NZBResult data for service consumption.

The transformer is kept simple since NZBPlanet responses don't require
complex domain mapping. It provides helpers for filtering/sorting results
that the DownloadService uses when auto-picking the best match.
"""

from __future__ import annotations

from otix.providers.nzbplanet.client import NZBResult


class NZBPlanetTransformer:
    """Stateless transformer for NZBPlanet search results."""

    # Patterns that suggest a release is a full game ISO, not a demo/update/patch
    _DEMO_PATTERNS = ["demo", "trial", "beta", "alpha"]
    _UPDATE_PATTERNS = ["update", "patch", "dlc", "addon", "add-on", "hotfix"]
    _SCENE_TAGS = [
        "iso",
        "repack",
        "codex",
        "crack",
        "gog",
        "elamigos",
        "dodi",
        "fitgirl",
        "skidrow",
        "flt",
    ]

    def is_full_game(self, result: NZBResult) -> bool:
        """Check if an NZB result looks like a full game, not a demo/update."""
        title_lower = result.title.lower()
        for pattern in self._DEMO_PATTERNS:
            if pattern in title_lower:
                return False
        return True

    def is_not_update(self, result: NZBResult) -> bool:
        """Check if an NZB result is not an update/patch/DLC."""
        title_lower = result.title.lower()
        for pattern in self._UPDATE_PATTERNS:
            if pattern in title_lower:
                return False
        return True

    def has_scene_tags(self, result: NZBResult) -> bool:
        """Check if the release has known scene/crack tags."""
        title_lower = result.title.lower()
        return any(tag in title_lower for tag in self._SCENE_TAGS)

    def filter_quality(self, results: list[NZBResult]) -> list[NZBResult]:
        """Filter out demos, updates, and patches, keeping full releases."""
        return [r for r in results if self.is_full_game(r) and self.is_not_update(r)]

    def rank_results(self, results: list[NZBResult]) -> list[NZBResult]:
        """Rank results: scene releases first, then by size descending.

        Already sorted by size descending from the provider. This just
        boosts results with scene tags to the top.
        """
        scene = [r for r in results if self.has_scene_tags(r)]
        non_scene = [r for r in results if not self.has_scene_tags(r)]
        return scene + non_scene
