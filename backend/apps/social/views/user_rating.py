"""Peer user-rating and media-rating-aggregate endpoints.

Mirror the legacy ``old-backend/otix/api/user/rating/router.py`` handlers. The peer
rating of another user is read/written via the ``workout.UserRating`` table
(cross-app read, matching the legacy users-domain ``user_ratings`` table).
``rating-distribution``/``top-rated`` read the *target user's* media ratings and
are public; the peer-rating mutations are authenticated.
"""

from rest_framework import permissions, status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.social import services
from apps.social.serializers.user_surface import (
    UserRatingBodySerializer,
    UserRatingOutSerializer,
    UserReputationOutSerializer,
)

USER_NOT_FOUND = "User not found"


class UserRatingView(APIView):
    """``GET``/``PUT``/``DELETE /users/{username}/rating`` (authenticated)."""

    def get(self, request: Request, username: str) -> Response:
        target = services.get_user_by_username(username)
        if target is None:
            raise NotFound(USER_NOT_FOUND)
        if target.id == request.user.id:
            return Response(None)
        rating = services.get_my_rating(request.user.id, target.id)
        return Response(UserRatingOutSerializer(rating).data if rating else None)

    def put(self, request: Request, username: str) -> Response:
        target = services.get_user_by_username(username)
        if target is None:
            raise NotFound(USER_NOT_FOUND)
        if target.id == request.user.id:
            return Response({"detail": "Cannot rate yourself"}, status=status.HTTP_400_BAD_REQUEST)
        body = UserRatingBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        rating = services.upsert_rating(request.user.id, target.id, body.validated_data["score"])
        return Response(UserRatingOutSerializer(rating).data, status=status.HTTP_200_OK)

    def delete(self, request: Request, username: str) -> Response:
        target = services.get_user_by_username(username)
        if target is None:
            raise NotFound(USER_NOT_FOUND)
        if not services.delete_rating(request.user.id, target.id):
            raise NotFound("Rating not found")
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserReputationView(APIView):
    """``GET /users/{username}/reputation`` — composite score (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, username: str) -> Response:
        user = services.get_user_by_username(username)
        if user is None:
            raise NotFound(USER_NOT_FOUND)
        aggregates = services.peer_rating_aggregates(user.id)
        result = services.compute_composite_score(user.id)
        payload = {
            "avg_user_rating": aggregates["avg_user_rating"],
            "user_rating_count": aggregates["user_rating_count"],
            "composite_score": result["composite_score"],
            "components": result["components"],
        }
        return Response(UserReputationOutSerializer(payload).data)


class RatingDistributionView(APIView):
    """``GET /users/{username}/rating-distribution`` — media rating buckets (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, username: str) -> Response:
        user = services.get_user_by_username(username)
        if user is None:
            raise NotFound(USER_NOT_FOUND)
        distribution, total = services.get_rating_distribution(user.id)
        return Response({"distribution": distribution, "total_ratings": total})


class TopRatedView(APIView):
    """``GET /users/{username}/top-rated`` — highest media ratings (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, username: str) -> Response:
        user = services.get_user_by_username(username)
        if user is None:
            raise NotFound(USER_NOT_FOUND)
        try:
            limit = int(request.query_params.get("limit", 12))
        except (TypeError, ValueError):
            limit = 12
        limit = max(1, min(limit, 50))
        return Response(services.top_rated(user.id, limit))
