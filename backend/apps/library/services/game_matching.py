"""Pure database game matching, multi-node correlation, and match review service."""

from __future__ import annotations

import logging
import re
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.library.models import GameMatchRecord, NodeLibraryPath, StorageShare, UserNode
from apps.library.services.server_catalog import (
    folder_titles_from_path,
    is_addon_title,
    title_keys_for_file,
)
from apps.media.models import MediaItem
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
    if sha256_head and sha256_head != "0000000000000000000000000000000000000000000000000000000000000000":
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

    norm_target = _comparison_key(title).lower().strip()
    scored: list[tuple[float, MediaItem]] = []

    for item in items:
        item_norm = _comparison_key(item.title).lower().strip()
        score = 0.0

        if item_norm == norm_target:
            score = 1.0
        elif norm_target and (item_norm.startswith(norm_target) or norm_target.startswith(item_norm)):
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
        candidates.append({
            "media_id": str(item.id),
            "title": item.title,
            "slug": item.slug,
            "poster_url": getattr(item, "poster_url", "") or "",
            "backdrop_url": getattr(item, "backdrop_url", "") or "",
            "release_year": item.release_date.year if item.release_date else None,
            "confidence": round(score, 3),
        })

    return candidates


def sync_node_manifest(node: UserNode, files: list[dict[str, Any]]) -> dict[str, int]:
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
        return stats

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

        existing = GameMatchRecord.objects.filter(user=user, canonical_key=canonical_key).first()

        if existing and existing.user_override:
            # Preserve user's manual match choice
            stats["preserved_overrides"] += 1
            existing.filesize = filesize
            existing.sha256_head = sha256
            existing.last_seen_at = timezone.now()
            existing.save(update_fields=["filesize", "sha256_head", "last_seen_at", "updated_at"])
            continue

        candidates = find_matching_candidates(game_title, filename, rel, limit=5)
        top_candidate = candidates[0] if candidates else None

        matched_media = None
        confidence = 0.0
        status = "unmatched"

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

    return stats


def confirm_match(user, record_id: int, media_item_id: str | int) -> GameMatchRecord:
    """Manually link a game match record to a catalog media item."""
    record = GameMatchRecord.objects.get(id=record_id, user=user)
    media = MediaItem.objects.get(id=media_item_id)
    record.media_item = media
    record.match_status = "matched"
    record.confidence = 1.0
    record.user_override = True
    record.save(update_fields=["media_item", "match_status", "confidence", "user_override", "updated_at"])
    return record


def unmatch_record(user, record_id: int) -> GameMatchRecord:
    """Remove a game's catalog match and mark as unmatched/ignored."""
    record = GameMatchRecord.objects.get(id=record_id, user=user)
    record.media_item = None
    record.match_status = "unmatched"
    record.confidence = 0.0
    record.user_override = True
    record.save(update_fields=["media_item", "match_status", "confidence", "user_override", "updated_at"])
    return record
