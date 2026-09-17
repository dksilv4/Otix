"""Review-vote endpoints (legacy composite-addressed review).

Mirror the legacy ``old-backend/otix/api/media/review_vote/router.py`` handlers for
``/reviews/{review_user_id}/{media_item_id}/vote``: POST is a 204 upsert with
toggle-off semantics, DELETE is 204 (404 ``"Vote not found"`` when absent) and
GET returns the ``{up, down, my_vote}`` tallies. The legacy "cannot vote on your
own review" guard is preserved as a 400. A vote POST 404s when no review row
exists for the composite address because the greenfield ``ReviewVote`` row must
FK an existing ``Review`` (legacy stored the bare composite columns).
"""

from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.social import services
from apps.social.serializers import VoteBodySerializer, VoteCountsSerializer


class ReviewVoteView(APIView):
    """``GET``/``POST``/``DELETE /api/v1/reviews/{review_user_id}/{media_item_id}/vote``."""

    def get(self, request: Request, review_user_id: int, media_item_id: int) -> Response:
        counts = services.get_vote_counts(review_user_id, media_item_id)
        counts["my_vote"] = services.get_my_vote(
            request.user.id, review_user_id, media_item_id
        )
        return Response(VoteCountsSerializer(counts).data)

    def post(self, request: Request, review_user_id: int, media_item_id: int) -> Response:
        if request.user.id == review_user_id:
            return Response(
                {"detail": "Cannot vote on your own review"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        body = VoteBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        review = services.get_review_by_composite(review_user_id, media_item_id)
        if review is None:
            raise NotFound("Review not found")
        services.vote_review(request.user.id, review, body.validated_data["vote_type"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request: Request, review_user_id: int, media_item_id: int) -> Response:
        removed = services.remove_vote(request.user.id, review_user_id, media_item_id)
        if not removed:
            raise NotFound("Vote not found")
        return Response(status=status.HTTP_204_NO_CONTENT)
