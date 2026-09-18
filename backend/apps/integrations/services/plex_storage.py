"""Plex storage optimization and savings recommendation service.

Analyzes linked Plex servers (specifically owned servers) to give owners
visibility into their storage footprint and actionable opportunities to save
disk space (e.g. duplicate versions, transcode candidates, unwatched dead weight,
and watched TV series).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from django.core.cache import cache
from django.utils import timezone as dj_timezone

from apps.integrations.models import UserPlexItem, UserPlexServer

logger = logging.getLogger(__name__)

# Codecs considered legacy or uncompressed compared to HEVC / AV1
TRANSCODE_CANDIDATE_CODECS = {
    "h264": {"label": "H.264 (AVC)", "savings_ratio": 0.45},
    "avc": {"label": "H.264 (AVC)", "savings_ratio": 0.45},
    "mpeg2video": {"label": "MPEG-2", "savings_ratio": 0.60},
    "mpeg2": {"label": "MPEG-2", "savings_ratio": 0.60},
    "vc1": {"label": "VC-1", "savings_ratio": 0.60},
    "msmpeg4": {"label": "MPEG-4 Part 2", "savings_ratio": 0.50},
    "mpeg4": {"label": "MPEG-4 Part 2", "savings_ratio": 0.50},
    "divx": {"label": "DivX", "savings_ratio": 0.50},
    "xvid": {"label": "Xvid", "savings_ratio": 0.50},
    "wmv3": {"label": "WMV", "savings_ratio": 0.50},
}

# Resolution human labels
RESOLUTION_LABELS = {
    "4k": "4K UHD",
    "2160": "4K UHD",
    "1080": "1080p HD",
    "720": "720p HD",
    "576": "576p SD",
    "480": "480p SD",
    "sd": "SD",
}


def normalize_resolution(raw_res: str | None) -> str:
    """Normalize Plex resolution strings (e.g. '1080', '4k') to a friendly name."""
    if not raw_res:
        return "Unknown"
    key = str(raw_res).lower().strip()
    return RESOLUTION_LABELS.get(key, f"{key.upper()}p" if key.isdigit() else key.upper())


def normalize_codec(raw_codec: str | None) -> str:
    """Normalize Plex video codec strings."""
    if not raw_codec:
        return "Unknown"
    key = str(raw_codec).lower().strip()
    if key in TRANSCODE_CANDIDATE_CODECS:
        return TRANSCODE_CANDIDATE_CODECS[key]["label"]
    if key in ("hevc", "h265"):
        return "HEVC (H.265)"
    if key == "av1":
        return "AV1"
    if key == "vp9":
        return "VP9"
    return key.upper()


def extract_media_parts(raw: dict | None) -> list[dict[str, Any]]:
    """Extract individual physical media files and streams from a Plex item payload."""
    if not isinstance(raw, dict):
        return []

    parts: list[dict[str, Any]] = []
    media_list = raw.get("Media") or []
    if isinstance(media_list, dict):
        media_list = [media_list]

    for media in media_list:
        if not isinstance(media, dict):
            continue
        part_list = media.get("Part") or []
        if isinstance(part_list, dict):
            part_list = [part_list]

        v_codec = str(media.get("videoCodec") or "").lower()
        v_res = str(media.get("videoResolution") or "").lower()
        a_codec = str(media.get("audioCodec") or "").lower()
        a_channels = media.get("audioChannels")

        bitrate = media.get("bitrate")
        try:
            bitrate_int = int(bitrate) if bitrate is not None else 0
        except (ValueError, TypeError):
            bitrate_int = 0

        for part in part_list:
            if not isinstance(part, dict):
                continue

            size = part.get("size")
            try:
                size_int = int(size) if size is not None else 0
            except (ValueError, TypeError):
                size_int = 0

            part_id = str(part.get("id") or "")
            file_path = str(part.get("file") or "")
            duration = part.get("duration") or media.get("duration")

            parts.append(
                {
                    "part_id": part_id,
                    "file": file_path,
                    "size": size_int,
                    "duration": duration,
                    "container": str(part.get("container") or media.get("container") or "").lower(),
                    "video_codec": v_codec,
                    "video_codec_label": normalize_codec(v_codec),
                    "video_resolution": v_res,
                    "video_resolution_label": normalize_resolution(v_res),
                    "audio_codec": a_codec,
                    "audio_channels": a_channels,
                    "bitrate": bitrate_int,
                }
            )

    return parts


def list_owned_plex_servers(user) -> list[dict[str, Any]]:
    """Return all Plex servers associated with the user, marked with ownership status.

    Prioritizes owned servers (owned=True). If no server has owned=True, all
    linked servers are returned so self-hosted setups are still usable.
    """
    servers = UserPlexServer.objects.filter(user=user).order_by("-owned", "name")
    return [
        {
            "id": server.id,
            "machine_identifier": server.machine_identifier,
            "name": server.name,
            "product": server.product,
            "platform": server.platform,
            "owned": server.owned,
            "base_url": server.base_url,
            "item_count": UserPlexItem.objects.filter(server=server).count(),
        }
        for server in servers
    ]


def _get_server_items_data(user, server_id: int | None = None) -> list[dict[str, Any]]:
    """Fetch and parse media data for a user's server from UserPlexItem and cache."""
    cache_key = f"plex_storage_items_{user.id}_{server_id or 'all'}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    qs = UserPlexItem.objects.filter(user=user).select_related("server", "library")
    if server_id is not None:
        qs = qs.filter(server_id=server_id)

    items_data: list[dict[str, Any]] = []

    for item in qs:
        raw = item.raw if isinstance(item.raw, dict) else {}
        parts = extract_media_parts(raw)
        total_size = sum(p["size"] for p in parts)

        # Added timestamp
        added_at = None
        raw_added = raw.get("addedAt")
        if raw_added:
            try:
                added_at = datetime.fromtimestamp(int(raw_added), tz=UTC)
            except (ValueError, TypeError, OSError):
                pass
        if added_at is None:
            added_at = item.created_at

        # Primary codec and resolution
        primary_codec = parts[0]["video_codec"] if parts else ""
        primary_res = parts[0]["video_resolution"] if parts else ""

        items_data.append(
            {
                "id": item.id,
                "server_id": item.server_id,
                "server_name": item.server.name,
                "library_id": item.library_id,
                "library_title": item.library.title if item.library else "Unknown",
                "library_type": item.library.library_type if item.library else item.media_type,
                "rating_key": item.rating_key,
                "title": item.title,
                "year": item.year,
                "media_type": item.media_type,
                "viewed": item.viewed,
                "view_count": item.view_count,
                "duration": item.duration,
                "last_viewed_at": item.last_viewed_at.isoformat() if item.last_viewed_at else None,
                "added_at": added_at.isoformat() if added_at else None,
                "total_size": total_size,
                "parts": parts,
                "primary_codec": primary_codec,
                "primary_codec_label": normalize_codec(primary_codec),
                "primary_resolution": primary_res,
                "primary_resolution_label": normalize_resolution(primary_res),
            }
        )

    # Cache parsed items for 5 minutes
    cache.set(cache_key, items_data, timeout=300)
    return items_data


