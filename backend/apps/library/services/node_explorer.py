"""Directory explorer for the Django backend node."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from apps.library.services.node_fs import (
    determine_format_category,
    disk_usage,
    resolve_explorer_path,
    sanitize_folder_name,
)


def _folder_entry(path: Path, is_download_location: bool = False) -> dict[str, Any]:
    return {
        "name": path.name or str(path),
        "path": str(path),
        "is_dir": True,
        "size": 0,
        "extension": "",
        "format_category": "folder",
        "is_downloadable": False,
        "is_download_location": is_download_location,
    }


def browse_directory(
    path: str | None = None,
    *,
    active_download_path: str = "",
    extra_library_paths: list[str] | None = None,
    base_dir: Path | None = None,
) -> dict[str, Any]:
    root = (base_dir or Path.cwd()).resolve()
    target = resolve_explorer_path(path, root)
    if not target.exists():
        raise FileNotFoundError(f"Directory not found: {target}")
    if not target.is_dir():
        raise NotADirectoryError(f"Path is not a directory: {target}")

    parent_path = None if target == target.parent or target == root else str(target.parent)
    is_root = parent_path is None

    resolved_active = None
    if active_download_path:
        try:
            resolved_active = Path(active_download_path).resolve()
        except OSError:
            resolved_active = None

    entries: list[dict[str, Any]] = []
    with os.scandir(target) as iterator:
        for entry in iterator:
            try:
                is_dir = entry.is_dir(follow_symlinks=False)
                stat = entry.stat(follow_symlinks=False)
                mod_time = datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat()
                entry_path = str(Path(entry.path).resolve())
                if is_dir:
                    entries.append(
                        {
                            "name": entry.name,
                            "path": entry_path,
                            "is_dir": True,
                            "size": 0,
                            "extension": "",
                            "format_category": "folder",
                            "modified_at": mod_time,
                            "is_downloadable": False,
                            "is_download_location": resolved_active is not None
                            and Path(entry_path) == resolved_active,
                        }
                    )
                else:
                    ext = Path(entry.name).suffix.lower()
                    category = determine_format_category(ext)
                    downloadable = category in ("iso", "installer", "archive", "rom") or ext in {
                        ".exe",
                        ".zip",
                        ".iso",
                        ".rar",
                        ".7z",
                        ".bin",
                        ".tar",
                        ".gz",
                    }
                    entries.append(
                        {
                            "name": entry.name,
                            "path": entry_path,
                            "is_dir": False,
                            "size": stat.st_size,
                            "extension": ext,
                            "format_category": category,
                            "modified_at": mod_time,
                            "is_downloadable": downloadable,
                            "is_download_location": False,
                        }
                    )
            except OSError:
                continue

    if is_root and extra_library_paths:
        existing = {Path(item["path"]).resolve() for item in entries}
        for raw in extra_library_paths:
            try:
                folder = Path(raw)
                if not folder.exists():
                    continue
                if not folder.is_dir():
                    folder = folder.parent
                resolved = folder.resolve()
                if resolved in existing:
                    continue
                entries.append(_folder_entry(resolved))
                existing.add(resolved)
            except OSError:
                continue

    entries.sort(key=lambda item: (0 if item["is_dir"] else 1, item["name"].lower()))
    free_bytes, total_bytes = disk_usage(target)
    return {
        "current_path": str(target),
        "parent_path": parent_path,
        "is_root": is_root,
        "entries": entries,
        "active_download_path": active_download_path,
        "total_items": len(entries),
        "disk_free_bytes": free_bytes,
        "disk_total_bytes": total_bytes,
    }


def create_folder(
    parent_path: str,
    folder_name: str,
    *,
    base_dir: Path | None = None,
) -> dict[str, Any]:
    if not sanitize_folder_name(folder_name):
        raise ValueError("Invalid folder name")
    parent = resolve_explorer_path(parent_path, base_dir)
    if not parent.exists() or not parent.is_dir():
        raise FileNotFoundError(f"Parent directory not found: {parent}")
    target = (parent / folder_name.strip()).resolve()
    if not str(target).startswith(str(parent.resolve())):
        raise ValueError("Invalid folder path")
    target.mkdir(parents=False, exist_ok=False)
    return {"path": str(target), "name": target.name, "created": True}


def set_download_path(
    user,
    path: str,
    *,
    create_if_missing: bool = True,
    add_as_library: bool = True,
) -> dict[str, Any]:
    from apps.library.services.backend_node import _sanitize_library
    from apps.library.services.node_connections import get_or_create_connections

    target = Path(path).expanduser().resolve()
    if create_if_missing:
        target.mkdir(parents=True, exist_ok=True)
    if not target.exists() or not target.is_dir():
        raise FileNotFoundError(f"Directory not found: {target}")

    row = get_or_create_connections(user)
    organize = dict(row.organize) if isinstance(row.organize, dict) else {}
    organize["gamesDownloadPath"] = str(target)
    organize["isoDownloadPath"] = str(target)
    row.organize = organize

    libraries = list(row.libraries) if isinstance(row.libraries, list) else []
    if add_as_library:
        already = any(
            isinstance(item, dict) and str(item.get("path") or "").rstrip("/") == str(target)
            for item in libraries
        )
        if not already:
            libraries.append(
                _sanitize_library({"name": target.name, "path": str(target), "kind": "game"})
            )
            row.libraries = libraries
    row.save(update_fields=["organize", "libraries", "updated_at"])
    return {
        "path": str(target),
        "libraries": row.libraries,
        "organize": row.organize,
    }
