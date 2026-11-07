"""Pure database game matching, multi-node correlation, and match review service."""

from __future__ import annotations

import logging
import re
from typing import Any

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from django.utils import timezone

from apps.library.models import GameMatchRecord, StorageShare, UserNode
from apps.library.services.server_catalog import (
    _NOISE_TAIL,
    _SCENE_FOLDER_TAGS,
    title_keys_for_file,
)
from apps.media.models import ExternalID, MediaItem
from apps.media.services.catalog import attach_media_urls
from apps.media.services.game_matcher import _comparison_key, _normalize_title

logger = logging.getLogger(__name__)

AUTO_MATCH_CONFIDENCE = 0.85
REVIEW_MIN_CONFIDENCE = 0.40


def generate_canonical_key(
    storage_share: StorageShare | None,
    node: UserNode | None,
    relative_path: str,
    sha256_head: str | None = None,
) -> str:
    """Generate a canonical identity key for a game file across nodes."""
    rel = (relative_path or "").strip().replace("\\", "/").lower()
    if storage_share:
        return f"share:{storage_share.id}:{rel}"
    if (
        sha256_head
        and sha256_head != "0000000000000000000000000000000000000000000000000000000000000000"
    ):
        return f"hash:{sha256_head}"
    node_id = node.id if node else "unknown"
    return f"node:{node_id}:{rel}"


