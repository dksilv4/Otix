"""Server-Sent Events (SSE) streaming search endpoint.

GET /api/v1/search/stream?q={query}&media_type={type}&sort_by={sort}&limit={limit}
Yields:
  - event: local -> data: JSON array of MediaItemSummary (<50ms, <15ms cached)
  - event: external -> data: JSON array of ingested MediaItemSummary (if local < threshold)
  - event: done -> data: {"status": "complete", "total_local": int, "total_external": int}
"""

from __future__ import annotations

import json
import logging

from django.http import StreamingHttpResponse
from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.search import services
from apps.search.views.search import _int_param, _optional_str, _require_q

logger = logging.getLogger(__name__)


class SearchStreamView(APIView):
    """GET /api/v1/search/stream — Two-stage SSE streaming search endpoint."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> StreamingHttpResponse:
        params = request.query_params
        q = _require_q(params)
        media_type = _optional_str(params, "media_type")
        sort_by = _optional_str(params, "sort_by")
        limit = _int_param(params, "limit", 24, ge=1, le=100)

        def event_stream():
            try:
                # Stage 1: Fast local matches (<50ms, <15ms cached)
                local_items = services.get_local_search_items(
                    q=q,
                    media_type=media_type,
                    sort_by=sort_by,
                    limit=limit,
                )
                yield f"event: local\ndata: {json.dumps(local_items)}\n\n"

                # Stage 2: External discovery if local matches are sparse
                external_items = []
                if len(local_items) < services.BACKFILL_THRESHOLD:
                    existing_ids = {str(item["id"]) for item in local_items}
                    remaining_limit = max(1, limit - len(local_items)) if local_items else limit
                    external_items = services.get_external_search_items(
                        q=q,
                        media_type=media_type,
                        limit=remaining_limit,
                        existing_ids=existing_ids,
                    )
                    if external_items:
                        yield f"event: external\ndata: {json.dumps(external_items)}\n\n"

                done_payload = {
                    "status": "complete",
                    "total_local": len(local_items),
                    "total_external": len(external_items),
                }
                yield f"event: done\ndata: {json.dumps(done_payload)}\n\n"
            except GeneratorExit:
                logger.debug("Client closed search stream for q=%s", q)
            except Exception:
                logger.exception("Search stream error for q=%s", q)
                yield f"event: done\ndata: {json.dumps({'status': 'error', 'total_local': 0, 'total_external': 0})}\n\n"

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache, no-transform"
        response["X-Accel-Buffering"] = "no"
        return response
