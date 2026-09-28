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
        assets_service.record_asset_use(filename)
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


_PINNABLE_ASSET_TYPES = assets_service.SELECTABLE_ASSET_TYPES


class ArtworkSelectionView(APIView):
    """``PUT``/``DELETE /media/admin/media-items/<id>/assets/<id>/select`` (admin).

    PUT pins an asset as the admin-chosen artwork for its type (clearing any
    sibling selection) and, when mirroring is enabled, mirrors that exact image
    while dropping the previous type-local copy. DELETE removes the pin so
    normal scoring picks the artwork again.
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def _resolve(self, media_id: int, asset_id: int) -> MediaAsset:
        asset = (
            MediaAsset.objects.select_related("media_item")
            .filter(pk=asset_id, media_item_id=media_id)
            .first()
        )
        if asset is None:
            raise NotFound("Asset not found for this media item")
        if asset.asset_type.lower() not in _PINNABLE_ASSET_TYPES:
            raise ValidationError({"asset_id": f"asset_type '{asset.asset_type}' cannot be pinned"})
        return asset

    def put(self, request, media_id: int, asset_id: int) -> Response:
        asset = self._resolve(media_id, asset_id)
        data = request.data if isinstance(request.data, dict) else {}
        context = data.get("context") or "general"
        if context not in assets_service.SELECTION_CONTEXTS:
            raise ValidationError(
                {"context": "must be one of " + ", ".join(assets_service.SELECTION_CONTEXTS)}
            )
        assets_service.select_asset(asset.media_item, asset, context)
        # select_asset reconciles via freshly re-resolved asset rows, so the
        # pinned row's mirror state must be re-read rather than trusted from the
        # pre-selection instance.
        asset.refresh_from_db(fields=["local_name"])
        return Response(
            {
                "asset_id": asset.id,
                "selected_context": context,
                "mirrored": bool(asset.local_name),
            }
        )

    def delete(self, request, media_id: int, asset_id: int) -> Response:
        asset = self._resolve(media_id, asset_id)
        assets_service.clear_asset_selection(asset)
        return Response({"asset_id": asset.id, "selected_context": None})


class TextlessPickView(APIView):
    """``PUT``/``DELETE .../assets/<id>/textless`` (admin).

    PUT marks the asset's image as the media item's family textless art — a
    theme-agnostic pick shared by General/Dark/Light. DELETE clears it. When the
    image lives in a normal slot (a plain poster/backdrop), the pick is backed
    by a materialized textless row reusing that image; see
    ``assets_service.set_textless_pick``.
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def _resolve(self, media_id: int, asset_id: int) -> MediaAsset:
        asset = (
            MediaAsset.objects.select_related("media_item")
            .filter(pk=asset_id, media_item_id=media_id)
            .first()
        )
        if asset is None:
            raise NotFound("Asset not found for this media item")
        if (asset.asset_type or "").lower() not in assets_service.FAMILY_TEXTLESS_TYPE:
            raise ValidationError(
                {"asset_id": f"asset_type '{asset.asset_type}' has no textless slot"}
            )
        return asset

    def put(self, request, media_id: int, asset_id: int) -> Response:
        asset = self._resolve(media_id, asset_id)
        if not asset.url:
            raise ValidationError({"asset_id": "asset has no url to mirror"})
        return Response(assets_service.set_textless_pick(asset.media_item, asset, True))

    def delete(self, request, media_id: int, asset_id: int) -> Response:
        asset = self._resolve(media_id, asset_id)
        return Response(assets_service.set_textless_pick(asset.media_item, asset, False))


class AssetMirrorView(APIView):
    """``PUT``/``DELETE /media/admin/media-items/<id>/assets/<id>/mirror`` (admin).

    PUT adds the asset to the admin mirror-keep set: it is downloaded to local
    disk and exempted from stale-copy cleanup (used to keep several localized
    language variants alongside the single served pick). DELETE removes it from
    the set and, when it isn't a resolution winner, frees its local copy.
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def _resolve(self, media_id: int, asset_id: int) -> MediaAsset:
        asset = (
            MediaAsset.objects.select_related("media_item")
            .filter(pk=asset_id, media_item_id=media_id)
            .first()
        )
        if asset is None:
            raise NotFound("Asset not found for this media item")
        return asset

    def put(self, request, media_id: int, asset_id: int) -> Response:
        asset = self._resolve(media_id, asset_id)
        return Response(assets_service.keep_asset(asset.media_item, asset, True))

    def delete(self, request, media_id: int, asset_id: int) -> Response:
        asset = self._resolve(media_id, asset_id)
        return Response(assets_service.keep_asset(asset.media_item, asset, False))


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


_BOOL_FIELDS = ("fetch_enabled", "discover_enabled", "local_games_enabled")
_INT_FIELDS = ("sweep_limit", "sweep_interval_minutes", "min_free_gb", "max_gb")


class ArtworkSettingsView(APIView):
    """``GET/PUT /media/admin/artwork-settings`` — auto-mirror sub-settings.

    Sits alongside the master ``MirroringView``: this view owns the automatic
    download toggles (fetch / discover sweep / local games), the sweep rate
    controls (per-run limit + interval), the enabled asset-type selection, and
    the disk safety cap. GET returns current values plus disk state; PUT accepts
    any subset of the mutable fields. Staff-only.
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def get(self, request) -> Response:
        return Response(assets_service.artwork_settings_payload())

    def put(self, request) -> Response:
        data = request.data if isinstance(request.data, dict) else {}
        for field in _BOOL_FIELDS:
            if field not in data:
                continue
            value = data[field]
            if not isinstance(value, bool):
                raise ValidationError({field: "must be a boolean"})
            getattr(assets_service, f"set_{field}")(value)
        for field in _INT_FIELDS:
            if field not in data:
                continue
            value = data[field]
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                raise ValidationError({field: "must be a non-negative integer"})
            getattr(assets_service, f"set_{field}")(value)
        if "asset_types" in data:
            types = data["asset_types"]
            if (
                not isinstance(types, list)
                or not types
                or not all(isinstance(t, str) for t in types)
            ):
                raise ValidationError({"asset_types": "must be a non-empty list of strings"})
            try:
                assets_service.set_asset_types(types)
            except ValueError as exc:
                raise ValidationError({"asset_types": str(exc)}) from None
        return Response(assets_service.artwork_settings_payload())


class PurgeAssetsView(APIView):
    """``DELETE /media/admin/assets`` — delete every locally mirrored file.

    Removes the files under ``MEDIA_DIR/assets`` and clears ``local_name`` /
    ``local_size`` / ``downloaded_at`` so the catalog falls back to remote
    URLs. Staff-only.
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def delete(self, request) -> Response:
        return Response(assets_service.purge_downloaded_assets(), status=status.HTTP_200_OK)
