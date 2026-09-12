"""Public profile-hub endpoints (detail, search) owned by ``accounts``.

The detail route is public with optional auth (legacy ``get_optional_user``):
anonymous callers receive ``friendship_status``/``is_following`` in their
anonymous form. Search is a username-substring stand-in for the legacy
pgvector/trigram endpoint (embeddings are deferred in the greenfield schema).
"""

from rest_framework import permissions
from rest_framework.exceptions import NotFound, ParseError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.serializers.user_profile import (
    UserProfileSerializer,
    UserSearchResultSerializer,
)
from apps.accounts.services.user_profile import (
    build_user_profile,
    get_user_by_username,
    search_users,
)

USER_NOT_FOUND = "User not found"


class UserDetailView(APIView):
    """``GET /users/{username}`` — public profile detail with optional auth."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, username: str) -> Response:
        user = get_user_by_username(username)
        if user is None:
            raise NotFound(USER_NOT_FOUND)
        context = build_user_profile(user, request.user)
        return Response(UserProfileSerializer(context).data)


class UserSearchView(APIView):
    """``GET /users/search`` — username search (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> Response:
        query = request.query_params.get("q")
        if not query or not query.strip():
            raise ParseError("The q query parameter is required.")
        try:
            limit = int(request.query_params.get("limit", 20))
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 50))
        items = search_users(query.strip(), limit)
        return Response(
            {"items": UserSearchResultSerializer(items, many=True).data, "has_more": False}
        )
