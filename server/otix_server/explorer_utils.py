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


def inspect_directory(
    target_path: Path,
    active_download_path: str = "",
    server_root: Path | None = None,
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
