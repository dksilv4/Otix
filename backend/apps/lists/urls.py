"""Routes for the lists domain.

Mounted by config/urls.py (see ARCHITECTURE §12 for the prefix). No
trailing slashes on routes (FastAPI parity; APPEND_SLASH off project-wide).
"""

from django.urls import path

from apps.lists.views import (
    ListCollaboratorAcceptView,
    ListCollaboratorDeclineView,
    ListCollaboratorRemoveView,
    ListCollaboratorsView,
    ListDetailView,
    ListExportView,
    ListForMediaView,
    ListHistoryView,
    ListItemRemoveView,
    ListItemView,
    ListLikeView,
    ListMineView,
    ListRootView,
)

app_name = "lists"

urlpatterns = [
    path("", ListRootView.as_view(), name="list-root"),
    path("mine", ListMineView.as_view(), name="list-mine"),
    path("for-media/<int:media_item_id>", ListForMediaView.as_view(), name="list-for-media"),
    path("<int:list_id>", ListDetailView.as_view(), name="list-detail"),
    path("<int:list_id>/item", ListItemView.as_view(), name="list-item"),
    path(
        "<int:list_id>/item/<int:media_item_id>",
        ListItemRemoveView.as_view(),
        name="list-item-remove",
    ),
    path(
        "<int:list_id>/collaborators",
        ListCollaboratorsView.as_view(),
        name="list-collaborators",
    ),
    # Literal accept/decline routes precede the ``<int:user_id>`` route.
    path(
        "<int:list_id>/collaborators/accept",
        ListCollaboratorAcceptView.as_view(),
        name="list-collaborator-accept",
    ),
    path(
        "<int:list_id>/collaborators/decline",
        ListCollaboratorDeclineView.as_view(),
        name="list-collaborator-decline",
    ),
    path(
        "<int:list_id>/collaborators/<int:user_id>",
        ListCollaboratorRemoveView.as_view(),
        name="list-collaborator-remove",
    ),
    path("<int:list_id>/like", ListLikeView.as_view(), name="list-like"),
    path("<int:list_id>/export", ListExportView.as_view(), name="list-export"),
    path("<int:list_id>/history", ListHistoryView.as_view(), name="list-history"),
]