def find_matching_candidates(
    title: str,
    filename: str | None = None,
    relative_path: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Search MediaItem catalog and compute confidence-scored candidates."""
    # 0) Direct Title ID match check (PS5 / PS4 Title IDs like PPSA*, ELJS*, CUSA*)
    haystack = f"{filename or ''} {relative_path or ''} {title or ''}"
    ps_match = re.search(r"\b((?:PPSA|ELJS|ECAS|CUSA)\d{5})\b", haystack, re.IGNORECASE)
    if ps_match:
        ps_code = ps_match.group(1).upper()
        ct = ContentType.objects.get_for_model(MediaItem)
        ext = ExternalID.objects.filter(
            content_type=ct,
            provider__in=["playstation", "ps_id"],
            external_id=ps_code,
        ).first()
        if ext and isinstance(ext.target, MediaItem):
            exact_item = ext.target
            try:
                attach_media_urls([exact_item])
            except Exception:
                pass
            return [
                {
                    "media_id": str(exact_item.id),
                    "title": exact_item.title,
                    "slug": exact_item.slug,
                    "poster_url": getattr(exact_item, "poster_url", "") or "",
                    "backdrop_url": getattr(exact_item, "backdrop_url", "") or "",
                    "release_year": exact_item.release_date.year if exact_item.release_date else None,
                    "confidence": 1.0,
                }
            ]

    keys = title_keys_for_file(filename, title, relative_path)
    if not keys:
        norm = _normalize_title(title).strip()
        if norm:
            keys = [norm.lower()]

    q = Q()
    for k in keys[:4]:
        if len(k) >= 2:
            q |= Q(title__icontains=k) | Q(slug__icontains=k)

    if not q:
        return []

    items = list(MediaItem.objects.filter(q)[:30])
    if not items:
        return []
    try:
        attach_media_urls(items)
    except Exception:
        pass

    cleaned_target = _NOISE_TAIL.sub("", _SCENE_FOLDER_TAGS.sub(" ", title)).strip()
    norm_target = _comparison_key(cleaned_target or title).lower().strip()
    scored: list[tuple[float, MediaItem]] = []

    for item in items:
        item_norm = _comparison_key(item.title).lower().strip()
        score = 0.0

        if item_norm == norm_target:
            score = 1.0
        elif norm_target and (
            item_norm.startswith(norm_target) or norm_target.startswith(item_norm)
        ):
            ratio = min(len(item_norm), len(norm_target)) / max(len(item_norm), len(norm_target))
            score = 0.85 * ratio
        elif any(k in item_norm for k in keys if len(k) >= 4):
            score = 0.65
        else:
            score = 0.35

        scored.append((score, item))

    scored.sort(key=lambda x: x[0], reverse=True)

    candidates: list[dict[str, Any]] = []
    for score, item in scored[:limit]:
        candidates.append(
            {
                "media_id": str(item.id),
                "title": item.title,
                "slug": item.slug,
                "poster_url": getattr(item, "poster_url", "") or "",
                "backdrop_url": getattr(item, "backdrop_url", "") or "",
                "release_year": item.release_date.year if item.release_date else None,
                "confidence": round(score, 3),
            }
        )

    return candidates


def sync_node_manifest(node: UserNode, files: list[dict[str, Any]], prune: bool = True) -> dict[str, int]:
    """Ingest a scanned file manifest from an Otix node, perform pure database matching,

    and update GameMatchRecord rows without modifying files on disk.
    """
    user = node.user
    node_paths = list(node.library_paths.filter(is_active=True).select_related("storage_share"))

    stats = {
        "total_processed": 0,
        "auto_matched": 0,
        "needs_review": 0,
        "unmatched": 0,
        "preserved_overrides": 0,
    }

    if not files:
        if prune:
            GameMatchRecord.objects.filter(node=node, user=user).delete()
        return stats

    seen_keys: set[str] = set()

    for f in files:
        stats["total_processed"] += 1
        fp = f.get("filepath") or ""
        rel = f.get("relative_path") or f.get("filename") or ""
        game_title = f.get("game_title") or f.get("otix_title") or f.get("filename") or ""
        filename = f.get("filename") or ""
        format_cat = f.get("format_category") or "game"
        filesize = int(f.get("filesize") or 0)
        sha256 = f.get("sha256_head") or ""

        # Find matching NodeLibraryPath
        matched_lib = None
        for lp in node_paths:
            if fp.startswith(lp.path):
                if not matched_lib or len(lp.path) > len(matched_lib.path):
                    matched_lib = lp

        storage_share = matched_lib.storage_share if matched_lib else None
        canonical_key = generate_canonical_key(storage_share, node, rel, sha256)
        seen_keys.add(canonical_key)

        existing = GameMatchRecord.objects.filter(user=user, canonical_key=canonical_key).first()

        if existing and existing.user_override:
            # Preserve user's manual match choice
            stats["preserved_overrides"] += 1
            existing.filesize = filesize
            existing.sha256_head = sha256
            existing.last_seen_at = timezone.now()
            existing.save(update_fields=["filesize", "sha256_head", "last_seen_at", "updated_at"])
            continue

        existing_media_id = f.get("otix_media_id")
        if not existing_media_id and isinstance(f.get("catalog_item"), dict):
            existing_media_id = f["catalog_item"].get("id")

        matched_media = None
        confidence = 0.0
        status = "unmatched"
        candidates = []

        if existing_media_id:
            try:
                matched_media = MediaItem.objects.filter(id=int(existing_media_id)).first()
            except (ValueError, TypeError):
                matched_media = None
            if matched_media:
                confidence = float(f.get("otix_confidence") or 1.0)
                status = "matched"
                stats["auto_matched"] += 1

        if not matched_media:
            candidates = find_matching_candidates(game_title, filename, rel, limit=5)
            top_candidate = candidates[0] if candidates else None

            if top_candidate and top_candidate["confidence"] >= AUTO_MATCH_CONFIDENCE:
                matched_media = MediaItem.objects.filter(id=top_candidate["media_id"]).first()
                confidence = top_candidate["confidence"]
                status = "matched"
                stats["auto_matched"] += 1
            elif top_candidate and top_candidate["confidence"] >= REVIEW_MIN_CONFIDENCE:
                confidence = top_candidate["confidence"]
                status = "needs_review"
                stats["needs_review"] += 1
            else:
                status = "unmatched"
                stats["unmatched"] += 1

        if existing:
            existing.raw_title = filename
            existing.cleaned_title = game_title
            existing.relative_path = rel
            existing.format_category = format_cat
            existing.filesize = filesize
            existing.sha256_head = sha256
            existing.media_item = matched_media
            existing.confidence = confidence
            existing.match_status = status
            existing.candidates = candidates
            existing.last_seen_at = timezone.now()
            existing.save()
        else:
            GameMatchRecord.objects.create(
                user=user,
                storage_share=storage_share,
                node=node,
                canonical_key=canonical_key,
                raw_title=filename,
                cleaned_title=game_title,
                relative_path=rel,
                format_category=format_cat,
                filesize=filesize,
                sha256_head=sha256,
                media_item=matched_media,
                confidence=confidence,
                match_status=status,
                candidates=candidates,
                user_override=False,
            )

        # Upsert relational UserGame and NodeGameSource
        try:
            from apps.library.models.game_source import NodeGameSource, UserGame

            clean_game_title = (game_title or filename or "Unknown Game").strip()
            platform = f.get("platform") or "pc"
            cover_url = f.get("cover_image_url") or getattr(matched_media, "poster_url", "") or ""

            # Check for PS Title ID
            haystack = f"{rel} {filename} {fp} {game_title}"
            ps_match = re.search(r"\b((?:PPSA|ELJS|ECAS|CUSA)\d{5})\b", haystack, re.IGNORECASE)
            extracted_title_id = f.get("title_id") or f.get("titleId") or f.get("ps_id") or (ps_match.group(1).upper() if ps_match else "")
            if extracted_title_id:
                if str(extracted_title_id).upper().startswith(("PPSA", "ELJS", "ECAS")) and platform in ("pc", "iso", "rom", "unknown"):
                    platform = "ps5"
                elif str(extracted_title_id).upper().startswith("CUSA") and platform in ("pc", "iso", "rom", "unknown"):
                    platform = "ps4"

            # Group under canonical UserGame: check media_item first, then clean_title
            user_game = None
            if matched_media:
                user_game = UserGame.objects.filter(
                    user=user,
                    media_item=matched_media,
                    platform=platform,
                ).first()

            if not user_game:
                user_game = UserGame.objects.filter(
                    user=user,
                    clean_title=clean_game_title,
                    platform=platform,
                ).first()

            if not user_game:
                user_game, _ = UserGame.objects.get_or_create(
                    user=user,
                    clean_title=clean_game_title,
                    platform=platform,
                    defaults={
                        "media_item": matched_media,
                        "cover_image_url": cover_url,
                    },
                )
            else:
                updated_fields = []
                if matched_media and user_game.media_item != matched_media:
                    user_game.media_item = matched_media
                    updated_fields.append("media_item")
                if not user_game.cover_image_url and cover_url:
                    user_game.cover_image_url = cover_url
                    updated_fields.append("cover_image_url")
                if updated_fields:
                    updated_fields.append("updated_at")
                    user_game.save(update_fields=updated_fields)

            source_state = "installed"
            if format_cat in ("installer", "setup"):
                source_state = "installer"
            elif format_cat in ("iso", "image"):
                source_state = "iso"
            elif format_cat in ("rom", "emulator"):
                source_state = "rom"
            elif format_cat in ("archive", "zip", "rar", "7z"):
                source_state = "archive"

            NodeGameSource.objects.update_or_create(
                node=node,
                canonical_path=fp or rel,
                defaults={
                    "user_game": user_game,
                    "storage_share": storage_share,
                    "relative_path": rel,
                    "source_state": source_state,
                    "file_size": filesize,
                    "sha256_head": sha256,
                    "is_available": True,
                    "format_details": {
                        "exePath": f.get("exe_path") or f.get("executable") or "",
                        "formatCategory": format_cat,
                        "candidatesCount": len(candidates),
                        "confidence": confidence,
                        "titleId": str(extracted_title_id).upper() if extracted_title_id else "",
                        "ps_id": str(extracted_title_id).upper() if extracted_title_id else "",
                    },
                },
            )
        except Exception:
            logger.exception("Failed to upsert UserGame/NodeGameSource during manifest sync")

    # Prune records for this node that are no longer present on disk/in the manifest
    if prune:
        GameMatchRecord.objects.filter(node=node, user=user).exclude(canonical_key__in=seen_keys).delete()
        try:
            from apps.library.models.game_source import NodeGameSource

            valid_paths = [f.get("filepath") or f.get("relative_path") or f.get("filename") for f in files]
            NodeGameSource.objects.filter(node=node).exclude(canonical_path__in=valid_paths).delete()
        except Exception:
            pass

    return stats


def confirm_match(
    user,
    record_id: int,
    media_item_id: str | int,
    title_id: str | None = None,
    ps_id: str | None = None,
) -> GameMatchRecord:
    """Manually link a game match record to a catalog media item."""
    record = GameMatchRecord.objects.get(id=record_id, user=user)
    media = None
    try:
        media = MediaItem.objects.filter(id=int(media_item_id)).first()
    except (ValueError, TypeError):
        pass
    if not media:
        ext = ExternalID.objects.filter(external_id=str(media_item_id)).first()
        if ext and isinstance(ext.content_object, MediaItem):
            media = ext.content_object
    if not media:
        media = MediaItem.objects.filter(slug=str(media_item_id)).first()
    if not media:
        raw_id_str = str(media_item_id).strip()
        igdb_id = None
        if raw_id_str.startswith("igdb:"):
            igdb_id = raw_id_str.split(":", 1)[1]
        elif raw_id_str.isdigit():
            igdb_id = raw_id_str
        if igdb_id and igdb_id.isdigit():
            try:
                from apps.media.services import imports as import_service
                media = import_service.import_igdb_game(int(igdb_id))
            except Exception as e:
                logger.warning("Failed to import IGDB game %s: %s", igdb_id, e)
    if not media:
        raise MediaItem.DoesNotExist(f"MediaItem {media_item_id} not found")

    # Resolve PS ID / Title ID
    resolved_ps_id = (title_id or ps_id or "").strip().upper()
    if not resolved_ps_id:
        haystack = f"{record.relative_path} {record.raw_title} {record.cleaned_title} {record.canonical_key}"
        m = re.search(r"\b((?:PPSA|ELJS|ECAS|CUSA)\d{5})\b", haystack, re.IGNORECASE)
        if m:
            resolved_ps_id = m.group(1).upper()

    from apps.library.models.game_source import NodeGameSource, UserGame
    source = (
        NodeGameSource.objects.filter(
            user_game__user=user,
            canonical_path=record.relative_path,
        ).first()
        or NodeGameSource.objects.filter(
            user_game__user=user,
            relative_path=record.relative_path,
        ).first()
    )
    if not resolved_ps_id and source and isinstance(source.format_details, dict):
        resolved_ps_id = (source.format_details.get("titleId") or source.format_details.get("ps_id") or "").strip().upper()

    # Update or create external_id rows on the matched MediaItem
    if resolved_ps_id:
        ct = ContentType.objects.get_for_model(MediaItem)
        for prov in ("playstation", "ps_id"):
            ExternalID.objects.update_or_create(
                content_type=ct,
                object_id=media.id,
                provider=prov,
                media_type="game",
                defaults={"external_id": resolved_ps_id},
            )

    record.media_item = media
    record.match_status = "matched"
    record.confidence = 1.0
    record.user_override = True
    record.save(
        update_fields=["media_item", "match_status", "confidence", "user_override", "updated_at"]
    )

    # Link relational UserGame and update NodeGameSource
    try:
        sources = NodeGameSource.objects.filter(
            user_game__user=user,
        ).filter(
            Q(canonical_path=record.relative_path)
            | Q(relative_path=record.relative_path)
            | Q(user_game__clean_title=record.cleaned_title)
        )
        for src in sources:
            ug = src.user_game
            ug_updates = []
            if ug.media_item != media:
                ug.media_item = media
                ug_updates.append("media_item")
            if not ug.cover_image_url and getattr(media, "poster_url", ""):
                ug.cover_image_url = media.poster_url
                ug_updates.append("cover_image_url")
            if resolved_ps_id:
                if resolved_ps_id.startswith(("PPSA", "ELJS", "ECAS")) and ug.platform in ("pc", "iso", "rom", "unknown"):
                    ug.platform = "ps5"
                    ug_updates.append("platform")
                elif resolved_ps_id.startswith("CUSA") and ug.platform in ("pc", "iso", "rom", "unknown"):
                    ug.platform = "ps4"
                    ug_updates.append("platform")
            if ug_updates:
                ug_updates.append("updated_at")
                ug.save(update_fields=ug_updates)
            if resolved_ps_id and isinstance(src.format_details, dict):
                src.format_details["titleId"] = resolved_ps_id
                src.format_details["ps_id"] = resolved_ps_id
                src.save(update_fields=["format_details", "updated_at"])
    except Exception:
        logger.exception("Failed to update UserGame/NodeGameSource on confirm_match")

    return record


def unmatch_record(user, record_id: int) -> GameMatchRecord:
    """Remove a game's catalog match and mark as unmatched/ignored."""
    record = GameMatchRecord.objects.get(id=record_id, user=user)
    record.media_item = None
    record.match_status = "unmatched"
    record.confidence = 0.0
    record.user_override = True
    record.save(
        update_fields=["media_item", "match_status", "confidence", "user_override", "updated_at"]
    )
    return record
