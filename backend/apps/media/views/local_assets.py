"""Local-asset views: public file serving + admin download/storage.

``AssetFileView`` serves a mirrored asset at ``/api/v1/assets/<name>``. It is
public on purpose: artwork loads via plain ``<img>`` tags which cannot carry a
bearer token, and the filenames are unguessable uuids (the same trust model as
the ``/uploads`` web-tier serving). The admin endpoints (mirror download +
storage usage) are staff-only.
"""

from __future__ import annotations

import mimetypes
import shutil
from pathlib import Path

from django.conf import settings
from django.db.models import Count, Sum
from django.http import FileResponse, Http404
from rest_framework import permissions, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.media.models import MediaAsset, MediaItem
from apps.media.services import assets as assets_service
from apps.proposals.views.proposals import IsAdminUser


class AssetFileView(APIView):
    """``GET /api/v1/assets/<name>`` — serve a mirrored asset file (public)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request, name: str) -> FileResponse:
        filename = Path(name).name
        if filename != name:
            raise Http404  # reject path separators / traversal
        path = Path(settings.MEDIA_DIR) / "assets" / filename
        if not path.is_file():
            raise Http404
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        response = FileResponse(path.open("rb"), content_type=content_type)
        response["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


class DownloadAssetsView(APIView):
    """``POST /media/admin/media-items/<media_id>/download-assets`` (admin).

    Mirrors the item's primary artwork (poster/backdrop/logo/textless_poster/
    icon) onto local disk, synchronously (≤5 images).
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request, media_id: int) -> Response:
        if not assets_service.mirroring_enabled():
            raise PermissionDenied("Local image mirroring is disabled")
        item = MediaItem.objects.filter(pk=media_id).prefetch_related("assets").first()
        if item is None:
            raise NotFound("Media item not found")
        result = assets_service.download_primary_assets(item)
        return Response(result, status=status.HTTP_200_OK)


class StorageUsageView(APIView):
    """``GET /media/admin/storage`` — downloaded-library usage (admin)."""

    permission_classes = (IsAuthenticated, IsAdminUser)

    def get(self, request) -> Response:
        agg = MediaAsset.objects.filter(local_name__isnull=False).aggregate(
            total_bytes=Sum("local_size"),
            total_count=Count("pk"),
        )
        directory = Path(settings.MEDIA_DIR)
        directory.mkdir(parents=True, exist_ok=True)
        disk = shutil.disk_usage(directory)
        return Response(
            {
                "media_dir": str(directory),
                "downloaded_count": agg["total_count"] or 0,
                "downloaded_bytes": agg["total_bytes"] or 0,
                "disk": {
                    "total": disk.total,
                    "used": disk.used,
                    "free": disk.free,
                },
            }
        )


class MirroringView(APIView):
    """``GET/PUT /media/admin/mirroring`` — server-wide artwork mirroring flag.

    Off stops new downloads (``DownloadAssetsView`` 403s); already-mirrored
    artwork keeps being served until explicitly purged. Staff-only.
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def get(self, request) -> Response:
        return Response({"enabled": assets_service.mirroring_enabled()})

    def put(self, request) -> Response:
        enabled = request.data.get("enabled")
        if not isinstance(enabled, bool):
            raise ValidationError({"enabled": "must be a boolean"})
        assets_service.set_mirroring_enabled(enabled)
        return Response({"enabled": assets_service.mirroring_enabled()})


class PurgeAssetsView(APIView):
    """``DELETE /media/admin/assets`` — delete every locally mirrored file.

    Removes the files under ``MEDIA_DIR/assets`` and clears ``local_name`` /
    ``local_size`` / ``downloaded_at`` so the catalog falls back to remote
    URLs. Staff-only.
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def delete(self, request) -> Response:
        return Response(assets_service.purge_downloaded_assets(), status=status.HTTP_200_OK)
