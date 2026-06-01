"""NZBPlanet hydrator — placeholder for consistency with provider pattern.

NZBPlanet search results don't require post-DB hydration since they're
stateless search results, not domain entities. The hydrator exists for
consistency with the project's provider pattern and future use
(e.g., hydrating NZB details into download records).
"""

from __future__ import annotations


class NZBPlanetHydrator:
    """No-op hydrator — kept for pattern consistency."""
