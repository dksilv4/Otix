from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field


class DownloadPathMapping(BaseModel):
    remote_path: str = ""
    host_path: str = ""


class SabnzbdConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 8080
    url_base: str = ""
    api_key: str = ""
    use_ssl: bool = False
    category: str = "games"
    complete_dir: str = ""
    local_complete_dir: str = ""
    remote_path: str = ""
    host_path: str = ""
    linked_library_path: str = ""
    path_mappings: List[DownloadPathMapping] = Field(default_factory=list)

    @property
    def clean_url_base(self) -> str:
        raw = (self.url_base or "").strip().strip("/")
        return f"/{raw}" if raw else ""


class ProwlarrConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 9696
    url_base: str = ""
    api_key: str = ""
    use_ssl: bool = False
    categories: List[int] = Field(default_factory=lambda: [1000, 4000])

    @property
    def clean_url_base(self) -> str:
        raw = (self.url_base or "").strip().strip("/")
        return f"/{raw}" if raw else ""


class UsenetConfig(BaseModel):
    enabled: bool = False
    sabnzbd: SabnzbdConfig = Field(default_factory=SabnzbdConfig)
    prowlarr: ProwlarrConfig = Field(default_factory=ProwlarrConfig)


class ProwlarrRelease(BaseModel):
    guid: str
    title: str
    size: int
    download_url: str = ""
    info_url: Optional[str] = None
    publish_date: Optional[str] = None
    indexer: str = "Indexer"
    protocol: str = "usenet"
    age_days: Optional[int] = None
    seeders: Optional[int] = None


class SabnzbdQueueItem(BaseModel):
    nzo_id: str
    filename: str
    percentage: float = 0.0
    size_mb: float = 0.0
    size_left_mb: float = 0.0
    speed: str = "0 B/s"
    time_left: str = ""
    status: str = "Downloading"


class ServerDownloadQueue(BaseModel):
    status: str = "Idle"
    speed: str = "0 B/s"
    time_left: str = ""
    items: List[SabnzbdQueueItem] = Field(default_factory=list)


class SabnzbdHistoryItem(BaseModel):
    nzo_id: str
    filename: str
    status: str = "Completed"
    size_bytes: int = 0
    fail_message: str = ""
    completed_at: Optional[str] = None
    category: str = ""
    storage: Optional[str] = None


class ServerDownloadHistory(BaseModel):
    items: List[SabnzbdHistoryItem] = Field(default_factory=list)


class DownloadReleaseRequest(BaseModel):
    title: str
    download_url: str
    category: Optional[str] = None
    protocol: Optional[str] = None


class DownloadReleaseResponse(BaseModel):
    status: str = "queued"
    nzo_id: str
    title: str
