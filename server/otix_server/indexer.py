from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Dict, List, Optional
from pydantic import BaseModel


class HostedFile(BaseModel):
    id: str
    filename: str
    filepath: str
    filesize: int
    sha256_head: str
    extension: str
    library_name: str
    game_title: str
    matched_igdb_id: Optional[str] = None


CHUNK_SIZE = 1024 * 1024  # 1MB chunk for head hash


def compute_head_hash(filepath: str) -> str:
    """Compute SHA-256 hash of the first 1MB of a file for fast identification."""
    h = hashlib.sha256()
    try:
        with open(filepath, "rb") as f:
            chunk = f.read(CHUNK_SIZE)
            h.update(chunk)
        return h.hexdigest()
    except Exception:
        return "00000000000000000000000000000000"


def clean_title_from_filename(filename: str) -> str:
    """Extract clean title from filename."""
    name = Path(filename).stem
    for tag in ["repack", "fitgirl", "dodi", "gog", "iso", "codex", "skidrow", "setup", "v1.0", "v1.1"]:
        name = name.replace(tag, "").replace(tag.upper(), "")
    name = name.replace(".", " ").replace("_", " ").strip()
    return name.title() if name else Path(filename).stem


class StorageIndexer:
    def __init__(self, libraries: List[dict]):
        self.libraries = libraries
        self.files_by_id: Dict[str, HostedFile] = {}

    def scan_all(self) -> List[HostedFile]:
        indexed: List[HostedFile] = []
        for lib in self.libraries:
            lib_name = lib.get("name", "Default")
            lib_path = Path(lib.get("path", "."))
            allowed_exts = set(e.lower() for e in lib.get("allowed_extensions", []))

            if not lib_path.exists():
                continue

            for root, _, files in os.walk(lib_path):
                for file in files:
                    ext = Path(file).suffix.lower()
                    if allowed_exts and ext not in allowed_exts:
                        continue

                    full_path = str(Path(root) / file)
                    try:
                        stat = os.stat(full_path)
                        size = stat.st_size
                        head_hash = compute_head_hash(full_path)
                        file_id = f"file_{hashlib.md5(full_path.encode()).hexdigest()[:12]}"
                        title = clean_title_from_filename(file)

                        hf = HostedFile(
                            id=file_id,
                            filename=file,
                            filepath=full_path,
                            filesize=size,
                            sha256_head=head_hash,
                            extension=ext,
                            library_name=lib_name,
                            game_title=title,
                        )
                        indexed.append(hf)
                        self.files_by_id[file_id] = hf
                    except Exception as err:
                        print(f"[Indexer] Failed to index {full_path}: {err}")

        return indexed
