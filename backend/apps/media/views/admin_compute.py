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

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.media.models import Character, ExternalID, MediaAsset, MediaCharacter, MediaItem
from apps.media.services import assets as assets_service
from apps.people.models import MediaCredit, Person
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


def _is_leased(redis_client: Any | None, identifier: int | str) -> bool:
    if not redis_client:
        return False
    try:
        return bool(redis_client.exists(f"compute:lease:{identifier}"))
    except Exception:
        return False


def _set_lease(
    redis_client: Any | None, identifier: int | str, worker_info: str = "admin-worker"
) -> None:
    if not redis_client:
        return
    try:
        redis_client.set(f"compute:lease:{identifier}", worker_info, ex=LEASE_TTL_SECONDS)
    except Exception:
        pass


def _delete_lease(redis_client: Any | None, identifier: int | str) -> None:
    if not redis_client:
        return
    try:
        redis_client.delete(f"compute:lease:{identifier}")
    except Exception:
        pass


def format_media_item_for_embedding(item: MediaItem) -> str:
    """Format a MediaItem with rich metadata for dense semantic embedding."""
    parts = []
    # Title & Year
    year = item.release_date.year if item.release_date else None
    title_str = f"Title: {item.title}" + (f" ({year})" if year else "")
    parts.append(title_str)

    # Type & Genres
    genre_names = [
        mg.genre.name
        for mg in item.media_genres.all()
        if hasattr(mg, "genre") and mg.genre and mg.genre.name
    ]
    type_parts = [f"Type: {item.media_type.capitalize()}"]
    if genre_names:
        type_parts.append(f"Genres: {', '.join(genre_names)}")
    parts.append(" | ".join(type_parts))

    # Movie tagline
    if item.media_type == "movie" and hasattr(item, "movie") and item.movie and item.movie.tagline:
        parts.append(f"Tagline: {item.movie.tagline}")

    # Creators / Directors / Developers & Top Cast
    directors = []
    cast = []
    for c in item.credits.all():
        if not hasattr(c, "person") or not c.person or not c.person.name:
            continue
        p_name = c.person.name.strip()
        role = (c.role or "").lower()
        if role in ("director", "creator", "developer", "producer", "writer"):
            directors.append(p_name)
        elif role == "cast" and len(cast) < 8:
            if c.character_name and c.character_name.strip():
                cast.append(f"{p_name} ({c.character_name.strip()})")
            else:
                cast.append(p_name)

    if directors:
        parts.append(f"Creators/Directors: {', '.join(directors[:5])}")
    if cast:
        parts.append(f"Cast: {', '.join(cast)}")

    # Overview
    if item.overview and item.overview.strip():
        parts.append(f"Overview: {item.overview.strip()}")

    # Keywords / Tropes
    keywords = [
        mk.keyword.name
        for mk in item.media_keywords.all()
        if hasattr(mk, "keyword") and mk.keyword and mk.keyword.name
    ][:10]
    if keywords:
        parts.append(f"Themes/Keywords: {', '.join(keywords)}")

    return "\n".join(parts)


