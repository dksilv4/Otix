"""Free-games match view: catalog-match desktop-aggregator free-game refs.

Public (``AllowAny``) like the rest of ``/discover`` — the desktop aggregator
POSTs raw store refs without a user token. The response ``media_item`` mirrors
the legacy ``MediaItemDetail`` payload for matched items and is ``null`` for
unmatched ones.
"""

from __future__ import annotations

from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.discover.services.free_games import match_free_games
from apps.media.serializers import MediaItemDetailSerializer
from apps.media.services import catalog as catalog_service


class FreeGameRefSerializer(serializers.Serializer):
    store = serializers.CharField()
    external_id = serializers.CharField()
    title = serializers.CharField(required=False, allow_null=True, default=None)
    original_price = serializers.CharField(required=False, allow_null=True, default=None)
    free_end_date = serializers.CharField(required=False, allow_null=True, default=None)
    claim_url = serializers.CharField(required=False, allow_null=True, default=None)
    poster_url = serializers.CharField(required=False, allow_null=True, default=None)
    store_label = serializers.CharField(required=False, allow_null=True, default=None)


class FreeGamesMatchRequestSerializer(serializers.Serializer):
    games = FreeGameRefSerializer(many=True)


class FreeGamesMatchView(APIView):
    """POST /discover/free-games/match — match free-game refs to the catalog.

    Accepts a list of ``{store, external_id, ...}`` refs and returns one entry
    per ref (legacy ``FreeGameResult`` key order) with the matched
    ``media_item`` detail, or ``null`` when nothing matched.
    """

    permission_classes = (permissions.AllowAny,)

    def post(self, request) -> Response:
        body = FreeGamesMatchRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        games = body.validated_data["games"]
        if not games:
            return Response({"items": []})

        matches = match_free_games(games)
        items = []
        for match in matches:
            media_detail = None
            if match.matched and match.media_item is not None:
                catalog_service.enrich_summaries([match.media_item], request.user)
                media_detail = MediaItemDetailSerializer(match.media_item).data
            items.append(
                {
                    "media_item": media_detail,
                    "matched": match.matched,
                    "store": match.store,
                    "store_label": match.store_label,
                    "original_price": match.original_price,
                    "free_end_date": match.free_end_date,
                    "claim_url": match.claim_url,
                    "poster_url": match.poster_url,
                    "title": match.title,
                    "external_id": match.external_id,
                }
            )
        return Response({"items": items})
