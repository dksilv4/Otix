from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
from typing import Dict, List

from .types import HostedFile
from .utils import (
    compute_head_hash,
    determine_format_category,
    relative_library_path,
    title_from_installer_path,
)

# Cue-sheet companions and raw dumps — never treat these as installable games.
SKIP_EXTENSIONS = {".bin"}


class StorageIndexer:
    def __init__(self, libraries: List[dict]):
        self.libraries = libraries
        self.files_by_id: Dict[str, HostedFile] = {}

    def scan_all(self) -> List[HostedFile]:
        indexed: List[HostedFile] = []
        self.files_by_id = {}
        for lib in self.libraries:
            lib_name = lib.get("name", "Default")
            lib_path = Path(lib.get("path", "."))
            allowed_exts = set(e.lower() for e in lib.get("allowed_extensions", []))

            try:
                if not lib_path.exists():
                    continue
            except (OSError, ValueError):
                continue

            for root, _, files in os.walk(lib_path):
                for file in files:
                    ext = Path(file).suffix.lower()
                    if ext in SKIP_EXTENSIONS:
                        continue
                    if allowed_exts and ext not in allowed_exts:
                        continue

                    full_path = str(Path(root) / file)
                    try:
                        stat = os.stat(full_path)
                        size = stat.st_size
                        mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
                        head_hash = compute_head_hash(full_path)
                        file_id = f"file_{hashlib.md5(full_path.encode()).hexdigest()[:12]}"
                        rel = relative_library_path(full_path, str(lib_path))
                        title = title_from_installer_path(file, full_path, str(lib_path))
                        category = determine_format_category(ext)

                        hf = HostedFile(
                            id=file_id,
                            filename=file,
                            filepath=full_path,
                            relative_path=rel,
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
