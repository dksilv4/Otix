from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
from typing import Dict, List

from .types import HostedFile
from .utils import (
    clean_title_from_filename,
    compute_head_hash,
    determine_format_category,
)

# Re-export for backwards compatibility
__all__ = [
    "HostedFile",
    "compute_head_hash",
    "determine_format_category",
    "clean_title_from_filename",
    "StorageIndexer",
    "GameLibraryIndexer",
]


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
                        mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
                        head_hash = compute_head_hash(full_path)
                        file_id = f"file_{hashlib.md5(full_path.encode()).hexdigest()[:12]}"
                        title = clean_title_from_filename(file)
                        category = determine_format_category(ext)

                        hf = HostedFile(
                            id=file_id,
                            filename=file,
                            filepath=full_path,
                            filesize=size,
                            sha256_head=head_hash,
                            extension=ext,
                            format_category=category,
                            library_name=lib_name,
                            game_title=title,
                            modified_at=mtime,
                        )
                        indexed.append(hf)
                        self.files_by_id[file_id] = hf
                    except Exception as err:
                        print(f"[Indexer] Failed to index {full_path}: {err}")

        return indexed


GameLibraryIndexer = StorageIndexer
