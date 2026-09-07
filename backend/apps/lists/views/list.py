"""List API views: public/allowed-list reads and owner/collaborator mutations.

Thin ``APIView``/``ListAPIView`` subclasses delegating to
``apps.lists.services`` and serializers. Reads that are public in the legacy
router (public-list discovery, list detail with optional user, export, history)
opt out of the global ``IsAuthenticated`` default; write mutations rely on it.

Status codes mirror the legacy FastAPI routers: create/add/invite return 201,
most writes return 204, list detail/read return 200, and 404s use the legacy
``detail`` strings ("List not found", "Item not found", "Invitation not found").
"""

import csv
import io
import json

from django.http import HttpResponse
from rest_framework import generics, permissions, status
from rest_framework.exceptions import NotFound
from rest_framework.renderers import JSONRenderer
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.lists import services
from apps.lists.serializers import (
    CollaboratorInviteSerializer,
    CollaboratorOutSerializer,
    ListItemAddSerializer,
    ListItemReorderSerializer,
    ListLikeStatusSerializer,
    RankHistoryOutSerializer,
    UserListCreateSerializer,
    UserListDetailSerializer,
    UserListOutSerializer,
    UserListUpdateSerializer,
)

LIST_NOT_FOUND = "List not found"
ITEM_NOT_FOUND = "Item not found"
INVITATION_NOT_FOUND = "Invitation not found"

_EXPORT_FIELDNAMES = ["rank", "title", "media_type", "release_date", "avg_rating"]


