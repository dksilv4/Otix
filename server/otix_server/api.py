from __future__ import annotations

import os
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Header, Query, UploadFile, File, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from otix_server.config import AppConfig, LibraryConfig, load_config, save_config
import time
import shutil
from pydantic import BaseModel
from otix_server.indexer import StorageIndexer, HostedFile
from otix_server.saves import SaveCloudManager, SaveSnapshot
from otix_server.explorer_types import (
    CreateFolderRequest,
    ExplorerBrowseResponse,
    SetDownloadPathRequest,
)
from otix_server.explorer_utils import (
    inspect_directory,
    is_safe_folder_name,
    sanitize_and_resolve_path,
)
from otix_server.usenet_types import (
    DownloadReleaseRequest,
    DownloadReleaseResponse,
    ProwlarrConfig,
    ProwlarrRelease,
    SabnzbdConfig,
    ServerDownloadQueue,
    UsenetConfig,
)
from otix_server.usenet_utils import (
    delete_sabnzbd_slot,
    fetch_sabnzbd_queue,
    search_prowlarr,
    send_nzb_to_sabnzbd,
    test_prowlarr_connection,
    test_sabnzbd_connection,
    fetch_prowlarr_indexers,
    sync_prowlarr_indexers,
    pause_sabnzbd_queue,
    resume_sabnzbd_queue,
)
from otix_server.providers import (
    ProviderManager,
    SabnzbdDownloader,
    ProwlarrSearchProvider,
)


app = FastAPI(title="Otix Standalone Game & Save Server", version="0.1.0")

_start_time = time.time()

# Enable CORS for Otix Web (app.otix.io) and local clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length", "Content-Disposition"],
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


def optional_token(authorization: Optional[str] = Header(None), token: Optional[str] = Query(None)) -> bool:
    cfg = get_app_config()
    expected = cfg.server.auth_token
    if not expected:
        return True
    provided = None
    if authorization and authorization.startswith("Bearer "):
        provided = authorization[7:]
    elif token:
        provided = token
    return provided == expected


