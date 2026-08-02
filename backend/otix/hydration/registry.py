"""Media-type → hydrator adapter registry."""

from __future__ import annotations

from otix.hydration.igdb import IgdbHydration
from otix.hydration.musicbrainz import MusicbrainzHydration
from otix.hydration.protocol import FullHydration
from otix.hydration.tmdb import TmdbHydration

_HYDRATORS: dict[str, type[FullHydration]] = {
    "movie": TmdbHydration,
    "show": TmdbHydration,
    "game": IgdbHydration,
    "music": MusicbrainzHydration,
}


def get_hydrator(media_type: str) -> FullHydration:
    cls = _HYDRATORS.get(media_type)
    if cls is None:
        raise ValueError(f"No hydration implementation for media_type={media_type!r}")
    return cls()
