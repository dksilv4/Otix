"""Routes for the discover domain.

Mounted at ``/api/v1/discover/`` by ``config/urls.py``. No trailing slashes on
routes (FastAPI parity; ``APPEND_SLASH`` is off project-wide). The literal
``hero`` route precedes the ``{media_type}/{list_type}`` pair; both are public
(``AllowAny``, optional user), matching legacy ``/discover``.
"""

from django.urls import path

from apps.discover.views import DiscoverHeroView, DiscoverListView

app_name = "discover"

urlpatterns = [
    path("hero", DiscoverHeroView.as_view(), name="hero"),
    path(
        "<str:media_type>/<str:list_type>",
        DiscoverListView.as_view(),
        name="list-type",
    ),
]
