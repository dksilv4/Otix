from __future__ import annotations

import os
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Header, Query, UploadFile, File, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from otix_server.config import AppConfig, load_config
from otix_server.indexer import StorageIndexer, HostedFile
from otix_server.saves import SaveCloudManager, SaveSnapshot

app = FastAPI(title="Otix Standalone Game & Save Server", version="0.1.0")

# Enable CORS for Otix Web (app.otix.io) and local clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_config: Optional[AppConfig] = None
_indexer: Optional[StorageIndexer] = None
_saves_manager: Optional[SaveCloudManager] = None


def get_app_config() -> AppConfig:
    global _config
    if _config is None:
        _config = load_config()
    return _config


def get_indexer() -> StorageIndexer:
    global _indexer
    if _indexer is None:
        cfg = get_app_config()
        _indexer = StorageIndexer([lib.model_dump() for lib in cfg.game_libraries])
        _indexer.scan_all()
    return _indexer


def get_saves_manager() -> SaveCloudManager:
    global _saves_manager
    if _saves_manager is None:
        cfg = get_app_config()
        _saves_manager = SaveCloudManager(cfg.saves.storage_path, cfg.saves.max_snapshots_per_game)
    return _saves_manager


def verify_token(authorization: Optional[str] = Header(None), token: Optional[str] = Query(None)):
    cfg = get_app_config()
    expected = cfg.server.auth_token

    provided = None
    if authorization and authorization.startswith("Bearer "):
        provided = authorization[7:]
    elif token:
        provided = token

    if expected and provided != expected:
        raise HTTPException(status_code=401, detail="Invalid server authorization token")


@app.get("/api/v1/ping")
async def ping():
    cfg = get_app_config()
    return {"status": "online", "server_name": cfg.server.name, "version": "0.1.0"}


@app.get("/api/v1/files", response_model=List[HostedFile])
async def list_hosted_files(indexer: StorageIndexer = Depends(get_indexer), _: None = Depends(verify_token)):
    """List all hosted game installer files (.iso, .exe, repacks, ROMs)."""
    return list(indexer.files_by_id.values())


@app.get("/api/v1/files/{file_id}")
async def get_hosted_file_info(file_id: str, indexer: StorageIndexer = Depends(get_indexer), _: None = Depends(verify_token)):
    if file_id not in indexer.files_by_id:
        raise HTTPException(status_code=404, detail="Hosted file not found")
    return indexer.files_by_id[file_id]


@app.get("/api/v1/files/{file_id}/download")
async def download_hosted_file(
    file_id: str,
    range: Optional[str] = Header(None),
    indexer: StorageIndexer = Depends(get_indexer),
    _: None = Depends(verify_token),
):
    """Download hosted file with HTTP/2 Range Request support for resumable multi-threaded downloads."""
    if file_id not in indexer.files_by_id:
        raise HTTPException(status_code=404, detail="Hosted file not found")

    file_info = indexer.files_by_id[file_id]
    filepath = file_info.filepath

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File on disk missing")

    file_size = os.path.getsize(filepath)

    if range:
        try:
            unit, ranges = range.split("=")
            if unit.strip() != "bytes":
                raise ValueError()
            start_str, end_str = ranges.split("-")
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
        except Exception:
            raise HTTPException(status_code=416, detail="Requested Range Not Satisfiable")

        if start >= file_size or end >= file_size or start > end:
            raise HTTPException(status_code=416, detail="Requested Range Not Satisfiable")

        chunk_size = (end - start) + 1

        def iterfile():
            with open(filepath, "rb") as f:
                f.seek(start)
                bytes_left = chunk_size
                while bytes_left > 0:
                    read_len = min(1024 * 1024, bytes_left)
                    data = f.read(read_len)
                    if not data:
                        break
                    bytes_left -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
            "Content-Type": "application/octet-stream",
            "Content-Disposition": f'attachment; filename="{file_info.filename}"',
        }
        return StreamingResponse(iterfile(), status_code=206, headers=headers)

    return FileResponse(
        path=filepath,
        filename=file_info.filename,
        media_type="application/octet-stream",
        headers={"Accept-Ranges": "bytes"},
    )


# ── Save Backup Endpoints ───────────────────────────────────────────────

@app.post("/api/v1/saves/upload", response_model=SaveSnapshot)
async def upload_save_file(
    game_id: str = Header(...),
    game_title: str = Header("Game"),
    file: UploadFile = File(...),
    saves_mgr: SaveCloudManager = Depends(get_saves_manager),
    _: None = Depends(verify_token),
):
    """Upload a game save archive (.zip/.tar) to otix-server for cloud backup."""
    contents = await file.read()
    snapshot = saves_mgr.save_snapshot(game_id, game_title, contents, file.filename or "save.zip")
    return snapshot


@app.get("/api/v1/saves/{game_id}", response_model=List[SaveSnapshot])
async def list_game_save_snapshots(
    game_id: str,
    saves_mgr: SaveCloudManager = Depends(get_saves_manager),
    _: None = Depends(verify_token),
):
    """List all available save file backup snapshots for a game."""
    return saves_mgr.list_snapshots(game_id)


@app.get("/api/v1/saves/{game_id}/{snapshot_id}/download")
async def download_save_snapshot(
    game_id: str,
    snapshot_id: str,
    saves_mgr: SaveCloudManager = Depends(get_saves_manager),
    _: None = Depends(verify_token),
):
    """Download a specific save file snapshot for restoration."""
    path = saves_mgr.get_snapshot_path(game_id, snapshot_id)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Save snapshot not found")

    return FileResponse(
        path=str(path),
        filename=path.name,
        media_type="application/zip",
    )
