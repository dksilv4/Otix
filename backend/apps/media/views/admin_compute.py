"""Admin-only distributed compute views for offloading heavy tasks.

Allows secondary admin workstations to claim batches of unmirrored artwork,
transcode/optimize them locally, and submit verified results back to the central server.
Strictly gated by ``(IsAuthenticated, IsAdminUser)``.
"""

from __future__ import annotations

import io
import logging
import uuid
from typing import Any

from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.media.models import MediaAsset
from apps.media.services import assets as assets_service
from apps.proposals.views.proposals import IsAdminUser
from core.redis import get_client

logger = logging.getLogger(__name__)

LEASE_TTL_SECONDS = 300  # 5 minutes lease before auto-expiry
ALLOWED_IMAGE_FORMATS = {"WEBP", "JPEG", "PNG", "GIF"}


def _get_redis_safe() -> Any | None:
    try:
        return get_client()
    except Exception as exc:
        logger.warning("Could not connect to Redis for compute leases: %s", exc)
        return None


def _is_leased(redis_client: Any | None, asset_id: int) -> bool:
    if not redis_client:
        return False
    try:
        return bool(redis_client.exists(f"compute:lease:{asset_id}"))
    except Exception:
        return False


def _set_lease(redis_client: Any | None, asset_id: int, worker_info: str = "admin-worker") -> None:
    if not redis_client:
        return
    try:
        redis_client.set(f"compute:lease:{asset_id}", worker_info, ex=LEASE_TTL_SECONDS)
    except Exception:
        pass


def _delete_lease(redis_client: Any | None, asset_id: int) -> None:
    if not redis_client:
        return
    try:
        redis_client.delete(f"compute:lease:{asset_id}")
    except Exception:
        pass


