"""Match, hydrate, and write `.otix` sidecars on Otix Node libraries."""

from __future__ import annotations

import logging
import os
from typing import Any

from django.contrib.auth.models import AbstractBaseUser

from apps.library.models import UserNode
from apps.library.services.node import usenet_proxy_request
from apps.library.services.server_catalog import (
    is_addon_title,
    match_files_to_catalog,
    unmatched_scan_titles,
)
from apps.media.serializers.catalog import MediaItemDetailSerializer
from apps.media.services.catalog import attach_media_urls, media_detail_queryset
from apps.media.services.imports import match_games_payload
from apps.search.services.search import enqueue_prehydrate_titles

logger = logging.getLogger(__name__)

UserGameServer = UserNode

AUTO_MATCH_MIN_CONFIDENCE = 0.85


def node_get_otix_settings(server: UserGameServer) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "GET", "/api/v1/otix/settings", timeout=6.0)


def node_save_otix_settings(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "POST", "/api/v1/otix/settings", json=payload, timeout=8.0)


def node_write_otix(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "POST", "/api/v1/otix/write", json=payload, timeout=120.0)


def _image_ref(url: str | None) -> dict:
    return {"url": url or "", "local": None}


def _sidecar_from_detail(
    *,
    detail: dict,
    confidence: float,
    match_source: str,
    exe_relative: str | None = None,
) -> dict:
    genres = detail.get("genres") or []
    companies = []
    for row in detail.get("involved_companies") or []:
        company = row.get("company") if isinstance(row, dict) else None
        if isinstance(company, dict):
            companies.append(
                {
                    "id": company.get("id"),
                    "name": company.get("name"),
                    "slug": company.get("slug"),
                    "developer": row.get("developer"),
                    "publisher": row.get("publisher"),
                }
            )
    platforms = []
    for row in detail.get("platforms") or []:
        platform = row.get("platform") if isinstance(row, dict) else None
        if isinstance(platform, dict):
            platforms.append(
                {
                    "id": platform.get("id"),
                    "name": platform.get("name"),
                    "slug": platform.get("slug"),
                }
            )
        elif isinstance(row, dict) and row.get("name"):
            platforms.append({"name": row.get("name"), "slug": row.get("slug")})

    return {
        "version": 1,
        "mediaId": str(detail.get("id") or ""),
        "igdbId": str(detail.get("igdb_id") or "") if detail.get("igdb_id") else "",
        "title": detail.get("title") or "",
        "slug": detail.get("slug") or "",
        "confidence": confidence,
        "matchSource": match_source,
        "overview": detail.get("overview") or "",
        "genres": genres,
        "companies": companies,
        "platforms": platforms,
        "images": {
            "poster": _image_ref(detail.get("poster_url")),
            "backdrop": _image_ref(detail.get("backdrop_url")),
            "logo": _image_ref(detail.get("logo_url")),
            "textlessPoster": _image_ref(detail.get("textless_poster_url")),
            "icon": _image_ref(detail.get("icon_url")),
        },
        "exeRelative": exe_relative or "",
    }


def _hydrate_detail(media_id: int) -> dict | None:
    item = media_detail_queryset(media_id)
    if item is None:
        return None
    attach_media_urls([item])
    return MediaItemDetailSerializer(item).data


