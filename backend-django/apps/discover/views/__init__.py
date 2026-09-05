"""Discover API views, re-exported for convenient imports."""

from apps.discover.views.hero import DiscoverHeroView
from apps.discover.views.list_type import DiscoverListView

__all__ = [
    "DiscoverHeroView",
    "DiscoverListView",
]
