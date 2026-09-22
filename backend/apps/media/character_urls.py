"""Character routes.

Mounted at ``/api/v1/character/`` by ``config/urls.py``.
"""

from django.urls import path

from apps.media.views.character import CharacterDetailView, CharacterListView

app_name = "character"

urlpatterns = [
    path("", CharacterListView.as_view(), name="character-list"),
    path("<str:character_id>", CharacterDetailView.as_view(), name="character-detail"),
]
