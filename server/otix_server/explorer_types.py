from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel


class ExplorerEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: int = 0
    extension: str = ""
    format_category: str = "folder"  # "folder", "iso", "installer", "archive", "rom", "file"
    modified_at: Optional[str] = None
    is_downloadable: bool = False
    is_download_location: bool = False


class ExplorerBrowseResponse(BaseModel):
    current_path: str
    parent_path: Optional[str] = None
    is_root: bool = False
    entries: List[ExplorerEntry] = []
    active_download_path: str
    total_items: int = 0
    disk_free_bytes: Optional[int] = None
    disk_total_bytes: Optional[int] = None


class SetDownloadPathRequest(BaseModel):
    path: str
    create_if_missing: bool = True
    add_as_library: bool = True


class CreateFolderRequest(BaseModel):
    parent_path: str
    folder_name: str
