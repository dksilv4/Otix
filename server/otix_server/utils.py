from __future__ import annotations

import hashlib
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



def clean_title_from_filename(filename: str) -> str:
    """Extract clean title from filename by stripping scene release and codec tags."""
    name = Path(filename).stem
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
    return " ".join(words).title() if words else Path(filename).stem