class AdminComputeClaimView(APIView):
    """``POST /api/v1/media/admin/compute/claim``

    Claim a batch of unmirrored primary media assets for local processing.
    Each claimed asset receives a 5-minute lease in Redis to prevent duplicate work.
    If the worker crashes or abandons the task, the lease automatically expires.
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request) -> Response:
        if not assets_service.mirroring_enabled():
            raise PermissionDenied("Local image mirroring is disabled on the server")

        batch_size = request.data.get("batch_size", 10)
        try:
            batch_size = max(1, min(int(batch_size), 100))
        except (ValueError, TypeError):
            batch_size = 10

        redis_client = _get_redis_safe()

        # Query candidates: unmirrored assets that have a source url (excluding raw SVG vector art)
        enabled_types = assets_service.enabled_asset_types()
        candidates = (
            MediaAsset.objects.filter(
                local_name__isnull=True,
                url__isnull=False,
                asset_type__in=enabled_types,
            )
            .exclude(url__icontains=".svg")
            .select_related("media_item")
            .order_by("-media_item__popularity", "id")[: batch_size * 4]
        )

        claimed_jobs = []
        for asset in candidates:
            if not asset.url or not asset.url.strip():
                continue
            if _is_leased(redis_client, asset.pk):
                continue

            _set_lease(redis_client, asset.pk, worker_info=str(request.user.pk))
            claimed_jobs.append(
                {
                    "asset_id": asset.pk,
                    "media_item_id": asset.media_item_id,
                    "title": asset.media_item.title if asset.media_item else "Unknown",
                    "asset_type": asset.asset_type,
                    "url": asset.url,
                    "lease_seconds": LEASE_TTL_SECONDS,
                }
            )

            if len(claimed_jobs) >= batch_size:
                break

        return Response(
            {
                "count": len(claimed_jobs),
                "lease_seconds": LEASE_TTL_SECONDS,
                "jobs": claimed_jobs,
            }
        )


class AdminComputeSubmitView(APIView):
    """``POST /api/v1/media/admin/compute/submit``

    Submit a processed/transcoded image for a previously claimed asset.
    Performs Zero-Trust verification using Pillow (validates image headers,
    format, and dimensions) before saving to local disk and updating MediaAsset.
    """

    permission_classes = (IsAuthenticated, IsAdminUser)
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request) -> Response:
        asset_id_raw = request.data.get("asset_id")
        if not asset_id_raw:
            raise ValidationError({"asset_id": "asset_id is required"})

        try:
            asset_id = int(asset_id_raw)
        except (ValueError, TypeError):
            raise ValidationError({"asset_id": "asset_id must be an integer"}) from None

        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            raise ValidationError({"file": "file upload is required"})

        asset = MediaAsset.objects.filter(pk=asset_id).first()
        if not asset:
            return Response(
                {"error": "Asset not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Zero-Trust Validation: verify file is a legitimate image
        file_bytes = uploaded_file.read()
        if not file_bytes:
            return Response(
                {"error": "Empty file provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with Image.open(io.BytesIO(file_bytes)) as img:
                img_format = (img.format or "").upper()
                if img_format not in ALLOWED_IMAGE_FORMATS:
                    return Response(
                        {"error": f"Unsupported image format: {img_format}"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                width, height = img.size
        except Exception as exc:
            logger.warning("Rejected invalid image submission for asset %s: %s", asset_id, exc)
            return Response(
                {"error": "Corrupted or invalid image data"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check server storage safety
        if not assets_service.disk_safe():
            return Response(
                {"error": "Server disk space is below minimum free GB limit"},
                status=status.HTTP_507_INSUFFICIENT_STORAGE,
            )

        if not assets_service._make_room(len(file_bytes)):
            return Response(
                {"error": "Server artwork storage budget exceeded"},
                status=status.HTTP_507_INSUFFICIENT_STORAGE,
            )

        # Write securely to asset storage
        ext = ".webp" if img_format == "WEBP" else ".jpg"
        if img_format == "PNG":
            ext = ".png"
        elif img_format == "GIF":
            ext = ".gif"

        filename = f"{uuid.uuid4().hex}{ext}"
        target_path = assets_service.asset_dir() / filename
        target_path.write_bytes(file_bytes)

        # Update MediaAsset row
        asset.local_name = filename
        asset.local_size = len(file_bytes)
        asset.downloaded_at = timezone.now()
        asset.width = width
        asset.height = height

        color_guess = request.data.get("color_guess")
        if color_guess:
            asset.color_guess = str(color_guess)[:20]
        elif not asset.color_guess:
            from apps.media.services.color_analyzer import analyze_image_bytes

            guess = analyze_image_bytes(file_bytes, asset.asset_type)
            if guess:
                asset.color_guess = guess

        asset.save(
            update_fields=[
                "local_name",
                "local_size",
                "downloaded_at",
                "width",
                "height",
                "color_guess",
            ]
        )

        # Release lease
        redis_client = _get_redis_safe()
        _delete_lease(redis_client, asset.pk)

        logger.info(
            "Admin worker submitted asset %d -> %s (%d bytes, %dx%d %s)",
            asset.pk,
            filename,
            len(file_bytes),
            width,
            height,
            img_format,
        )

        return Response(
            {
                "status": "ok",
                "asset_id": asset.pk,
                "local_name": filename,
                "bytes": len(file_bytes),
                "width": width,
                "height": height,
                "format": img_format,
            }
        )


class AdminComputeReleaseView(APIView):
    """``POST /api/v1/media/admin/compute/release``

    Explicitly release leases on asset IDs (e.g., during graceful worker shutdown
    or when skipping an unfetchable URL).
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request) -> Response:
        asset_ids = request.data.get("asset_ids", [])
        if not isinstance(asset_ids, list):
            raise ValidationError({"asset_ids": "Expected a list of integer asset IDs"})

        redis_client = _get_redis_safe()
        released = 0
        for aid in asset_ids:
            try:
                aid_int = int(aid)
                _delete_lease(redis_client, aid_int)
                released += 1
            except (ValueError, TypeError):
                continue

        return Response({"status": "ok", "released": released})


class AdminComputeStatsView(APIView):
    """``GET /api/v1/media/admin/compute/stats``

    Returns overall status of pending unmirrored assets, mirrored assets, and storage budget.
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def get(self, request) -> Response:
        enabled_types = assets_service.enabled_asset_types()
        unmirrored = MediaAsset.objects.filter(
            local_name__isnull=True,
            url__isnull=False,
            asset_type__in=enabled_types,
        ).count()
        mirrored = MediaAsset.objects.filter(local_name__isnull=False).count()

        return Response(
            {
                "unmirrored_candidates": unmirrored,
                "mirrored_total": mirrored,
                "mirroring_enabled": assets_service.mirroring_enabled(),
                "storage": assets_service.mirrored_usage(),
            }
        )
