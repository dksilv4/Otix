"""In-process game library indexer for the Django backend node."""

from __future__ import annotations

import os
import threading
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from apps.library.services.node_fs import (
    SKIP_EXTENSIONS,
    compute_head_hash,
    determine_format_category,
    file_id_for_path,
    relative_library_path,
    title_from_installer_path,
)

_lock = threading.RLock()
_files_by_id: dict[str, HostedFile] = {}
_last_scan_at: datetime | None = None


@dataclass
class HostedFile:
    id: str
    filename: str
    filepath: str
    relative_path: str
    filesize: int
    sha256_head: str
    extension: str
    format_category: str
    library_name: str
    game_title: str
    modified_at: str

    def as_api_dict(self) -> dict[str, Any]:
        return asdict(self)


def _normalize_libraries(raw: list | None) -> list[dict[str, Any]]:
    libraries: list[dict[str, Any]] = []
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "").strip()
        if not path:
            continue
        kind = str(item.get("kind") or item.get("type") or "game").strip().lower()
        name = str(item.get("name") or "").strip() or Path(path).name or kind
        allowed = item.get("allowed_extensions") or item.get("allowedExtensions") or []
        if not isinstance(allowed, list):
            allowed = []
        if not allowed and kind == "iso":
            allowed = [".iso", ".img", ".chd", ".rvz", ".nkit", ".cso"]
        libraries.append(
            {
                "name": name,
                "path": path,
                "kind": kind if kind in ("game", "iso") else "game",
                "allowed_extensions": [str(ext).lower() for ext in allowed if ext],
            }
        )
    return libraries


def libraries_for_user(user) -> list[dict[str, Any]]:
    from apps.library.services.node_connections import get_or_create_connections

    row = get_or_create_connections(user)
    return _normalize_libraries(row.libraries if isinstance(row.libraries, list) else [])


def scan_libraries(libraries: list[dict[str, Any]] | None = None) -> list[HostedFile]:
    """Scan library folders and replace the in-process index."""
    global _last_scan_at
    libs = _normalize_libraries(libraries)
    indexed: list[HostedFile] = []
    by_id: dict[str, HostedFile] = {}

    for lib in libs:
        lib_path = Path(lib["path"])
        allowed = {ext.lower() for ext in lib.get("allowed_extensions") or []}
        try:
            if not lib_path.exists():
                continue
        except (OSError, ValueError):
            continue

        for root, _, files in os.walk(lib_path):
            for filename in files:
                ext = Path(filename).suffix.lower()
                if ext in SKIP_EXTENSIONS:
                    continue
                if allowed and ext not in allowed:
                    continue
                full_path = str(Path(root) / filename)
                try:
                    stat = os.stat(full_path)
                    hosted = HostedFile(
                        id=file_id_for_path(full_path),
                        filename=filename,
                        filepath=full_path,
                        relative_path=relative_library_path(full_path, str(lib_path)),
                        filesize=stat.st_size,
                        sha256_head=compute_head_hash(full_path),
                        extension=ext,
                        format_category=determine_format_category(ext),
                        library_name=lib["name"],
                        game_title=title_from_installer_path(filename, full_path, str(lib_path)),
                        modified_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
                    )
                    indexed.append(hosted)
                    by_id[hosted.id] = hosted
                except OSError:
                    continue

    with _lock:
        _files_by_id.clear()
        _files_by_id.update(by_id)
        _last_scan_at = datetime.now(tz=UTC)
    return indexed


def scan_user_libraries(user) -> list[HostedFile]:
    return scan_libraries(libraries_for_user(user))


def list_indexed_files(*, ensure_scanned: bool = True, user=None) -> list[HostedFile]:
    with _lock:
        empty = not _files_by_id
        files = list(_files_by_id.values())
    if empty and ensure_scanned and user is not None:
        return scan_user_libraries(user)
    return files


def get_hosted_file(file_id: str) -> HostedFile | None:
    with _lock:
        return _files_by_id.get(file_id)


def index_stats() -> dict[str, Any]:
    with _lock:
        return {
            "total_files": len(_files_by_id),
            "last_scan_at": _last_scan_at.isoformat() if _last_scan_at else None,
        }


def clear_index() -> None:
    global _last_scan_at
    with _lock:
        _files_by_id.clear()
        _last_scan_at = None
