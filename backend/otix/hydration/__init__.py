"""Provider-agnostic full-hydration framework.

Each media type (movie/show/game/music) is backed by a data-source provider
(TMDB, IGDB, MusicBrainz). A hydrator adapter wraps that provider's primary
sync plus every enrichment step so ``hydrate_complete`` returns only once an
item is fully processed.
"""

from otix.hydration.protocol import FullHydration, RelatedCandidate
from otix.hydration.registry import get_hydrator

__all__ = ["FullHydration", "RelatedCandidate", "get_hydrator"]
