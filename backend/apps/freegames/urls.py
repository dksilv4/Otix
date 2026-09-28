"""URL routes for free games."""

from django.urls import path

from apps.freegames.views import FreeGamesListView

urlpatterns = [
    path("", FreeGamesListView.as_view(), name="free-games-list"),
]
