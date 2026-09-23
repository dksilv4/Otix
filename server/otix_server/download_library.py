"""Link download-provider output folders into the Otix installer index."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from otix_server.config import AppConfig, LibraryConfig
from otix_server.indexer import StorageIndexer
from otix_server.usenet_types import DownloadPathMapping


INSTALLER_EXTENSIONS = [
    ".iso",
    ".img",
    ".exe",
    ".zip",
    ".7z",
    ".rar",
    ".chd",
    ".rvz",
]
SAB_LIBRARY_PREFIX = "SABnzbd Completed Games"


def _safe_resolve(path: str | Path) -> Path:
    try:
        return Path(path).expanduser().resolve()
    except (OSError, ValueError):
        return Path(path).expanduser().absolute()


def _safe_is_dir(path: Path) -> bool:
    try:
        return path.is_dir()
    except (OSError, ValueError):
        return False


_resolved = _safe_resolve


def _configured_mappings(config: AppConfig) -> list[DownloadPathMapping]:
    sab = config.usenet.sabnzbd
    if sab.path_mappings:
        return [
            item if isinstance(item, DownloadPathMapping) else DownloadPathMapping.model_validate(item)
            for item in sab.path_mappings
        ]
    remote = (sab.remote_path or sab.complete_dir or "").strip()
    host = (sab.host_path or sab.local_complete_dir or "").strip()
    if remote or host:
        return [DownloadPathMapping(remote_path=remote, host_path=host)]
    return []


def _mapping_status(config: AppConfig, mapping: DownloadPathMapping) -> dict[str, Any]:
    remote = mapping.remote_path.strip()
    requested_host = (mapping.host_path or remote).strip()
    error = ""
    linked_path = ""
    linked = False

    if not remote:
        error = "Enter the path used by SABnzbd."
    elif not requested_host:
        error = "Enter the path visible to Otix Server."
    else:
        raw_target = Path(requested_host).expanduser()
        if not raw_target.is_absolute():
            error = (
                "The Otix host path must be absolute. "
                "Set the host path for this shared folder."
            )
        else:
            target = _safe_resolve(raw_target)
            accessible = _safe_is_dir(target)
            indexed = any(_safe_resolve(lib.path) == target for lib in config.game_libraries)
            linked = accessible and indexed
            if linked:
                linked_path = str(target)
            elif not accessible:
                error = (
                    "This host path is not visible to Otix Server. "
                    "Check the Docker volume or network mount."
                )
            else:
                error = "This host path has not been added to the Otix game libraries."

    return {
        "remote_path": remote,
        "host_path": requested_host,
        "linked": linked,
        "linked_library_path": linked_path,
        "error": error,
    }


def provider_library_status(config: AppConfig) -> dict[str, Any]:
    """Describe every SABnzbd remote-to-host path mapping."""
    sab = config.usenet.sabnzbd
    mappings = [_mapping_status(config, item) for item in _configured_mappings(config)]
    if not mappings:
        folder_error = "SABnzbd completed folder has not been discovered yet."
    else:
        folder_error = next((item["error"] for item in mappings if item["error"]), "")
    all_linked = bool(mappings) and all(item["linked"] for item in mappings)
    first = mappings[0] if mappings else {}
    return {
        "provider": "sabnzbd",
        "folder_linked": all_linked,
        "path_mappings": mappings,
        # Singular fields remain for compatibility with older Otix clients.
        "remote_path": first.get("remote_path", ""),
        "host_path": first.get("host_path", ""),
        "provider_complete_dir": sab.complete_dir,
        "local_complete_dir": sab.local_complete_dir,
        "linked_library_path": first.get("linked_library_path", ""),
        "folder_error": folder_error,
    }


def _mapping_target(mapping: DownloadPathMapping) -> Path | None:
    requested = (mapping.host_path or mapping.remote_path).strip()
    if not mapping.remote_path.strip() or not requested:
        return None
    raw_target = Path(requested).expanduser()
    if not raw_target.is_absolute():
        return None
    target = _safe_resolve(raw_target)
    return target if _safe_is_dir(target) else None


def _managed_library(name: str) -> bool:
    return name == SAB_LIBRARY_PREFIX or name.startswith(f"{SAB_LIBRARY_PREFIX} (")


def _reconcile_libraries(
    config: AppConfig,
    indexer: StorageIndexer,
    mappings: list[DownloadPathMapping],
    scan_index: bool,
) -> None:
    targets = [target for mapping in mappings if (target := _mapping_target(mapping))]
    wanted = set(targets)
    config.game_libraries = [
        lib
        for lib in config.game_libraries
        if not _managed_library(lib.name) or _resolved(lib.path) in wanted
    ]
    indexer.libraries = [
        lib
        for lib in indexer.libraries
        if not _managed_library(str(lib.get("name") or ""))
        or _resolved(str(lib.get("path") or "")) in wanted
    ]

    for index, target in enumerate(targets, start=1):
        existing = next(
            (lib for lib in config.game_libraries if _resolved(lib.path) == target),
            None,
        )
        if existing is None:
            suffix = "" if index == 1 else f" ({index})"
            existing = LibraryConfig(
                name=f"{SAB_LIBRARY_PREFIX}{suffix}",
                path=str(target),
                allowed_extensions=INSTALLER_EXTENSIONS,
            )
            config.game_libraries.append(existing)
        if not any(_resolved(str(lib.get("path") or "")) == target for lib in indexer.libraries):
            indexer.libraries.append(existing.model_dump())

    if scan_index:
        indexer.files_by_id.clear()
        indexer.scan_all()


def link_sabnzbd_library(
    config: AppConfig,
    indexer: StorageIndexer,
    discovered: dict[str, str] | None = None,
    *,
    scan_index: bool = True,
) -> dict[str, Any]:
    """Add SABnzbd's completed folder to the live and persisted game libraries.

    Every mapping owns a path seen by SABnzbd and the corresponding path seen
    by the Otix Server process.
    """
    sab = config.usenet.sabnzbd
    details = discovered or {}
    discovered_complete = str(details.get("complete_dir") or "").strip()
    discovered_library = str(details.get("library_path") or "").strip()
    mappings = _configured_mappings(config)
    if discovered_complete:
        sab.complete_dir = discovered_complete
    if not mappings and (discovered_library or discovered_complete):
        mappings = [
            DownloadPathMapping(
                remote_path=discovered_library or discovered_complete,
                host_path="",
            )
        ]
    sab.path_mappings = mappings
    if mappings:
        sab.remote_path = mappings[0].remote_path
        sab.host_path = mappings[0].host_path
    _reconcile_libraries(config, indexer, mappings, scan_index)
    status = provider_library_status(config)
    linked = next(
        (
            item["linked_library_path"]
            for item in status["path_mappings"]
            if item["linked_library_path"]
        ),
        "",
    )
    sab.linked_library_path = linked
    return status
