"""Routes for the search domain.

Mounted by ``config/urls.py`` at ``/api/v1/search/`` (see ARCHITECTURE §12 for
the prefix). No trailing slashes on routes (FastAPI parity; APPEND_SLASH is off
project-wide). The empty route resolves at ``/api/v1/search/`` — the parity tool
normalizes the trailing slash away when diffing against the frozen contract.
"""

from django.urls import path

from apps.search.views import (
    CompaniesView,
    ExternalView,
    GroupedView,
    PollView,
    PrehydrateView,
    ProvidersView,
    SearchView,
    SteamGridView,
    SuggestionsView,
)

app_name = "search"

urlpatterns = [
    path("", SearchView.as_view(), name="search"),
    path("suggestions", SuggestionsView.as_view(), name="search-suggestions"),
    path("grouped", GroupedView.as_view(), name="search-grouped"),
    path("companies", CompaniesView.as_view(), name="search-companies"),
    path("poll", PollView.as_view(), name="search-poll"),
    path("external", ExternalView.as_view(), name="search-external"),
    path("providers", ProvidersView.as_view(), name="search-providers"),
    path("prehydrate", PrehydrateView.as_view(), name="search-prehydrate"),
    path("steamgrid", SteamGridView.as_view(), name="search-steamgrid"),
]
