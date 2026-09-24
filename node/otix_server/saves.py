from __future__ import annotations

import os
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel


class SaveSnapshot(BaseModel):
    snapshot_id: str
    game_id: str
    game_title: str
    timestamp: str
    filename: str
    filepath: str
    filesize: int


class SaveCloudManager:
    def __init__(self, storage_path: str, max_snapshots: int = 10):
        self.base_dir = Path(storage_path)
        self.max_snapshots = max_snapshots
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save_snapshot(self, game_id: str, game_title: str, file_bytes: bytes, original_filename: str) -> SaveSnapshot:
        game_dir = self.base_dir / game_id
        game_dir.mkdir(parents=True, exist_ok=True)

        now_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        snapshot_id = f"snap_{now_str}"
        save_filename = f"{snapshot_id}_{original_filename}"
        target_path = game_dir / save_filename

        with open(target_path, "wb") as f:
            f.write(file_bytes)

        # Enforce max snapshots limit
        self._prune_snapshots(game_dir)

        return SaveSnapshot(
            snapshot_id=snapshot_id,
            game_id=game_id,
            game_title=game_title,
            timestamp=datetime.now(timezone.utc).isoformat(),
            filename=save_filename,
            filepath=str(target_path),
            filesize=len(file_bytes),
        )

    def list_snapshots(self, game_id: str) -> List[SaveSnapshot]:
        game_dir = self.base_dir / game_id
        if not game_dir.exists():
            return []

        snapshots: List[SaveSnapshot] = []
        for file in sorted(os.listdir(game_dir), reverse=True):
            if file.startswith("snap_"):
                full_p = game_dir / file
                parts = file.split("_", 2)
                snap_id = f"{parts[0]}_{parts[1]}" if len(parts) >= 2 else file
                stat = os.stat(full_p)
                snapshots.append(
                    SaveSnapshot(
                        snapshot_id=snap_id,
                        game_id=game_id,
                        game_title=game_id,
                        timestamp=datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
                        filename=file,
                        filepath=str(full_p),
                        filesize=stat.st_size,
                    )
                )
        return snapshots

    def get_snapshot_path(self, game_id: str, snapshot_id: str) -> Optional[Path]:
        game_dir = self.base_dir / game_id
        if not game_dir.exists():
            return None

        for file in os.listdir(game_dir):
            if file.startswith(snapshot_id):
                return game_dir / file
        return None

    def _prune_snapshots(self, game_dir: Path):
        snaps = sorted([f for f in os.listdir(game_dir) if f.startswith("snap_")])
        if len(snaps) > self.max_snapshots:
            to_remove = snaps[: len(snaps) - self.max_snapshots]
            for file in to_remove:
                try:
                    os.remove(game_dir / file)
                except Exception as err:
                    print(f"[SaveManager] Failed to prune {file}: {err}")
