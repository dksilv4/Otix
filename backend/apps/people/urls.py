"""Person routes.

Mounted at ``/api/v1/person/`` by ``config/urls.py``. No trailing slashes on
routes (FastAPI parity; ``APPEND_SLASH`` is off project-wide). ``person_id`` is
an integer path converter matching the greenfield integer PKs.
"""

from django.urls import path

from apps.people.views import (
    PersonDetailView,
    PersonFollowView,
    PersonListView,
    PersonRatingView,
    PersonSearchView,
)

app_name = "people"

urlpatterns = [
    # Literal route first so ``search`` is never shadowed by ``<int:person_id>``.
    path("search", PersonSearchView.as_view(), name="person-search"),
    path("", PersonListView.as_view(), name="person-list"),
    path("<int:person_id>", PersonDetailView.as_view(), name="person-detail"),
    path("<int:person_id>/follow", PersonFollowView.as_view(), name="person-follow"),
    path("<int:person_id>/rating", PersonRatingView.as_view(), name="person-rating"),
]