class AdminComputeClaimView(APIView):
    """``POST /api/v1/media/admin/compute/claim``

    Claim a batch of unmirrored primary media assets or unembedded media items for local processing.
    Each claimed item receives a 5-minute lease in Redis to prevent duplicate work.
    If the worker crashes or abandons the task, the lease automatically expires.
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request) -> Response:
        task = request.data.get("task", "artwork")
        batch_size = request.data.get("batch_size", 10)
        try:
            batch_size = max(1, min(int(batch_size), 500))
        except (ValueError, TypeError):
            batch_size = 10

        redis_client = _get_redis_safe()

        if task == "embeddings":
            candidates = (
                MediaItem.objects.filter(embedding__isnull=True)
                .order_by("-popularity", "id")[: batch_size * 2]
                .prefetch_related(
                    "media_genres__genre",
                    "media_keywords__keyword",
                    "credits__person",
                )
                .select_related("movie", "show", "game")
            )

            claimed_items = []
            for item in candidates:
                if _is_leased(redis_client, f"embed:{item.pk}"):
                    continue

                _set_lease(redis_client, f"embed:{item.pk}", worker_info=str(request.user.pk))
                claimed_items.append(
                    {
                        "media_item_id": item.pk,
                        "title": item.title,
                        "media_type": item.media_type,
                        "text": format_media_item_for_embedding(item),
                        "lease_seconds": LEASE_TTL_SECONDS,
                    }
                )

                if len(claimed_items) >= batch_size:
                    break

            return Response(
                {
                    "count": len(claimed_items),
                    "task": "embeddings",
                    "lease_seconds": LEASE_TTL_SECONDS,
                    "items": claimed_items,
                }
            )

        if not assets_service.mirroring_enabled():
            raise PermissionDenied("Local image mirroring is disabled on the server")

        enabled_types = assets_service.enabled_asset_types()
        group_by_media = bool(request.data.get("group_by_media", False))

        if group_by_media:
            # Query candidate media items that have unmirrored assets in enabled_types
            unmirrored_media_ids = (
                MediaAsset.objects.filter(
                    local_name__isnull=True,
                    url__isnull=False,
                    asset_type__in=enabled_types,
                )
                .exclude(url__icontains=".svg")
                .values_list("media_item_id", flat=True)
                .distinct()
            )

            candidate_items = (
                MediaItem.objects.filter(id__in=unmirrored_media_ids)
                .order_by("-popularity", "id")[: batch_size * 2]
                .prefetch_related("assets", "external_ids", "credits")
            )

            claimed_media_jobs = []
            for item in candidate_items:
                if _is_leased(redis_client, f"media:{item.pk}"):
                    continue

                item_assets = []
                asset_ids_to_lease = []
                for asset in item.assets.all():
                    if asset.asset_type not in enabled_types:
                        continue
                    if not asset.url or not asset.url.strip():
                        continue
                    if ".svg" in asset.url.lower():
                        continue
                    if _is_leased(redis_client, asset.pk):
                        continue

                    item_assets.append(
                        {
                            "asset_id": asset.pk,
                            "asset_type": asset.asset_type,
                            "url": asset.url,
                            "score": asset.score or 0,
                            "selected_context": asset.selected_context,
                            "keep_local": asset.keep_local,
                            "is_mirrored": bool(asset.local_name),
                        }
                    )
                    asset_ids_to_lease.append(asset.pk)

                if not item_assets:
                    continue

                _set_lease(redis_client, f"media:{item.pk}", worker_info=str(request.user.pk))
                for aid in asset_ids_to_lease:
                    _set_lease(redis_client, aid, worker_info=str(request.user.pk))

                ext_ids = {ext.provider: ext.external_id for ext in item.external_ids.all()}
                needs_enrichment = not item.credits.exists()

                claimed_media_jobs.append(
                    {
                        "media_item_id": item.pk,
                        "title": item.title,
                        "media_type": item.media_type,
                        "slug": item.slug,
                        "needs_enrichment": needs_enrichment,
                        "external_ids": ext_ids,
                        "assets": item_assets,
                        "lease_seconds": LEASE_TTL_SECONDS,
                    }
                )

                if len(claimed_media_jobs) >= batch_size:
                    break

            return Response(
                {
                    "count": len(claimed_media_jobs),
                    "lease_seconds": LEASE_TTL_SECONDS,
                    "grouped_by_media": True,
                    "media_jobs": claimed_media_jobs,
                }
            )

        # Legacy flat mode: query individual unmirrored assets
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


class AdminComputeSubmitEnrichmentView(APIView):
    """``POST /api/v1/media/admin/compute/enrichment``

    Accepts parsed public metadata (Wikidata cast, crew, characters, distributors, fandom)
    offloaded to admin workers and updates the central database atomically.
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request) -> Response:
        media_item_id = request.data.get("media_item_id")
        if not media_item_id:
            raise ValidationError({"media_item_id": "media_item_id is required"})

        from apps.media.services.character_enrichment import get_or_create_character_for_media
        from apps.media.services.completeness import recompute_completeness
        from apps.media.services.wikidata_distributor import attach_distributors

        try:
            media = MediaItem.objects.get(pk=media_item_id)
        except MediaItem.DoesNotExist:
            raise NotFound(f"MediaItem {media_item_id} not found") from None

        cast_entries = request.data.get("cast") or []
        crew_entries = request.data.get("crew") or []
        char_entries = request.data.get("characters") or []
        distributors = request.data.get("distributors") or []
        fandom_id = request.data.get("fandom_id")

        credits_added = 0
        characters_added = 0
        distributors_added = 0

        with transaction.atomic():
            # 1. Cast
            for order, c in enumerate(cast_entries):
                p_name = (c.get("person_name") or "").strip()
                if not p_name:
                    continue
                c_name = (c.get("character_name") or "").strip()
                photo = c.get("photo_url")

                person = Person.objects.filter(name=p_name).first()
                if not person:
                    person = Person.objects.create(name=p_name, photo_url=photo)
                elif photo and not person.photo_url:
                    person.photo_url = photo
                    person.save(update_fields=["photo_url"])

                _, created = MediaCredit.objects.update_or_create(
                    media_item=media,
                    person=person,
                    role="cast",
                    character_name=c_name,
                    defaults={"sort_order": order},
                )
                if created:
                    credits_added += 1

                if c_name and c_name.lower() not in (
                    "cast",
                    "various",
                    "additional voices",
                    "self",
                    "uncredited",
                    "narrator",
                ):
                    char, _ = get_or_create_character_for_media(media, c_name)
                    _, mcreated = MediaCharacter.objects.get_or_create(
                        media_item=media,
                        character=char,
                        defaults={"order": order},
                    )
                    if mcreated:
                        characters_added += 1

            # 2. Additional characters
            char_ct = ContentType.objects.get_for_model(Character)
            for c_order, claim in enumerate(char_entries, start=len(cast_entries)):
                c_name = (claim.get("character_name") or "").strip()
                if not c_name:
                    continue
                char, _ = get_or_create_character_for_media(media, c_name)
                _, mcreated = MediaCharacter.objects.get_or_create(
                    media_item=media,
                    character=char,
                    defaults={"order": c_order},
                )
                if mcreated:
                    characters_added += 1

                desc = claim.get("description")
                if desc and not char.description:
                    char.description = desc
                    char.save(update_fields=["description"])
                c_photo = claim.get("image_url")
                if c_photo and not char.photo_url:
                    char.photo_url = c_photo
                    char.save(update_fields=["photo_url"])

                qid = claim.get("wikidata_id")
                if qid:
                    ExternalID.objects.get_or_create(
                        content_type=char_ct,
                        object_id=char.pk,
                        provider="wikidata",
                        defaults={"external_id": str(qid)},
                    )
                w_title = claim.get("wikipedia_title")
                if w_title:
                    ExternalID.objects.get_or_create(
                        content_type=char_ct,
                        object_id=char.pk,
                        provider="wikipedia",
                        defaults={"external_id": str(w_title)},
                    )

            # 3. Crew
            for order, cr in enumerate(crew_entries):
                p_name = (cr.get("person_name") or "").strip()
                role = (cr.get("role") or "").strip()
                if not p_name or not role:
                    continue
                photo = cr.get("photo_url")

                person = Person.objects.filter(name=p_name).first()
                if not person:
                    person = Person.objects.create(name=p_name, photo_url=photo)
                elif photo and not person.photo_url:
                    person.photo_url = photo
                    person.save(update_fields=["photo_url"])

                _, created = MediaCredit.objects.update_or_create(
                    media_item=media,
                    person=person,
                    role=role,
                    defaults={"sort_order": order},
                )
                if created:
                    credits_added += 1

            # 4. Fandom ID
            if fandom_id and isinstance(fandom_id, str):
                media_ct = ContentType.objects.get_for_model(MediaItem)
                ExternalID.objects.get_or_create(
                    content_type=media_ct,
                    object_id=media.pk,
                    provider="fandom",
                    defaults={"external_id": fandom_id.strip()},
                )

            # 5. Distributors
            if distributors and isinstance(distributors, list):
                distributors_added = attach_distributors(media.pk, distributors)

            recompute_completeness(media)

        # Release media claim lease
        redis_client = _get_redis_safe()
        _delete_lease(redis_client, f"media:{media.pk}")

        return Response(
            {
                "status": "ok",
                "media_item_id": media.pk,
                "credits_added": credits_added,
                "characters_added": characters_added,
                "distributors_added": distributors_added,
            }
        )


