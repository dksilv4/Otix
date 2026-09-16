from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class RadarrConfig(BaseModel):
    enabled: bool = False
    host: str = "127.0.0.1"
    port: int = 7878
    url_base: str = ""
    api_key: str = ""
    use_ssl: bool = False
    quality_profile_id: Optional[int] = None
    root_folder_path: str = ""
    minimum_availability: str = "announced"

    @property
    def clean_url_base(self) -> str:
        raw = (self.url_base or "").strip().strip("/")
        return f"/{raw}" if raw else ""


class SonarrConfig(BaseModel):
    enabled: bool = False
    host: str = "127.0.0.1"
    port: int = 8989
    url_base: str = ""
    api_key: str = ""
    use_ssl: bool = False
    quality_profile_id: Optional[int] = None
    root_folder_path: str = ""
    series_type: str = "standard"
    season_folder: bool = True
    language_profile_id: Optional[int] = None

    @property
    def clean_url_base(self) -> str:
        raw = (self.url_base or "").strip().strip("/")
        return f"/{raw}" if raw else ""


class QualityProfile(BaseModel):
    id: int
    name: str


class RootFolder(BaseModel):
    id: int
    path: str
    free_space: Optional[int] = None


class RadarrMovie(BaseModel):
    id: int
    title: str
    year: Optional[int] = None
    tmdb_id: Optional[int] = None
    imdb_id: Optional[str] = None
    overview: Optional[str] = None
    monitored: bool = True
    has_file: bool = False
    path: Optional[str] = None
    size_on_disk: Optional[int] = None
    status: Optional[str] = None
    images: List[Dict[str, Any]] = Field(default_factory=list)


class SonarrSeries(BaseModel):
    id: int
    title: str
    year: Optional[int] = None
    tvdb_id: Optional[int] = None
    imdb_id: Optional[str] = None
    overview: Optional[str] = None
    monitored: bool = True
    episode_count: Optional[int] = None
    episode_file_count: Optional[int] = None
    status: Optional[str] = None
    path: Optional[str] = None
    network: Optional[str] = None
    images: List[Dict[str, Any]] = Field(default_factory=list)


class ArrQueueRecord(BaseModel):
    id: int
    title: str
    status: str
    tracked_download_status: Optional[str] = None
    size: float = 0.0
    size_left: float = 0.0
    timeleft: Optional[str] = None
    estimated_completion_time: Optional[str] = None
    protocol: Optional[str] = None
    download_client: Optional[str] = None
    indexer: Optional[str] = None
    output_path: Optional[str] = None
    error_message: Optional[str] = None


class ArrQueueResponse(BaseModel):
    page: int = 1
    page_size: int = 50
    total_records: int = 0
    records: List[ArrQueueRecord] = Field(default_factory=list)


class AddRadarrMovieRequest(BaseModel):
    title: str
    tmdb_id: int
    year: Optional[int] = None
    quality_profile_id: Optional[int] = None
    root_folder_path: Optional[str] = None
    monitored: bool = True
    search_for_movie: bool = True
    minimum_availability: Optional[str] = None


class AddSonarrSeriesRequest(BaseModel):
    title: str
    tvdb_id: int
    year: Optional[int] = None
    quality_profile_id: Optional[int] = None
    root_folder_path: Optional[str] = None
    monitored: bool = True
    search_for_missing_episodes: bool = True
    series_type: Optional[str] = "standard"
    season_folder: bool = True


class ArrConnectionTestResult(BaseModel):
    ok: bool
    version: Optional[str] = None
    message: str = ""
