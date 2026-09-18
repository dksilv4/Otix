"""Rating and review endpoints (legacy ``review/router.py``).

All are per-user (authenticated). ``PUT`` rating/review creates rows that
reference the media item hub, so the media item must exist (404 otherwise);
``GET``/``DELETE`` follow row presence instead (legacy ``Rating not found`` /
``Review not found`` on miss).
"""

from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.media import services
from apps.media.serializers.social import (
    MediaRatingAggregateOutSerializer,
    MediaRatingBodySerializer,
    MediaRatingOutSerializer,
    ReviewBodySerializer,
    ReviewOutSerializer,
    ReviewUpdateSerializer,
    ReviewWithUserOutSerializer,
)


def _media_or_404(media_id: int):
    item = services.media_item_or_none(media_id)
    if item is None:
        raise NotFound("Media item not found")
    return item


class RatingView(APIView):
    """``GET``/``PUT``/``DELETE /media/{media_type}/{media_id}/rating``."""

    def get(self, request, media_type: str, media_id: int) -> Response:
        rating = services.my_rating(request.user.id, media_id)
        if rating is None:
            return Response(None)
        return Response(MediaRatingOutSerializer(rating).data)

    def put(self, request, media_type: str, media_id: int) -> Response:
        _media_or_404(media_id)
        body = MediaRatingBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        payload = services.upsert_rating(request.user, media_id, body.validated_data["score"])
        return Response(MediaRatingAggregateOutSerializer(payload).data)

    def delete(self, request, media_type: str, media_id: int) -> Response:
        if not services.delete_rating(request.user, media_id):
            raise NotFound("Rating not found")
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReviewView(APIView):
    """``GET``/``PUT``/``PATCH``/``DELETE /media/{media_type}/{media_id}/review``."""

    def get(self, request, media_type: str, media_id: int) -> Response:
        review = services.my_review(request.user.id, media_id)
        if review is None:
            return Response(None)
        return Response(ReviewOutSerializer(review).data)

    def put(self, request, media_type: str, media_id: int) -> Response:
        _media_or_404(media_id)
        body = ReviewBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        review = services.upsert_review(
            request.user,
            media_id,
            title=body.validated_data.get("title"),
            content=body.validated_data.get("content"),
            is_spoiler=body.validated_data.get("is_spoiler", False),
            is_private=body.validated_data.get("is_private", False),
        )
        return Response(ReviewOutSerializer(review).data)

    def patch(self, request, media_type: str, media_id: int) -> Response:
        body = ReviewUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        update_data = {k: v for k, v in body.validated_data.items() if v is not None}
        review = services.update_review(request.user.id, media_id, update_data)
        if review is None:
            raise NotFound("Review not found")
        return Response(ReviewOutSerializer(review).data)

    def delete(self, request, media_type: str, media_id: int) -> Response:
        if not services.delete_review(request.user.id, media_id):
            raise NotFound("Review not found")
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReviewListView(APIView):
    """``GET /media/{media_type}/{media_id}/reviews`` — public list w/ author+rating."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request, media_type: str, media_id: str | int) -> Response:
        try:
            limit = int(request.query_params.get("limit", 20))
        except ValueError:
            raise ValidationError("limit must be an integer") from None
        limit = max(1, min(limit, 50))
        from apps.media.views.catalog import resolve_media_pk

        pk = resolve_media_pk(media_type, media_id)
        if pk is None:
            return Response([])
        viewer_id = request.user.id if request.user.is_authenticated else None
        payload = services.list_reviews_with_ratings(pk, viewer_id=viewer_id, limit=limit)
        return Response(ReviewWithUserOutSerializer(payload, many=True).data)