class AdminComputeSubmitEmbeddingsView(APIView):
    """``POST /api/v1/media/admin/compute/embeddings``

    Submit 1024-dimensional semantic embeddings computed on the admin worker.
    Updates MediaItem.embedding and MediaItem.embedded_at atomically.
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request) -> Response:
        embeddings = request.data.get("embeddings")
        if not embeddings or not isinstance(embeddings, list):
            raise ValidationError({"embeddings": "A non-empty list of embeddings is required"})

        redis_client = _get_redis_safe()
        media_ids = []
        valid_pairs = []

        for entry in embeddings:
            if not isinstance(entry, dict):
                continue
            mid = entry.get("media_item_id")
            vec = entry.get("vector")
            if not mid or not isinstance(mid, int):
                continue
            if not isinstance(vec, list) or len(vec) != 1024:
                continue
            media_ids.append(mid)
            valid_pairs.append((mid, vec))

        if not valid_pairs:
            raise ValidationError(
                {"embeddings": "No valid {media_item_id, vector(1024)} entries provided"}
            )

        media_items = {m.pk: m for m in MediaItem.objects.filter(pk__in=media_ids)}
        now = timezone.now()
        to_update = []

        for mid, vec in valid_pairs:
            m = media_items.get(mid)
            if m:
                m.embedding = vec
                m.embedded_at = now
                to_update.append(m)
                _delete_lease(redis_client, f"embed:{mid}")

        with transaction.atomic():
            MediaItem.objects.bulk_update(to_update, ["embedding", "embedded_at"], batch_size=200)

        logger.info(
            "Admin worker submitted %d embeddings (updated %d items)",
            len(valid_pairs),
            len(to_update),
        )

        return Response(
            {
                "status": "ok",
                "submitted": len(valid_pairs),
                "updated": len(to_update),
            }
        )


class AdminComputeReleaseView(APIView):
    """``POST /api/v1/media/admin/compute/release``

    Explicitly release leases on asset IDs, media items, or embedding tasks.
    """

    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request) -> Response:
        asset_ids = request.data.get("asset_ids", [])
        media_ids = request.data.get("media_ids", [])
        embedding_ids = request.data.get("embedding_ids", [])

        redis_client = _get_redis_safe()
        released = 0

        if isinstance(asset_ids, list):
            for aid in asset_ids:
                try:
                    aid_int = int(aid)
                    _delete_lease(redis_client, aid_int)
                    released += 1
                except (ValueError, TypeError):
                    continue

        if isinstance(media_ids, list):
            for mid in media_ids:
                try:
                    _delete_lease(redis_client, f"media:{int(mid)}")
                    released += 1
                except (ValueError, TypeError):
                    continue

        if isinstance(embedding_ids, list):
            for eid in embedding_ids:
                try:
                    _delete_lease(redis_client, f"embed:{int(eid)}")
                    released += 1
                except (ValueError, TypeError):
                    continue

        return Response({"status": "ok", "released": released})


class AdminComputeStatsView(APIView):
    """``GET /api/v1/media/admin/compute/stats``

    Returns overall status of pending unmirrored assets, mirrored assets, storage budget,
    and semantic embedding catalog progress.
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

        total_catalog = MediaItem.objects.count()
        embeddings_total = MediaItem.objects.filter(embedding__isnull=False).count()
        embeddings_pending = MediaItem.objects.filter(embedding__isnull=True).count()

        return Response(
            {
                "unmirrored_candidates": unmirrored,
                "mirrored_total": mirrored,
                "mirroring_enabled": assets_service.mirroring_enabled(),
                "storage": assets_service.mirrored_usage(),
                "catalog_total": total_catalog,
                "embeddings_total": embeddings_total,
                "embeddings_pending": embeddings_pending,
            }
        )
