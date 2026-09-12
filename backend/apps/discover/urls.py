"""Routes for the discover domain.

Mounted at ``/api/v1/discover/`` by ``config/urls.py``. No trailing slashes on
routes (FastAPI parity; ``APPEND_SLASH`` is off project-wide). Literal routes
(``hero``, ``sections``, ``free-games/match``) precede the
``{media_type}/{list_type}`` pair; all are public (``AllowAny``, optional user),
matching legacy ``/discover``.
"""

from django.urls import path

from apps.discover.views import (
    DiscoverHeroView,
    DiscoverListView,
    DiscoverSectionsView,
    FreeGamesMatchView,
)

app_name = "discover"

urlpatterns = [
    path("hero", DiscoverHeroView.as_view(), name="hero"),
    path("sections", DiscoverSectionsView.as_view(), name="sections"),
    path("free-games/match", FreeGamesMatchView.as_view(), name="free-games-match"),
    path(
        "<str:media_type>/<str:list_type>",
        DiscoverListView.as_view(),
        name="list-type",
    ),
]
