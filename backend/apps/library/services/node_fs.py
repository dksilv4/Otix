"""Filesystem helpers for the Django-as-node storage layer."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

CHUNK_SIZE = 1024 * 1024

SKIP_EXTENSIONS = {".bin"}

GENERIC_INSTALLER_STEMS = {
    "setup",
    "install",
    "installer",
    "autorun",
    "start",
    "play",
    "unins000",
    "uninstall",
}

GENERIC_FOLDER_NAMES = GENERIC_INSTALLER_STEMS | {
    "bin",
    "crack",
    "cracks",
    "redist",
    "commonredist",
    "directx",
    "vcredist",
    "windows",
    "win",
    "files",
    "data",
    "game",
    "games",
    "disk1",
    "disc1",
    "cd1",
    "dvd",
    "iso",
    "unpacked",
    "extracted",
    "temp",
    "tmp",
    "update",
    "updates",
    "patch",
    "dlc",
    "support",
    "docs",
    "documentation",
    "payloads",
}

STRIP_EXTENSIONS = {
    ".iso",
    ".img",
    ".bin",
    ".cue",
    ".exe",
    ".msi",
    ".pkg",
    ".zip",
    ".7z",
    ".rar",
    ".tar",
    ".gz",
    ".nsp",
    ".xci",
    ".cia",
    ".3ds",
    ".nds",
    ".gba",
    ".sfc",
    ".smc",
    ".nes",
    ".chd",
    ".rvz",
    ".wbfs",
}


def compute_head_hash(filepath: str) -> str:
    digest = hashlib.sha256()
    try:
        with open(filepath, "rb") as handle:
            digest.update(handle.read(CHUNK_SIZE))
        return digest.hexdigest()
    except OSError:
        return "0" * 32


def determine_format_category(ext: str) -> str:
    cleaned = Path(ext).suffix.lower().lstrip(".") if "." in ext else ext.lower().lstrip(".")
    if cleaned in ("iso", "img", "bin", "cue"):
        return "iso"
    if cleaned in ("exe", "msi", "pkg"):
        return "installer"
    if cleaned in ("zip", "7z", "rar", "tar", "gz"):
        return "archive"
    if cleaned in (
        "nsp",
        "xci",
        "cia",
        "3ds",
        "nds",
        "gba",
        "sfc",
        "smc",
        "nes",
        "chd",
        "rvz",
        "wbfs",
    ):
        return "rom"
    return "file"


def _base_name(filename: str) -> str:
    path = Path(filename)
    if path.suffix.lower() in STRIP_EXTENSIONS:
        return path.stem
    return path.name


def clean_title_from_filename(filename: str) -> str:
    name = _base_name(filename)
    tags = [
        "repack",
        "fitgirl",
        "dodi",
        "gog",
        "iso",
        "codex",
        "skidrow",
        "elamigos",
        "flt",
        "rune",
        "setup",
        "v1.0",
        "v1.1",
        "v1.2",
        "x64",
        "x86",
        "multi10",
        "multi12",
        "direct play",
    ]
    lowered = name.lower()
    for tag in tags:
        lowered = lowered.replace(tag, " ")
    cleaned = lowered.replace(".", " ").replace("_", " ").replace("-", " ").strip()
    words = [word for word in cleaned.split() if word]
    return " ".join(words).title() if words else _base_name(filename)


def relative_library_path(full_path: str, library_path: str) -> str:
    try:
        return str(Path(full_path).resolve().relative_to(Path(library_path).resolve()))
    except ValueError:
        return Path(full_path).name


def title_from_installer_path(filename: str, full_path: str, library_path: str) -> str:
    stem = Path(filename).stem.lower()
    if stem not in GENERIC_INSTALLER_STEMS:
        return clean_title_from_filename(filename)
    try:
        rel = Path(full_path).resolve().relative_to(Path(library_path).resolve())
    except ValueError:
        return clean_title_from_filename(filename)
    parts = [part for part in rel.parts[:-1] if part.lower() not in GENERIC_FOLDER_NAMES]
    if parts:
        return clean_title_from_filename(parts[-1])
    return clean_title_from_filename(filename)


def file_id_for_path(full_path: str) -> str:
    return f"file_{hashlib.md5(full_path.encode()).hexdigest()[:12]}"


def sanitize_folder_name(name: str) -> bool:
    if not name or not name.strip():
        return False
    return not any(char in name for char in ("/", "\\", "\0", "..", ":"))


def resolve_explorer_path(raw_path: str | None, base_dir: Path | None = None) -> Path:
    root = (base_dir or Path.cwd()).resolve()
    if not raw_path or raw_path.strip() in ("", ".", "/"):
        return root
    candidate = Path(raw_path.strip())
    if not candidate.is_absolute():
        return (root / candidate).resolve()
    return candidate.resolve()


def disk_usage(path: Path) -> tuple[int, int]:
    try:
        usage = os.statvfs(path) if hasattr(os, "statvfs") else None
        if usage is not None:
            total = usage.f_frsize * usage.f_blocks
            free = usage.f_frsize * usage.f_bavail
            return free, total
    except OSError:
        pass
    try:
        import shutil

        result = shutil.disk_usage(path)
        return result.free, result.total
    except OSError:
        return 0, 0