@app.get("/", response_class=HTMLResponse)
async def server_dashboard(indexer: StorageIndexer = Depends(get_indexer)):
    cfg = get_app_config()
    uptime = int(time.time() - _start_time)
    files = list(indexer.files_by_id.values())
    files_rows = "".join(
        f"""
        <tr style="border-bottom: 1px solid #27272a;">
          <td style="padding: 10px 12px; font-weight: 600;">{f.game_title}</td>
          <td style="padding: 10px 12px; color: #a1a1aa; font-family: monospace; font-size: 12px;">{f.filename}</td>
          <td style="padding: 10px 12px;"><span style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase;">{f.format_category}</span></td>
          <td style="padding: 10px 12px; color: #a1a1aa;">{f.filesize / 1024 / 1024:.2f} MB</td>
          <td style="padding: 10px 12px;"><a href="/api/v1/files/{f.id}/download?token={cfg.server.auth_token}" style="display: inline-flex; align-items: center; gap: 4px; background: #10b981; color: #000; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-decoration: none;">Download</a></td>
        </tr>
        """
        for f in files
    )
    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>{cfg.server.name} — Otix Node</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #f4f4f5; margin: 0; padding: 2rem; }}
        .card {{ background: #141416; border: 1px solid #27272a; border-radius: 16px; padding: 1.75rem; max-width: 820px; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }}
        .badge {{ display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 9999px; padding: 4px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; }}
        .pulse {{ width: 7px; height: 7px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981; animation: pulse 2s infinite; }}
        @keyframes pulse {{ 0%, 100% {{ opacity: 1; }} 50% {{ opacity: 0.4; }} }}
        .grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 1.5rem 0; }}
        .stat {{ background: #1c1c1f; border: 1px solid #27272a; border-radius: 12px; padding: 1rem; text-align: center; }}
        .stat-val {{ font-size: 1.75rem; font-weight: 800; color: #10b981; }}
        .stat-label {{ font-size: 0.7rem; color: #71717a; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; margin-top: 4px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 13px; }}
        th {{ text-align: left; padding: 10px 12px; color: #71717a; border-bottom: 1px solid #27272a; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }}
        .hint {{ background: #18181b; border-left: 3px solid #10b981; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-top: 1.5rem; font-size: 12px; color: #a1a1aa; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h1 style="margin: 0; font-size: 1.35rem; font-weight: 700;">{cfg.server.name}</h1>
            <p style="margin: 4px 0 0; font-size: 12px; color: #71717a;">Otix Standalone Game & Save Server · Port {cfg.server.port}</p>
          </div>
          <span class="badge"><span class="pulse"></span> ONLINE</span>
        </div>
        <div class="grid">
          <div class="stat"><div class="stat-val">{len(files)}</div><div class="stat-label">Hosted Games</div></div>
          <div class="stat"><div class="stat-val">{len(cfg.game_libraries)}</div><div class="stat-label">Libraries</div></div>
          <div class="stat"><div class="stat-val">{uptime}s</div><div class="stat-label">Uptime</div></div>
        </div>
        <h3 style="font-size: 13px; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; color: #a1a1aa;">Indexed Game Files</h3>
        <table>
          <thead>
            <tr><th>Game Title</th><th>Filename</th><th>Format</th><th>Size</th><th>Action</th></tr>
          </thead>
          <tbody>
            {files_rows if files_rows else '<tr><td colspan="5" style="padding: 16px; text-align: center; color: #71717a;">No games found in libraries.</td></tr>'}
          </tbody>
        </table>
        <div class="hint">
          <strong>Connect to Otix:</strong> Add this node in your Otix App at <a href="http://localhost:5173/settings/launcher" style="color: #10b981;">/settings/launcher</a> using URL <code>http://127.0.0.1:{cfg.server.port}</code> and your auth token.
        </div>
      </div>
    </body>
    </html>
    """


@app.get("/api/v1/ping")
async def ping():
    cfg = get_app_config()
    return {"status": "online", "server_name": cfg.server.name, "version": "0.1.0"}


@app.get("/api/v1/status")
async def get_server_status(
    indexer: StorageIndexer = Depends(get_indexer),
    is_authed: bool = Depends(optional_token),
):
    """Get rich server status, storage metrics, and library counts."""
    cfg = get_app_config()
    uptime = int(time.time() - _start_time)
    total_files = len(indexer.files_by_id)
    total_size = sum(f.filesize for f in indexer.files_by_id.values())

    free_bytes, total_bytes = 0, 0
    if is_authed:
        storage_root = cfg.saves.storage_path
        if cfg.game_libraries and os.path.exists(cfg.game_libraries[0].path):
            storage_root = cfg.game_libraries[0].path
        elif not os.path.exists(storage_root):
            storage_root = "."

        try:
            usage = shutil.disk_usage(storage_root)
            free_bytes, total_bytes = usage.free, usage.total
        except Exception:
            free_bytes, total_bytes = 0, 0

    return {
        "status": "online",
        "server_name": cfg.server.name,
        "version": "0.1.0",
        "uptime_seconds": uptime,
        "libraries_count": len(cfg.game_libraries),
        "total_files": total_files,
        "total_size_bytes": total_size if is_authed else None,
        "disk_free_bytes": free_bytes if is_authed else None,
        "disk_total_bytes": total_bytes if is_authed else None,
    }


@app.get("/api/v1/libraries")
async def list_libraries(_: None = Depends(verify_token)):
    """List configured storage libraries on this server node."""
    cfg = get_app_config()
    return [{"name": lib.name, "path": lib.path, "allowed_extensions": lib.allowed_extensions} for lib in cfg.game_libraries]


class AddLibraryRequest(BaseModel):
    name: str
    path: str
    allowed_extensions: list[str] | None = None


@app.post("/api/v1/libraries")
async def add_library(
    req: AddLibraryRequest,
    indexer: StorageIndexer = Depends(get_indexer),
    _: None = Depends(verify_token),
):
    """Assign and index a new storage folder on this server node."""
    cfg = get_app_config()
    from otix_server.config import LibraryConfig
    new_lib = LibraryConfig(
        name=req.name,
        path=req.path,
        allowed_extensions=req.allowed_extensions or [".iso", ".img", ".exe", ".zip", ".7z", ".rar"],
    )
    cfg.game_libraries.append(new_lib)
    indexer.libraries.append(new_lib.model_dump())
    files = indexer.scan_all()
    return {"status": "added", "library": new_lib.model_dump(), "total_files": len(files)}


@app.post("/api/v1/scan")
async def trigger_library_scan(indexer: StorageIndexer = Depends(get_indexer), _: None = Depends(verify_token)):
    """Force re-scan of all game libraries."""
    files = indexer.scan_all()
    return {"status": "scanned", "total_files": len(files)}


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


# ── Server Storage Explorer & Download Location Endpoints ────────────────

@app.get("/api/v1/explorer/browse", response_model=ExplorerBrowseResponse)
async def browse_server_directory(
    path: Optional[str] = Query(None, description="Relative or absolute folder path to browse"),
    _: None = Depends(verify_token),
):
    """Browse server filesystem safely, listing directories and downloadable files."""
    cfg = get_app_config()
    active_dl = cfg.server.downloads_path
    try:
        resolved = sanitize_and_resolve_path(path)
        return inspect_directory(resolved, active_download_path=active_dl)
    except FileNotFoundError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except NotADirectoryError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except PermissionError as err:
        raise HTTPException(status_code=403, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to browse directory: {err}")


@app.post("/api/v1/explorer/set-download-path")
async def set_server_download_path(
    req: SetDownloadPathRequest,
    indexer: StorageIndexer = Depends(get_indexer),
    _: None = Depends(verify_token),
):
    """Set the primary download and save directory on this server node."""
    cfg = get_app_config()
    target = sanitize_and_resolve_path(req.path)

    if not target.exists():
        if req.create_if_missing:
            target.mkdir(parents=True, exist_ok=True)
        else:
            raise HTTPException(status_code=404, detail=f"Directory does not exist: {target}")

    if not target.is_dir():
        raise HTTPException(status_code=400, detail=f"Specified path is not a directory: {target}")

    str_path = str(target)
    cfg.server.downloads_path = str_path

    if req.add_as_library:
        existing = any(
            Path(lib.path).resolve() == target
            for lib in cfg.game_libraries
        )
        if not existing:
            new_lib = LibraryConfig(
                name="Server Downloads",
                path=str_path,
                allowed_extensions=[".iso", ".img", ".exe", ".zip", ".7z", ".rar", ".bin", ".chd", ".rvz"],
            )
            cfg.game_libraries.append(new_lib)
            indexer.libraries.append(new_lib.model_dump())

    # Persist updated configuration
    save_config(cfg)

    # Re-scan indexer
    files = indexer.scan_all()

    return {
        "status": "updated",
        "downloads_path": str_path,
        "total_indexed_files": len(files),
    }


@app.post("/api/v1/explorer/create-folder")
async def create_server_folder(
    req: CreateFolderRequest,
    _: None = Depends(verify_token),
):
    """Create a new folder in the server storage."""
    if not is_safe_folder_name(req.folder_name):
        raise HTTPException(status_code=400, detail="Invalid or unsafe folder name")

    parent = sanitize_and_resolve_path(req.parent_path)
    if not parent.exists() or not parent.is_dir():
        raise HTTPException(status_code=404, detail="Parent directory not found")

    new_dir = parent / req.folder_name.strip()
    if new_dir.exists():
        raise HTTPException(status_code=409, detail="Folder already exists")

    try:
        new_dir.mkdir(parents=True, exist_ok=False)
        return {
            "status": "created",
            "name": new_dir.name,
            "path": str(new_dir),
        }
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to create folder: {err}")


@app.get("/api/v1/explorer/download")
async def download_server_file(
    path: str = Query(..., description="Path to file on server storage"),
    range: Optional[str] = Header(None),
    _: None = Depends(verify_token),
):
    """Directly stream or download any file from server storage with HTTP Range support."""
    resolved = sanitize_and_resolve_path(path)
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    file_size = resolved.stat().st_size
    filename = resolved.name

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
            with open(resolved, "rb") as f:
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
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
        return StreamingResponse(iterfile(), status_code=206, headers=headers)

    return FileResponse(
        path=str(resolved),
        filename=filename,
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


# ── Modular Provider Framework ──────────────────────────────────────────

def get_provider_manager() -> ProviderManager:
    """Build ProviderManager from the active server configuration."""
    cfg = get_app_config()
    mgr = ProviderManager()
    mgr.register_downloader(SabnzbdDownloader(cfg.usenet.sabnzbd))
    mgr.register_search_provider(ProwlarrSearchProvider(cfg.usenet.prowlarr))
    return mgr


@app.get("/api/v1/providers")
async def list_providers(_: None = Depends(verify_token)):
    """List all registered downloaders and indexer/search providers with status."""
    mgr = get_provider_manager()
    return mgr.list_providers()


@app.post("/api/v1/providers/{provider_type}/{name}/test")
async def test_provider_endpoint(
    provider_type: str,
    name: str,
    _: None = Depends(verify_token),
):
    """Test connectivity for a specific registered provider."""
    mgr = get_provider_manager()
    try:
        return mgr.test_provider(provider_type, name)
    except Exception as err:
        return {"ok": False, "message": str(err)}


@app.get("/api/v1/downloads/search", response_model=List[ProwlarrRelease])
async def modular_search_downloads(
    query: str = Query(..., description="Search query across indexers"),
    provider: Optional[str] = Query(None, description="Optional search provider name"),
    _: None = Depends(verify_token),
):
    """Search game releases across registered search providers."""
    mgr = get_provider_manager()
    try:
        return mgr.search(query=query, provider_name=provider)
    except Exception as err:
        raise HTTPException(status_code=502, detail=f"Search failed: {err}")


@app.post("/api/v1/downloads/add", response_model=DownloadReleaseResponse)
async def modular_add_download(
    req: DownloadReleaseRequest,
    downloader: Optional[str] = Query(None, description="Optional target downloader name"),
    _: None = Depends(verify_token),
):
    """Dispatch a release download to the active downloader."""
    mgr = get_provider_manager()
    try:
        res = mgr.download(
            download_url=req.download_url,
            title=req.title,
            category=req.category,
            downloader_name=downloader,
        )
        return DownloadReleaseResponse(
            status="queued",
            nzo_id=res.get("nzo_id") or res.get("id"),
            title=req.title,
        )
    except Exception as err:
        raise HTTPException(status_code=502, detail=f"Failed to dispatch download: {err}")


@app.get("/api/v1/downloads/queue", response_model=ServerDownloadQueue)
async def modular_get_download_queue(
    downloader: Optional[str] = Query(None, description="Optional downloader name"),
    _: None = Depends(verify_token),
):
    """Fetch real-time download queue from the active downloader."""
    mgr = get_provider_manager()
    return mgr.get_queue(downloader_name=downloader)


@app.delete("/api/v1/downloads/queue/{download_id}")
async def modular_cancel_download(
    download_id: str,
    downloader: Optional[str] = Query(None, description="Optional downloader name"),
    _: None = Depends(verify_token),
):
    """Cancel or remove an item from the download queue."""
    mgr = get_provider_manager()
    ok = mgr.delete_download(download_id=download_id, downloader_name=downloader)
    return {"status": "deleted" if ok else "failed", "download_id": download_id}


# ── Usenet Compatibility Aliases ─────────────────────────────────────────

@app.get("/api/v1/usenet/config")
async def get_usenet_config(_: None = Depends(verify_token)):
    """Get Usenet download client and indexer configuration."""
    cfg = get_app_config()
    u = cfg.usenet
    return {
        "enabled": u.enabled,
        "sabnzbd": {
            "host": u.sabnzbd.host,
            "port": u.sabnzbd.port,
            "api_key": "***" if u.sabnzbd.api_key else "",
            "apiKey": "***" if u.sabnzbd.api_key else "",
            "use_ssl": u.sabnzbd.use_ssl,
            "useSsl": u.sabnzbd.use_ssl,
            "url_base": u.sabnzbd.url_base,
            "urlBase": u.sabnzbd.url_base,
            "category": u.sabnzbd.category,
            "configured": bool(u.sabnzbd.host and u.sabnzbd.api_key),
            "has_api_key": bool(u.sabnzbd.api_key),
            "hasApiKey": bool(u.sabnzbd.api_key),
        },
        "prowlarr": {
            "host": u.prowlarr.host,
            "port": u.prowlarr.port,
            "api_key": "***" if u.prowlarr.api_key else "",
            "apiKey": "***" if u.prowlarr.api_key else "",
            "use_ssl": u.prowlarr.use_ssl,
            "useSsl": u.prowlarr.use_ssl,
            "url_base": u.prowlarr.url_base,
            "urlBase": u.prowlarr.url_base,
            "categories": u.prowlarr.categories,
            "configured": bool(u.prowlarr.host and u.prowlarr.api_key),
            "has_api_key": bool(u.prowlarr.api_key),
            "hasApiKey": bool(u.prowlarr.api_key),
        },
    }


class UpdateUsenetConfigRequest(BaseModel):
    enabled: Optional[bool] = None
    sabnzbd: Optional[dict] = None
    prowlarr: Optional[dict] = None


@app.post("/api/v1/usenet/config")
async def update_usenet_config(req: UpdateUsenetConfigRequest, _: None = Depends(verify_token)):
    """Update Usenet download client and indexer settings."""
    cfg = get_app_config()
    if req.enabled is not None:
        cfg.usenet.enabled = req.enabled

    if req.sabnzbd:
        s = req.sabnzbd
        if "host" in s and s["host"] is not None:
            cfg.usenet.sabnzbd.host = str(s["host"]).strip()
        if "port" in s and s["port"] is not None:
            cfg.usenet.sabnzbd.port = int(s["port"])
        api_key_val = s.get("api_key") if "api_key" in s else s.get("apiKey")
        if api_key_val and str(api_key_val).strip() != "***":
            cfg.usenet.sabnzbd.api_key = str(api_key_val).strip()
        ssl_val = s.get("use_ssl") if "use_ssl" in s else s.get("useSsl")
        if ssl_val is not None:
            cfg.usenet.sabnzbd.use_ssl = bool(ssl_val)
        base_val = s.get("url_base") if "url_base" in s else s.get("urlBase")
        if base_val is not None:
            cfg.usenet.sabnzbd.url_base = str(base_val).strip()
        if "category" in s and s["category"] is not None:
            cfg.usenet.sabnzbd.category = str(s["category"]).strip()

    if req.prowlarr:
        p = req.prowlarr
        if "host" in p and p["host"] is not None:
            cfg.usenet.prowlarr.host = str(p["host"]).strip()
        if "port" in p and p["port"] is not None:
            cfg.usenet.prowlarr.port = int(p["port"])
        api_key_val = p.get("api_key") if "api_key" in p else p.get("apiKey")
        if api_key_val and str(api_key_val).strip() != "***":
            cfg.usenet.prowlarr.api_key = str(api_key_val).strip()
        ssl_val = p.get("use_ssl") if "use_ssl" in p else p.get("useSsl")
        if ssl_val is not None:
            cfg.usenet.prowlarr.use_ssl = bool(ssl_val)
        base_val = p.get("url_base") if "url_base" in p else p.get("urlBase")
        if base_val is not None:
            cfg.usenet.prowlarr.url_base = str(base_val).strip()
        if "categories" in p and isinstance(p["categories"], list):
            cfg.usenet.prowlarr.categories = [int(c) for c in p["categories"]]

    save_config(cfg)
    return {"status": "saved"}


class TestSabnzbdRequest(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    api_key: Optional[str] = None
    use_ssl: Optional[bool] = None
    url_base: Optional[str] = None


@app.post("/api/v1/usenet/test-sabnzbd")
async def test_sabnzbd(req: TestSabnzbdRequest, _: None = Depends(verify_token)):
    """Test connectivity and authentication to SABnzbd."""
    cfg = get_app_config()
    client_cfg = SabnzbdConfig(
        host=req.host or cfg.usenet.sabnzbd.host,
        port=req.port or cfg.usenet.sabnzbd.port,
        api_key=req.api_key if req.api_key and req.api_key != "***" else cfg.usenet.sabnzbd.api_key,
        use_ssl=req.use_ssl if req.use_ssl is not None else cfg.usenet.sabnzbd.use_ssl,
        url_base=req.url_base if req.url_base is not None else cfg.usenet.sabnzbd.url_base,
        category=cfg.usenet.sabnzbd.category,
    )
    return test_sabnzbd_connection(client_cfg)


class TestProwlarrRequest(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    api_key: Optional[str] = None
    use_ssl: Optional[bool] = None
    url_base: Optional[str] = None


@app.post("/api/v1/usenet/test-prowlarr")
async def test_prowlarr(req: TestProwlarrRequest, _: None = Depends(verify_token)):
    """Test connectivity and authentication to Prowlarr."""
    cfg = get_app_config()
    client_cfg = ProwlarrConfig(
        host=req.host or cfg.usenet.prowlarr.host,
        port=req.port or cfg.usenet.prowlarr.port,
        api_key=req.api_key if req.api_key and req.api_key != "***" else cfg.usenet.prowlarr.api_key,
        use_ssl=req.use_ssl if req.use_ssl is not None else cfg.usenet.prowlarr.use_ssl,
        url_base=req.url_base if req.url_base is not None else cfg.usenet.prowlarr.url_base,
    )
    return test_prowlarr_connection(client_cfg)


@app.get("/api/v1/usenet/search", response_model=List[ProwlarrRelease])
async def search_usenet_games(
    query: str = Query(..., description="Game title or search query"),
    _: None = Depends(verify_token),
):
    """Search Prowlarr indexers for game releases (compatibility route)."""
    mgr = get_provider_manager()
    try:
        return mgr.search(query=query)
    except Exception as err:
        raise HTTPException(status_code=502, detail=f"Search failed: {err}")


@app.post("/api/v1/usenet/download", response_model=DownloadReleaseResponse)
async def start_usenet_download(
    req: DownloadReleaseRequest,
    _: None = Depends(verify_token),
):
    """Queue a game NZB release into SABnzbd on the server (compatibility route)."""
    mgr = get_provider_manager()
    try:
        res = mgr.download(download_url=req.download_url, title=req.title, category=req.category)
        return DownloadReleaseResponse(
            status="queued",
            nzo_id=res.get("nzo_id") or res.get("id"),
            title=req.title,
        )
    except Exception as err:
        raise HTTPException(status_code=502, detail=f"Failed to queue download: {err}")


@app.get("/api/v1/usenet/queue", response_model=ServerDownloadQueue)
async def get_usenet_queue(_: None = Depends(verify_token)):
    """Get real-time download queue from SABnzbd (compatibility route)."""
    mgr = get_provider_manager()
    return mgr.get_queue()


@app.delete("/api/v1/usenet/queue/{nzo_id}")
async def cancel_usenet_download(nzo_id: str, _: None = Depends(verify_token)):
    """Remove or cancel a download in SABnzbd (compatibility route)."""
    mgr = get_provider_manager()
    ok = mgr.delete_download(nzo_id)
    return {"status": "deleted" if ok else "failed", "nzo_id": nzo_id}


# ── Prowlarr Indexer Management & Sync ─────────────────────────────────

@app.get("/api/v1/prowlarr/indexers")
async def get_prowlarr_indexers(
    protocol: Optional[str] = Query(None, description="Filter by protocol: all, torrent, usenet"),
    _: None = Depends(verify_token),
):
    """Fetch indexers from Prowlarr."""
    cfg = get_app_config()
    try:
        return fetch_prowlarr_indexers(cfg.usenet.prowlarr, protocol=protocol)
    except Exception as err:
        raise HTTPException(status_code=502, detail=f"Failed to fetch indexers: {err}")


@app.post("/api/v1/prowlarr/sync")
async def trigger_prowlarr_sync(
    protocol: Optional[str] = Query(None, description="Filter by protocol: all, torrent, usenet"),
    _: None = Depends(verify_token),
):
    """Trigger ApplicationIndexerSync in Prowlarr and report indexer counts."""
    cfg = get_app_config()
    try:
        return sync_prowlarr_indexers(cfg.usenet.prowlarr, protocol=protocol)
    except Exception as err:
        raise HTTPException(status_code=502, detail=f"Failed to sync indexers: {err}")


# ── SABnzbd Queue Controls ─────────────────────────────────────────────

@app.post("/api/v1/sabnzbd/pause")
async def pause_sabnzbd(_: None = Depends(verify_token)):
    """Pause SABnzbd queue."""
    cfg = get_app_config()
    ok = pause_sabnzbd_queue(cfg.usenet.sabnzbd)
    return {"status": "paused" if ok else "failed"}


@app.post("/api/v1/sabnzbd/resume")
async def resume_sabnzbd(_: None = Depends(verify_token)):
    """Resume SABnzbd queue."""
    cfg = get_app_config()
    ok = resume_sabnzbd_queue(cfg.usenet.sabnzbd)
    return {"status": "resumed" if ok else "failed"}