class PublicReadAuthedWrite(permissions.BasePermission):
    """Anonymous GETs allowed; any other method requires authentication."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        if request.method == "GET":
            return True
        return bool(request.user and request.user.is_authenticated)


class ListRootView(generics.ListAPIView):
    """``GET /list`` public-list discovery + ``POST /list`` create.

    GET lists public lists newest-first (DRF page envelope; legacy returned a
    bare JSON array); POST creates a list owned by the caller (201).
    """

    serializer_class = UserListOutSerializer
    permission_classes = (PublicReadAuthedWrite,)

    def get_queryset(self):
        return services.list_public_lists()

    def post(self, request: Request) -> Response:
        body = UserListCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        lst = services.create_list(
            request.user.id,
            name=body.validated_data["name"],
            description=body.validated_data.get("description"),
            is_public=body.validated_data.get("is_public", False),
        )
        return Response(
            UserListOutSerializer(lst).data, status=status.HTTP_201_CREATED
        )


class ListMineView(generics.ListAPIView):
    """``GET /list/mine`` — lists owned by or shared with the caller."""

    serializer_class = UserListOutSerializer

    def get_queryset(self):
        return services.list_user_lists(self.request.user.id)


class ListDetailView(APIView):
    """``GET/PATCH/DELETE /list/{list_id}`` — detail, update, delete.

    GET is public with optional user state; private lists 404 unless the viewer
    owns or collaborates on them. PATCH/DELETE require the owning user and 404
    the legacy ``"List not found"`` detail otherwise.
    """

    permission_classes = (PublicReadAuthedWrite,)

    def get(self, request: Request, list_id: int) -> Response:
        user_id = request.user.id if request.user.is_authenticated else None
        lst = services.get_list_detail(list_id, user_id)
        if lst is None:
            raise NotFound(LIST_NOT_FOUND)
        return Response(UserListDetailSerializer(lst).data)

    def patch(self, request: Request, list_id: int) -> Response:
        body = UserListUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        lst = services.update_list(list_id, request.user.id, **body.validated_data)
        if lst is None:
            raise NotFound(LIST_NOT_FOUND)
        return Response(UserListOutSerializer(lst).data)

    def delete(self, request: Request, list_id: int) -> Response:
        if not services.delete_list(list_id, request.user.id):
            raise NotFound(LIST_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ListItemView(APIView):
    """``POST /list/{list_id}/item`` add + ``PUT /list/{list_id}/item`` reorder.

    Both are owner-only writes: add returns 201 with the updated ``UserListOut``,
    reorder returns 204. Unknown/non-owned lists 404 ``"List not found"``.
    """

    def post(self, request: Request, list_id: int) -> Response:
        body = ListItemAddSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        lst = services.add_item(
            list_id, request.user.id, body.validated_data["media_item_id"]
        )
        if lst is None:
            raise NotFound(LIST_NOT_FOUND)
        return Response(
            UserListOutSerializer(lst).data, status=status.HTTP_201_CREATED
        )

    def put(self, request: Request, list_id: int) -> Response:
        body = ListItemReorderSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        ok = services.reorder_items(
            list_id, request.user.id, body.validated_data["media_item_ids"]
        )
        if not ok:
            raise NotFound(LIST_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ListItemRemoveView(APIView):
    """``DELETE /list/{list_id}/item/{media_item_id}`` — owner-only remove."""

    def delete(self, request: Request, list_id: int, media_item_id: int) -> Response:
        removed = services.remove_item(list_id, request.user.id, media_item_id)
        if not removed:
            raise NotFound(ITEM_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ListCollaboratorsView(APIView):
    """``GET/POST /list/{list_id}/collaborators`` — list/invite collaborators.

    GET mirrors the legacy router (no access gate, empty list when the list is
    missing). POST invites a user (owner/EDIT-ADMIN only) and returns 201 with
    the new collaborator row.
    """

    def get(self, request: Request, list_id: int) -> Response:
        collaborators = services.get_collaborators(list_id)
        return Response(CollaboratorOutSerializer(collaborators, many=True).data)

    def post(self, request: Request, list_id: int) -> Response:
        body = CollaboratorInviteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        collab = services.add_collaborator(
            list_id,
            request.user.id,
            body.validated_data["user_id"],
            body.validated_data["permission"],
        )
        if collab is None:
            raise NotFound(LIST_NOT_FOUND)
        return Response(
            CollaboratorOutSerializer(collab, context={"include_user": False}).data,
            status=status.HTTP_201_CREATED,
        )


class ListCollaboratorRemoveView(APIView):
    """``DELETE /list/{list_id}/collaborators/{user_id}`` — remove a collaborator."""

    def delete(self, request: Request, list_id: int, user_id: int) -> Response:
        removed = services.remove_collaborator(list_id, request.user.id, user_id)
        if not removed:
            raise NotFound()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ListCollaboratorAcceptView(APIView):
    """``POST /list/{list_id}/collaborators/accept`` — accept a pending invite."""

    def post(self, request: Request, list_id: int) -> Response:
        if not services.accept_collaboration(list_id, request.user.id):
            raise NotFound(INVITATION_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ListCollaboratorDeclineView(APIView):
    """``POST /list/{list_id}/collaborators/decline`` — decline a pending invite."""

    def post(self, request: Request, list_id: int) -> Response:
        if not services.decline_collaboration(list_id, request.user.id):
            raise NotFound(INVITATION_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ListLikeView(APIView):
    """``POST/DELETE /list/{list_id}/like`` — idempotent like/unlike."""

    def post(self, request: Request, list_id: int) -> Response:
        return self._toggle(request, list_id, like=True)

    def delete(self, request: Request, list_id: int) -> Response:
        return self._toggle(request, list_id, like=False)

    def _toggle(self, request: Request, list_id: int, *, like: bool) -> Response:
        if services.get_list(list_id) is None:
            raise NotFound(LIST_NOT_FOUND)
        if like:
            services.like_list(list_id, request.user.id)
        else:
            services.unlike_list(list_id, request.user.id)
        count, is_liked = services.get_like_status(list_id, request.user.id)
        return Response(ListLikeStatusSerializer({"like_count": count, "is_liked": is_liked}).data)


class ListExportView(APIView):
    """``GET /list/{list_id}/export?format=json|csv`` — public-list export.

    Mirrors the legacy router: only public lists export (404 ``"List not found"``
    for missing/private lists) and any non-``csv`` format returns JSON.
    """

    permission_classes = (permissions.AllowAny,)

    def perform_content_negotiation(self, request: Request, force: bool = False) -> tuple:
        # Only JSONRenderer is installed project-wide; ``?format=csv`` must not
        # trigger a 406 during DRF's content negotiation.
        renderer = JSONRenderer()
        return renderer, renderer.media_type

    def get(self, request: Request, list_id: int) -> HttpResponse:
        export = services.get_list_export(list_id)
        if export is None:
            raise NotFound(LIST_NOT_FOUND)
        name, items = export
        if request.query_params.get("format") == "csv":
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=_EXPORT_FIELDNAMES)
            writer.writeheader()
            writer.writerows(items)
            return HttpResponse(output.getvalue(), content_type="text/csv")
        payload = json.dumps({"list_name": name, "items": items}, indent=2)
        return HttpResponse(payload, content_type="application/json")


class ListHistoryView(APIView):
    """``GET /list/{list_id}/history`` — most-recent rank changes (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, list_id: int) -> Response:
        entries = services.get_rank_history(list_id)
        return Response(RankHistoryOutSerializer(entries, many=True).data)
