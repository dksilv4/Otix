"""People API views, re-exported for convenient imports."""

from apps.people.views.person import (
    PersonDetailView,
    PersonFollowView,
    PersonListView,
    PersonRatingView,
    PersonSearchView,
)

__all__ = [
    "PersonDetailView",
    "PersonFollowView",
    "PersonListView",
    "PersonRatingView",
    "PersonSearchView",
]
