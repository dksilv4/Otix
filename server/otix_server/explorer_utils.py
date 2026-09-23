from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from otix_server.explorer_types import ExplorerBrowseResponse, ExplorerEntry
from otix_server.utils import determine_format_category


def sanitize_and_resolve_path(raw_path: str | None, base_dir: Path | None = None) -> Path:
    """Safely sanitize and resolve a user-supplied filesystem path.
    
    If raw_path is empty or '.', defaults to base_dir or current working directory.
    Prevents path traversal vulnerabilities and normalizes the target path.
    """
    root = (base_dir or Path.cwd()).resolve()
    if not raw_path or raw_path.strip() in ("", ".", "/"):
        return root

    cleaned = raw_path.strip()

    # If an absolute path is given
    candidate = Path(cleaned)
    if not candidate.is_absolute():
        candidate = (root / cleaned).resolve()
    else:
        candidate = candidate.resolve()

    return candidate


def is_safe_folder_name(name: str) -> bool:
    """Validate that folder name contains no directory separators or null bytes."""
    if not name or not name.strip():
        return False
    if any(c in name for c in ("/", "\\", "\0", "..", ":")):
        return False
    return True


def _is_inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def external_library_roots(library_paths: list[str], server_root: Path) -> list[Path]:
    """Top-level folders for libraries that live outside the node working tree.

    ``/server/Games`` and ``/server/Downloads`` collapse to ``/server``.
    ``/games`` stays ``/games``. Paths already under the node root are skipped.
    """
    root = server_root.resolve()
    seen: set[str] = set()
    extra: list[Path] = []
    for raw in library_paths:
        try:
            folder = Path(raw)
            if not folder.exists():
                continue
            if not folder.is_dir():
                folder = folder.parent
            current = folder.resolve()
            if _is_inside(current, root):
                continue
            while True:
                parent = current.parent
                if parent == current:
                    break
                if _is_inside(root, parent) or parent == root.parent:
                    break
                current = parent
            if not current.is_dir():
                continue
            key = str(current)
            if key in seen:
                continue
            seen.add(key)
            extra.append(current)
        except (OSError, ValueError):
            continue
    return extra


def _folder_entry(path: Path, is_download_location: bool = False) -> ExplorerEntry:
    return ExplorerEntry(
        name=path.name or str(path),
        path=str(path),
        is_dir=True,
        size=0,
        extension="",
        format_category="folder",
        is_downloadable=False,
        is_download_location=is_download_location,
    )


def inspect_directory(
    target_path: Path,
    active_download_path: str = "",
    server_root: Path | None = None,
    extra_library_paths: list[str] | None = None,
) -> ExplorerBrowseResponse:
    """Inspect and index directory contents for the Otix Server File Explorer."""
    root = (server_root or Path.cwd()).resolve()
    resolved_target = target_path.resolve()

    if not resolved_target.exists():
        raise FileNotFoundError(f"Directory not found: {resolved_target}")
    if not resolved_target.is_dir():
        raise NotADirectoryError(f"Path is not a directory: {resolved_target}")

    # Determine parent path
    parent_path: Optional[str] = None
    is_root = resolved_target == resolved_target.parent or resolved_target == root
    if not is_root:
        parent_path = str(resolved_target.parent)

    resolved_active_download = None
    if active_download_path:
        try:
            resolved_active_download = Path(active_download_path).resolve()
        except Exception:
            resolved_active_download = None

    entries: list[ExplorerEntry] = []

    try:
        with os.scandir(resolved_target) as it:
            for entry in it:
                try:
                    is_dir = entry.is_dir(follow_symlinks=False)
                    stat = entry.stat(follow_symlinks=False)
                    mod_time = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
                    entry_path = str(Path(entry.path).resolve())

                    if is_dir:
                        is_dl = (
                            resolved_active_download is not None
                            and Path(entry_path) == resolved_active_download
                        )
                        entries.append(
                            ExplorerEntry(
                                name=entry.name,
                                path=entry_path,
                                is_dir=True,
                                size=0,
                                extension="",
                                format_category="folder",
                                modified_at=mod_time,
                                is_downloadable=False,
                                is_download_location=is_dl,
                            )
                        )
                    else:
                        ext = Path(entry.name).suffix.lower()
                        cat = determine_format_category(ext)
                        is_downloadable = cat in ("iso", "installer", "archive", "rom") or ext in (
                            ".exe", ".zip", ".iso", ".rar", ".7z", ".bin", ".tar", ".gz"
                        )
                        entries.append(
                            ExplorerEntry(
                                name=entry.name,
                                path=entry_path,
                                is_dir=False,
                                size=stat.st_size,
                                extension=ext,
                                format_category=cat,
                                modified_at=mod_time,
                                is_downloadable=is_downloadable,
                                is_download_location=False,
                            )
                        )
                except (PermissionError, OSError):
                    continue
    except PermissionError as err:
        raise PermissionError(f"Permission denied accessing directory: {resolved_target}") from err

    if is_root and extra_library_paths:
        existing = {Path(entry.path).resolve() for entry in entries}
        for extra in external_library_roots(extra_library_paths, root):
            if extra in existing:
                continue
            entries.append(_folder_entry(extra))

    # Sort entries: directories first alphabetically, then files alphabetically
    entries.sort(key=lambda e: (0 if e.is_dir else 1, e.name.lower()))

    # Disk usage stats
    free_bytes, total_bytes = None, None
    try:
        usage = shutil.disk_usage(resolved_target)
        free_bytes, total_bytes = usage.free, usage.total
    except Exception:
        pass

    return ExplorerBrowseResponse(
        current_path=str(resolved_target),
        parent_path=parent_path,
        is_root=is_root,
        entries=entries,
        active_download_path=active_download_path,
        total_items=len(entries),
        disk_free_bytes=free_bytes,
        disk_total_bytes=total_bytes,
    )
