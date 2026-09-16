from __future__ import annotations

import hashlib
import os
from pathlib import Path
import socket

CHUNK_SIZE = 1024 * 1024  # 1MB chunk for head hash

def get_local_ip() -> str:
    """Find local LAN IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def compute_head_hash(filepath: str) -> str:
    """Compute SHA-256 hash of the first 1MB of a file for fast identification."""
    h = hashlib.sha256()
    try:
        with open(filepath, "rb") as f:
            chunk = f.read(CHUNK_SIZE)
            h.update(chunk)
        return h.hexdigest()
    except OSError:
        return "00000000000000000000000000000000"


def determine_format_category(ext: str) -> str:
    """Categorize file extensions into iso, installer, archive, or rom."""
    if "." in ext:
        ext = Path(ext).suffix.lower().lstrip(".") or ext.lower().lstrip(".")
    else:
        ext = ext.lower().lstrip(".")
    if ext in ("iso", "img", "bin", "cue"):
        return "iso"
    if ext in ("exe", "msi", "pkg"):
        return "installer"
    if ext in ("zip", "7z", "rar", "tar", "gz"):
        return "archive"
    if ext in (
        "nsp", "xci", "cia", "3ds", "nds", "gba", "sfc", "smc", "nes", "chd", "rvz", "wbfs"
    ):
        return "rom"
    return "file"



GENERIC_INSTALLER_STEMS = {
    "setup", "install", "installer", "autorun", "start", "play", "unins000", "uninstall",
}

GENERIC_FOLDER_NAMES = GENERIC_INSTALLER_STEMS | {
    "bin", "crack", "cracks", "redist", "commonredist", "directx", "vcredist",
    "windows", "win", "files", "data", "game", "games", "disk1", "disc1", "cd1",
    "dvd", "iso", "unpacked", "extracted", "temp", "tmp", "update", "updates",
    "patch", "dlc", "support", "docs", "documentation", "payloads",
}


STRIP_EXTENSIONS = {
    ".iso", ".img", ".bin", ".cue", ".exe", ".msi", ".pkg",
    ".zip", ".7z", ".rar", ".tar", ".gz",
    ".nsp", ".xci", ".cia", ".3ds", ".nds", ".gba", ".sfc", ".smc", ".nes",
    ".chd", ".rvz", ".wbfs",
}


def _base_name(filename: str) -> str:
    path = Path(filename)
    if path.suffix.lower() in STRIP_EXTENSIONS:
        return path.stem
    return path.name


def clean_title_from_filename(filename: str) -> str:
    """Extract clean title from filename by stripping scene release and codec tags."""
    name = _base_name(filename)
    tags = [
        "repack", "fitgirl", "dodi", "gog", "iso", "codex", "skidrow",
        "elamigos", "flt", "rune", "setup", "v1.0", "v1.1", "v1.2",
        "x64", "x86", "multi10", "multi12", "direct play"
    ]
    name_lower = name.lower()
    for tag in tags:
        name_lower = name_lower.replace(tag, " ")
    cleaned = name_lower.replace(".", " ").replace("_", " ").replace("-", " ").strip()
    words = [w for w in cleaned.split() if w]
    return " ".join(words).title() if words else _base_name(filename)


def is_generic_installer_name(filename: str | None) -> bool:
    if not filename:
        return False
    return Path(filename).stem.lower() in GENERIC_INSTALLER_STEMS


def relative_library_path(filepath: str, library_path: str | None = None) -> str:
    """Short path from the library root, e.g. ``Cyberpunk 2077/setup.exe``."""
    full = Path(filepath)
    if library_path:
        try:
            return Path(os.path.relpath(full, library_path)).as_posix()
        except ValueError:
            pass
    parts = [part for part in full.parts if part not in ("/", "\\")]
    if len(parts) >= 2:
        return Path(*parts[-2:]).as_posix()
    return full.name


def folder_titles_from_path(path: str | None) -> list[str]:
    """Parent folder names nearest-first, skipping generic installer dirs."""
    if not path:
        return []
    parts = list(Path(str(path).replace("\\", "/")).parts)
    if parts and Path(parts[-1]).suffix:
        parts = parts[:-1]
    titles: list[str] = []
    seen: set[str] = set()
    for part in reversed(parts):
        if not part or part in (".", "..", "/", "\\") or len(part) <= 1:
            continue
        if part.lower() in GENERIC_FOLDER_NAMES:
            continue
        cleaned = clean_title_from_filename(part)
        key = cleaned.lower()
        if not cleaned or key in GENERIC_FOLDER_NAMES or key in seen:
            continue
        seen.add(key)
        titles.append(cleaned)
    return titles


def title_from_installer_path(filename: str, filepath: str, library_path: str | None = None) -> str:
    """Use parent folders when the filename is a generic installer like setup.exe."""
    relative = relative_library_path(filepath, library_path)
    if is_generic_installer_name(filename):
        folders = folder_titles_from_path(relative)
        if folders:
            return folders[0]
    return clean_title_from_filename(filename)
