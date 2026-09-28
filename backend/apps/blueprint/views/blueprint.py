"""Blueprint API views: list+create, detail/update/delete, like, download.

Authed routes rely on the global ``IsAuthenticated`` default; the public list and
detail routes opt out with ``AllowAny`` and treat ``request.user`` as anonymous
when no valid token is present (legacy ``get_optional_user``), which feeds the
``has_liked`` state key. Thin views: all domain logic lives in
``apps/blueprint/services``.

Status codes match the legacy FastAPI router
(``old-backend/otix/api/blueprint/router.py``): create -> 201, detail/list/update ->
200, delete -> 204, and 404s carry the legacy ``detail`` strings verbatim.
"""

from rest_framework import generics, permissions, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.blueprint import services
from apps.blueprint.serializers import (
    BlueprintCreateSerializer,
    BlueprintDetailSerializer,
    BlueprintDownloadResponseSerializer,
    BlueprintLikeResponseSerializer,
    BlueprintListSerializer,
    BlueprintUpdateSerializer,
)

BLUEPRINT_NOT_FOUND = "Blueprint not found"
BLUEPRINT_NOT_OWNED = "Blueprint not found or not owned by user"


class BlueprintListCreateView(generics.ListCreateAPIView):
    """``GET`` list (public, optional-user) + ``POST`` create (authenticated)."""

    def get_permissions(self) -> list[permissions.BasePermission]:
        if self.request.method == "GET":
            return (permissions.AllowAny(),)
        return (permissions.IsAuthenticated(),)

    def get_serializer_class(self):
        if self.request.method == "GET":
            return BlueprintListSerializer
        return BlueprintCreateSerializer

    def get_queryset(self):
        search = self.request.query_params.get("search")
        sort = self.request.query_params.get("sort") or "created_at"
        user = self.request.user
        user_id = user.id if user.is_authenticated else None
        return services.list_blueprints(search=search, sort=sort, user_id=user_id)

    def create(self, request, *args, **kwargs) -> Response:
        serializer = BlueprintCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        blueprint = services.create_blueprint(request.user, **serializer.validated_data)
        detail = services.get_blueprint(blueprint.pk, request.user.id)
        return Response(BlueprintDetailSerializer(detail).data, status=status.HTTP_201_CREATED)


class BlueprintDetailView(APIView):
    """``GET`` detail (public) + ``PATCH``/``DELETE`` (owner only)."""

    def get_permissions(self) -> list[permissions.BasePermission]:
        if self.request.method == "GET":
            return (permissions.AllowAny(),)
        return (permissions.IsAuthenticated(),)

    def get(self, request, blueprint_id: str) -> Response:
        user = request.user
        user_id = user.id if user.is_authenticated else None
        blueprint = services.get_blueprint(blueprint_id, user_id)
        if blueprint is None:
            raise NotFound(BLUEPRINT_NOT_FOUND)
        return Response(BlueprintDetailSerializer(blueprint).data)

    def patch(self, request, blueprint_id: str) -> Response:
        serializer = BlueprintUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        blueprint = services.update_blueprint(
            blueprint_id, request.user.id, serializer.validated_data
        )
        if blueprint is None:
            raise NotFound(BLUEPRINT_NOT_OWNED)
        detail = services.get_blueprint(blueprint.pk, request.user.id)
        return Response(BlueprintDetailSerializer(detail).data)

    def delete(self, request, blueprint_id: str) -> Response:
        if not services.delete_blueprint(blueprint_id, request.user.id):
            raise NotFound(BLUEPRINT_NOT_OWNED)
        return Response(status=status.HTTP_204_NO_CONTENT)


class BlueprintLikeView(APIView):
    """``POST`` /blueprints/{id}/like -- toggle the user's like (authenticated)."""

    def post(self, request, blueprint_id: str) -> Response:
        blueprint = services.get_blueprint_for_mutation(blueprint_id)
        if blueprint is None:
            raise NotFound(BLUEPRINT_NOT_FOUND)
        is_liked, like_count = services.toggle_blueprint_like(request.user, blueprint)
        return Response(
            BlueprintLikeResponseSerializer({"is_liked": is_liked, "like_count": like_count}).data
        )


class BlueprintDownloadView(APIView):
    """``POST`` /blueprints/{id}/download -- increment counter (public)."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request, blueprint_id: str) -> Response:
        blueprint = services.increment_blueprint_downloads(blueprint_id)
        if blueprint is None:
            raise NotFound(BLUEPRINT_NOT_FOUND)
        return Response(BlueprintDownloadResponseSerializer(blueprint).data)