def sync_otix_sidecars(
    server: UserGameServer,
    *,
    download_images: bool | None = None,
    write_otix: bool | None = None,
) -> tuple[int, dict]:
    """Fetch node files, match/hydrate, and write `.otix` sidecars."""
    settings_status, settings_data = node_get_otix_settings(server)
    prefs: dict[str, Any] = settings_data if isinstance(settings_data, dict) else {}
    if write_otix is None:
        write_otix = bool(prefs.get("write_otix_after_scan", True))
    if download_images is None:
        download_images = bool(prefs.get("download_otix_images", False))

    if not write_otix:
        return 200, {
            "status": "skipped",
            "reason": "write_otix_after_scan disabled",
            "written": 0,
            "matched": 0,
            "failed": [],
        }

    # Ensure the in-memory index is fresh before matching.
    usenet_proxy_request(server, "POST", "/api/v1/scan", params={"wait": "1"}, timeout=300.0)

    files_status, files_data = usenet_proxy_request(server, "GET", "/api/v1/files", timeout=30.0)
    if files_status >= 400:
        return files_status, files_data if isinstance(files_data, dict) else {"detail": files_data}
    files = files_data if isinstance(files_data, list) else []
    if not files:
        return 200, {"status": "ok", "written": 0, "matched": 0, "failed": []}

    # Skip updates/DLC for sidecar writes (base releases only).
    base_files = [
        f
        for f in files
        if isinstance(f, dict)
        and not is_addon_title(f.get("filename"), f.get("game_title"))
        and (f.get("format_category") or "") != "update"
    ]

    match_files_to_catalog(base_files)

    unmatched = [f for f in base_files if not f.get("catalog_item") and not f.get("otix_media_id")]
    titles = unmatched_scan_titles(unmatched)
    if titles:
        enqueue_prehydrate_titles(titles)

    batch_games = []
    for f in unmatched:
        title = (f.get("game_title") or f.get("filename") or "").strip()
        if not title:
            continue
        batch_games.append(
            {
                "query_id": str(f.get("id") or title),
                "title": title,
                "platform": None,
            }
        )
    auto_by_query: dict[str, dict] = {}
    if batch_games:
        try:
            envelope = match_games_payload(batch_games)
            for row in envelope.get("matches") or []:
                auto = row.get("auto_match")
                if not auto or not auto.get("media_item_id"):
                    continue
                confidence = float(auto.get("confidence") or 0)
                if confidence < AUTO_MATCH_MIN_CONFIDENCE:
                    continue
                auto_by_query[str(row.get("query_id") or "")] = auto
        except Exception:  # noqa: BLE001
            logger.exception("otix sync batch match failed")

    items: list[dict] = []
    matched = 0
    for f in base_files:
        file_id = str(f.get("id") or "")
        media_id = None
        confidence = float(f.get("otix_confidence") or 1.0)
        match_source = "sidecar" if f.get("otix_media_id") else "catalog"

        catalog = f.get("catalog_item")
        if isinstance(catalog, dict) and catalog.get("id"):
            try:
                media_id = int(catalog["id"])
            except (TypeError, ValueError):
                media_id = None
            match_source = "catalog"
            confidence = max(confidence, 0.95)
        elif file_id in auto_by_query:
            auto = auto_by_query[file_id]
            try:
                media_id = int(auto["media_item_id"])
            except (TypeError, ValueError):
                media_id = None
            confidence = float(auto.get("confidence") or 0)
            match_source = "batch"
        elif f.get("otix_media_id"):
            try:
                media_id = int(f["otix_media_id"])
            except (TypeError, ValueError):
                media_id = None

        if media_id is None:
            continue

        detail = _hydrate_detail(media_id)
        if not detail:
            continue

        matched += 1
        filename = f.get("filename") or ""
        exe_relative = "" if filename.lower().endswith(".otix") else filename
        sidecar = _sidecar_from_detail(
            detail=detail,
            confidence=confidence,
            match_source=match_source,
            exe_relative=exe_relative,
        )
        items.append(
            {
                "file_id": file_id,
                "filepath": f.get("filepath") or "",
                "sidecar": sidecar,
            }
        )

    if not items:
        return 200, {
            "status": "ok",
            "written": 0,
            "matched": 0,
            "failed": [],
            "message": "No matched games to write",
        }

    write_status, write_data = node_write_otix(
        server,
        {
            "download_images": bool(download_images),
            "items": items,
        },
    )
    if not isinstance(write_data, dict):
        write_data = {"detail": write_data}
    write_data.setdefault("matched", matched)
    write_data.setdefault("status", "ok" if write_status < 400 else "error")
    return write_status, write_data


def node_match_and_write_otix(
    server: UserGameServer,
    *,
    media_id: int | str,
    file_id: str | None = None,
    filepath: str | None = None,
    confidence: float | None = 1.0,
    download_images: bool | None = None,
    user: AbstractBaseUser | None = None,
) -> tuple[int, dict]:
    """Manually match a file/game on a node and persist its .otix sidecar."""
    try:
        int_media_id = int(media_id)
    except (TypeError, ValueError):
        return 400, {"detail": "Invalid media_id"}

    detail = _hydrate_detail(int_media_id)
    if not detail:
        return 404, {"detail": f"Media item {media_id} not found in catalog"}

    if download_images is None:
        settings_status, settings_data = node_get_otix_settings(server)
        prefs = settings_data if settings_status == 200 and isinstance(settings_data, dict) else {}
        download_images = bool(prefs.get("download_otix_images", False))

    filename = os.path.basename(filepath) if filepath else ""
    exe_relative = "" if filename.lower().endswith(".otix") else filename

    sidecar = _sidecar_from_detail(
        detail=detail,
        confidence=float(confidence or 1.0),
        match_source="manual",
        exe_relative=exe_relative,
    )

    item: dict = {"sidecar": sidecar}
    if file_id:
        item["file_id"] = str(file_id)
    if filepath:
        item["filepath"] = str(filepath)

    write_status, write_data = node_write_otix(
        server,
        {
            "items": [item],
            "download_images": bool(download_images),
            "write_otix": True,
        },
    )

    if user and user.is_authenticated:
        try:
            from apps.media.services.imports import _enqueue_local_game_mirror
            from apps.media.services.interaction import set_interaction

            set_interaction(user, int_media_id, "owned")
            _enqueue_local_game_mirror(int_media_id)
        except Exception:
            logger.exception("Failed to record owned interaction on manual match")

    if not isinstance(write_data, dict):
        write_data = {"detail": write_data}

    return write_status, {
        "status": "ok" if write_status < 400 else "error",
        "sidecar": sidecar,
        "catalog_item": detail,
        "node_response": write_data,
    }