def analyze_storage_summary(user, server_id: int | None = None) -> dict[str, Any]:
    """Calculate aggregate storage metrics, distributions, and potential savings."""
    items = _get_server_items_data(user, server_id)

    total_bytes = 0
    total_files = 0
    watched_bytes = 0
    unwatched_bytes = 0

    lib_breakdown: dict[str, dict[str, Any]] = {}
    res_breakdown: dict[str, dict[str, Any]] = {}
    codec_breakdown: dict[str, dict[str, Any]] = {}

    # Category counters
    duplicate_items_count = 0
    duplicate_reclaimable_bytes = 0

    transcode_candidates_count = 0
    transcode_savings_bytes = 0

    unwatched_candidates_count = 0
    unwatched_reclaimable_bytes = 0

    watched_shows_count = 0
    watched_shows_bytes = 0

    now = dj_timezone.now()
    six_months_seconds = 180 * 86400

    # For cross-item duplicates detection (same title & year)
    title_year_groups: dict[str, list[dict[str, Any]]] = {}

    for it in items:
        size = it["total_size"]
        parts = it["parts"]
        num_parts = len(parts)

        total_bytes += size
        total_files += num_parts

        if it["view_count"] > 0 or it["viewed"]:
            watched_bytes += size
        else:
            unwatched_bytes += size

        # Library breakdown
        lib_key = str(it["library_id"])
        if lib_key not in lib_breakdown:
            lib_breakdown[lib_key] = {
                "library_id": it["library_id"],
                "title": it["library_title"],
                "library_type": it["library_type"],
                "total_bytes": 0,
                "file_count": 0,
                "item_count": 0,
            }
        lib_breakdown[lib_key]["total_bytes"] += size
        lib_breakdown[lib_key]["file_count"] += num_parts
        lib_breakdown[lib_key]["item_count"] += 1

        # Resolution & Codec breakdown per part
        for part in parts:
            p_size = part["size"]
            r_label = part["video_resolution_label"]
            if r_label not in res_breakdown:
                res_breakdown[r_label] = {"resolution": r_label, "total_bytes": 0, "file_count": 0}
            res_breakdown[r_label]["total_bytes"] += p_size
            res_breakdown[r_label]["file_count"] += 1

            c_label = part["video_codec_label"]
            if c_label not in codec_breakdown:
                codec_breakdown[c_label] = {"codec": c_label, "total_bytes": 0, "file_count": 0}
            codec_breakdown[c_label]["total_bytes"] += p_size
            codec_breakdown[c_label]["file_count"] += 1

        # 1. Multi-version / Duplicate parts in single item
        if len(parts) > 1 and size > 0:
            part_sizes = [p["size"] for p in parts]
            reclaimable = sum(part_sizes) - max(part_sizes)
            if reclaimable > 0:
                duplicate_items_count += 1
                duplicate_reclaimable_bytes += reclaimable

        # Group for cross-item title/year duplicates
        norm_title = it["title"].strip().lower()
        if norm_title and it["year"]:
            group_key = f"{norm_title}_{it['year']}_{it['media_type']}"
            title_year_groups.setdefault(group_key, []).append(it)

        # 2. Transcode opportunities
        p_codec = it["primary_codec"]
        if p_codec in TRANSCODE_CANDIDATE_CODECS and size >= 1_000_000_000:  # >= 1GB
            rule = TRANSCODE_CANDIDATE_CODECS[p_codec]
            savings = int(size * rule["savings_ratio"])
            transcode_candidates_count += 1
            transcode_savings_bytes += savings

        # 3. Dead weight / Unwatched (added > 180 days ago, never played)
        if it["view_count"] == 0 and not it["viewed"]:
            added_dt = None
            if it.get("added_at"):
                try:
                    added_dt = datetime.fromisoformat(it["added_at"])
                except (ValueError, TypeError):
                    pass
            is_old = False
            if added_dt:
                is_old = (now - added_dt).total_seconds() >= six_months_seconds
            else:
                is_old = True

            if is_old and size > 0:
                unwatched_candidates_count += 1
                unwatched_reclaimable_bytes += size

        # 4. Watched TV Series
        if it["media_type"] == "show" and (it["viewed"] or it["view_count"] > 0) and size > 0:
            watched_shows_count += 1
            watched_shows_bytes += size

    total_potential_savings = (
        duplicate_reclaimable_bytes + transcode_savings_bytes + (unwatched_reclaimable_bytes // 2)
    )

    return {
        "server_id": server_id,
        "total_bytes": total_bytes,
        "total_files": total_files,
        "total_items": len(items),
        "potential_savings_bytes": total_potential_savings,
        "watch_status": {
            "watched_bytes": watched_bytes,
            "unwatched_bytes": unwatched_bytes,
        },
        "breakdown_by_library": sorted(
            lib_breakdown.values(), key=lambda x: x["total_bytes"], reverse=True
        ),
        "breakdown_by_resolution": sorted(
            res_breakdown.values(), key=lambda x: x["total_bytes"], reverse=True
        ),
        "breakdown_by_codec": sorted(
            codec_breakdown.values(), key=lambda x: x["total_bytes"], reverse=True
        ),
        "categories_summary": {
            "duplicates": {
                "count": duplicate_items_count,
                "reclaimable_bytes": duplicate_reclaimable_bytes,
            },
            "transcode": {
                "count": transcode_candidates_count,
                "estimated_savings_bytes": transcode_savings_bytes,
            },
            "unwatched": {
                "count": unwatched_candidates_count,
                "reclaimable_bytes": unwatched_reclaimable_bytes,
            },
            "watched_shows": {
                "count": watched_shows_count,
                "total_bytes": watched_shows_bytes,
            },
        },
    }


def get_storage_recommendations(
    user,
    server_id: int | None = None,
    category: str = "duplicates",
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """Return filtered, ranked items for a specific savings category."""
    items = _get_server_items_data(user, server_id)
    now = dj_timezone.now()
    six_months_seconds = 180 * 86400

    results: list[dict[str, Any]] = []

    if category == "duplicates":
        for it in items:
            parts = it["parts"]
            if len(parts) > 1 and it["total_size"] > 0:
                sizes = [p["size"] for p in parts]
                max_size = max(sizes)
                reclaimable = sum(sizes) - max_size
                results.append(
                    {
                        **it,
                        "reclaimable_bytes": reclaimable,
                        "primary_file": next(p for p in parts if p["size"] == max_size),
                        "redundant_files": [p for p in parts if p["size"] != max_size],
                    }
                )
        results.sort(key=lambda x: x.get("reclaimable_bytes", 0), reverse=True)

    elif category == "transcode":
        for it in items:
            p_codec = it["primary_codec"]
            size = it["total_size"]
            if p_codec in TRANSCODE_CANDIDATE_CODECS and size >= 500_000_000:  # >= 500MB
                rule = TRANSCODE_CANDIDATE_CODECS[p_codec]
                savings = int(size * rule["savings_ratio"])
                est_new_size = size - savings
                results.append(
                    {
                        **it,
                        "current_codec": rule["label"],
                        "target_codec": "HEVC (H.265)",
                        "estimated_savings_bytes": savings,
                        "estimated_new_size": est_new_size,
                        "savings_percentage": int(rule["savings_ratio"] * 100),
                    }
                )
        results.sort(key=lambda x: x.get("estimated_savings_bytes", 0), reverse=True)

    elif category == "unwatched":
        for it in items:
            if it["view_count"] == 0 and not it["viewed"] and it["total_size"] > 0:
                added_dt = None
                if it.get("added_at"):
                    try:
                        added_dt = datetime.fromisoformat(it["added_at"])
                    except (ValueError, TypeError):
                        pass
                is_old = False
                days_since_added = None
                if added_dt:
                    diff_seconds = (now - added_dt).total_seconds()
                    days_since_added = int(diff_seconds // 86400)
                    is_old = diff_seconds >= six_months_seconds
                else:
                    is_old = True

                if is_old:
                    results.append(
                        {
                            **it,
                            "days_since_added": days_since_added,
                            "reclaimable_bytes": it["total_size"],
                        }
                    )
        results.sort(key=lambda x: x["total_size"], reverse=True)

    elif category == "watched_shows":
        for it in items:
            if (
                it["media_type"] == "show"
                and (it["viewed"] or it["view_count"] > 0)
                and it["total_size"] > 0
            ):
                results.append(
                    {
                        **it,
                        "reclaimable_bytes": it["total_size"],
                    }
                )
        results.sort(key=lambda x: x["total_size"], reverse=True)

    elif category == "largest_files":
        for it in items:
            if it["total_size"] > 0:
                results.append(
                    {
                        **it,
                        "file_count": len(it["parts"]),
                    }
                )
        results.sort(key=lambda x: x["total_size"], reverse=True)

    total_count = len(results)
    sliced = results[offset : offset + limit]

    return {
        "category": category,
        "total_count": total_count,
        "items": sliced,
    }


def refresh_server_storage_cache(user, server_id: int | None = None) -> None:
    """Clear cached items data to trigger re-aggregation."""
    cache_key = f"plex_storage_items_{user.id}_{server_id or 'all'}"
    cache.delete(cache_key)
    cache.delete(f"plex_storage_items_{user.id}_all")
