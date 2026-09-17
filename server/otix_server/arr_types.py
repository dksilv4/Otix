from __future__ import annotations

from typing import Any, Dict, List, Optional, Union
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


def _new_instance_id() -> str:
    return uuid4().hex[:12]


class RadarrInstance(BaseModel):
    id: str = Field(default_factory=_new_instance_id)
    name: str = "Default"
    enabled: bool = True
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


class SonarrInstance(BaseModel):
    id: str = Field(default_factory=_new_instance_id)
    name: str = "Default"
    enabled: bool = True
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


def _legacy_present(data: dict, keys: tuple[str, ...]) -> bool:
    return any(key in data and data.get(key) not in (None, "") for key in keys)


def _redact_key(value: str) -> str:
    return "***" if value else ""


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
    instances: List[RadarrInstance] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_instances(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        data = dict(data)
        if data.get("instances"):
            return data
        if _legacy_present(
            data,
            ("host", "port", "api_key", "url_base", "use_ssl", "quality_profile_id", "root_folder_path"),
        ):
            data["instances"] = [
                {
                    "id": "default",
                    "name": "Default",
                    "enabled": bool(data.get("enabled", True)),
                    "host": data.get("host") or "127.0.0.1",
                    "port": data.get("port") or 7878,
                    "url_base": data.get("url_base") or "",
                    "api_key": data.get("api_key") or "",
                    "use_ssl": bool(data.get("use_ssl", False)),
                    "quality_profile_id": data.get("quality_profile_id"),
                    "root_folder_path": data.get("root_folder_path") or "",
                    "minimum_availability": data.get("minimum_availability") or "announced",
                }
            ]
        return data

    @model_validator(mode="after")
    def sync_flat_fields(self) -> "RadarrConfig":
        if self.instances:
            inst = self.resolve()
            self.host = inst.host
            self.port = inst.port
            self.url_base = inst.url_base
            self.api_key = inst.api_key
            self.use_ssl = inst.use_ssl
            self.quality_profile_id = inst.quality_profile_id
            self.root_folder_path = inst.root_folder_path
            self.minimum_availability = inst.minimum_availability
            if any(item.enabled for item in self.instances):
                self.enabled = True
        return self

    def resolve(self, instance_id: Optional[str] = None) -> RadarrInstance:
        if not self.instances:
            return RadarrInstance(
                id="default",
                name="Default",
                enabled=self.enabled,
                host=self.host,
                port=self.port,
                url_base=self.url_base,
                api_key=self.api_key,
                use_ssl=self.use_ssl,
                quality_profile_id=self.quality_profile_id,
                root_folder_path=self.root_folder_path,
                minimum_availability=self.minimum_availability,
            )
        if instance_id:
            for inst in self.instances:
                if inst.id == instance_id:
                    return inst
        for inst in self.instances:
            if inst.enabled:
                return inst
        return self.instances[0]

    def ensure_instance(self) -> RadarrInstance:
        if not self.instances:
            self.instances = [
                RadarrInstance(
                    id="default",
                    name="Default",
                    enabled=True,
                    host=self.host,
                    port=self.port,
                    url_base=self.url_base,
                    api_key=self.api_key,
                    use_ssl=self.use_ssl,
                    quality_profile_id=self.quality_profile_id,
                    root_folder_path=self.root_folder_path,
                    minimum_availability=self.minimum_availability,
                )
            ]
        return self.instances[0]

    def apply_flat_to_instance(self) -> None:
        inst = self.ensure_instance()
        inst.host = self.host
        inst.port = self.port
        inst.url_base = self.url_base
        inst.api_key = self.api_key
        inst.use_ssl = self.use_ssl
        inst.quality_profile_id = self.quality_profile_id
        inst.root_folder_path = self.root_folder_path
        inst.minimum_availability = self.minimum_availability
        inst.enabled = True if self.enabled else inst.enabled

    @property
    def clean_url_base(self) -> str:
        return self.resolve().clean_url_base


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
    instances: List[SonarrInstance] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_instances(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        data = dict(data)
        if data.get("instances"):
            return data
        if _legacy_present(
            data,
            (
                "host",
                "port",
                "api_key",
                "url_base",
                "use_ssl",
                "quality_profile_id",
                "root_folder_path",
                "series_type",
                "season_folder",
                "language_profile_id",
            ),
        ):
            data["instances"] = [
                {
                    "id": "default",
                    "name": "Default",
                    "enabled": bool(data.get("enabled", True)),
                    "host": data.get("host") or "127.0.0.1",
                    "port": data.get("port") or 8989,
                    "url_base": data.get("url_base") or "",
                    "api_key": data.get("api_key") or "",
                    "use_ssl": bool(data.get("use_ssl", False)),
                    "quality_profile_id": data.get("quality_profile_id"),
                    "root_folder_path": data.get("root_folder_path") or "",
                    "series_type": data.get("series_type") or "standard",
                    "season_folder": data.get("season_folder", True),
                    "language_profile_id": data.get("language_profile_id"),
                }
            ]
        return data

    @model_validator(mode="after")
    def sync_flat_fields(self) -> "SonarrConfig":
        if self.instances:
            inst = self.resolve()
            self.host = inst.host
            self.port = inst.port
            self.url_base = inst.url_base
            self.api_key = inst.api_key
            self.use_ssl = inst.use_ssl
            self.quality_profile_id = inst.quality_profile_id
            self.root_folder_path = inst.root_folder_path
            self.series_type = inst.series_type
            self.season_folder = inst.season_folder
            self.language_profile_id = inst.language_profile_id
            if any(item.enabled for item in self.instances):
                self.enabled = True
        return self

    def resolve(self, instance_id: Optional[str] = None) -> SonarrInstance:
        if not self.instances:
            return SonarrInstance(
                id="default",
                name="Default",
                enabled=self.enabled,
                host=self.host,
                port=self.port,
                url_base=self.url_base,
                api_key=self.api_key,
                use_ssl=self.use_ssl,
                quality_profile_id=self.quality_profile_id,
                root_folder_path=self.root_folder_path,
                series_type=self.series_type,
                season_folder=self.season_folder,
                language_profile_id=self.language_profile_id,
            )
        if instance_id:
            for inst in self.instances:
                if inst.id == instance_id:
                    return inst
        for inst in self.instances:
            if inst.enabled:
                return inst
        return self.instances[0]

    def ensure_instance(self) -> SonarrInstance:
        if not self.instances:
            self.instances = [
                SonarrInstance(
                    id="default",
                    name="Default",
                    enabled=True,
                    host=self.host,
                    port=self.port,
                    url_base=self.url_base,
                    api_key=self.api_key,
                    use_ssl=self.use_ssl,
                    quality_profile_id=self.quality_profile_id,
                    root_folder_path=self.root_folder_path,
                    series_type=self.series_type,
                    season_folder=self.season_folder,
                    language_profile_id=self.language_profile_id,
                )
            ]
        return self.instances[0]

    def apply_flat_to_instance(self) -> None:
        inst = self.ensure_instance()
        inst.host = self.host
        inst.port = self.port
        inst.url_base = self.url_base
        inst.api_key = self.api_key
        inst.use_ssl = self.use_ssl
        inst.quality_profile_id = self.quality_profile_id
        inst.root_folder_path = self.root_folder_path
        inst.series_type = self.series_type
        inst.season_folder = self.season_folder
        inst.language_profile_id = self.language_profile_id
        inst.enabled = True if self.enabled else inst.enabled

    @property
    def clean_url_base(self) -> str:
        return self.resolve().clean_url_base


def serialize_radarr_config(config: RadarrConfig) -> Dict[str, Any]:
    inst = config.resolve()
    instances = []
    for item in config.instances or [inst]:
        instances.append(
            {
                "id": item.id,
                "name": item.name,
                "enabled": item.enabled,
                "host": item.host,
                "port": item.port,
                "api_key": _redact_key(item.api_key),
                "apiKey": _redact_key(item.api_key),
                "use_ssl": item.use_ssl,
                "useSsl": item.use_ssl,
                "url_base": item.url_base,
                "urlBase": item.url_base,
                "quality_profile_id": item.quality_profile_id,
                "qualityProfileId": item.quality_profile_id,
                "root_folder_path": item.root_folder_path,
                "rootFolderPath": item.root_folder_path,
                "minimum_availability": item.minimum_availability,
                "minimumAvailability": item.minimum_availability,
                "has_api_key": bool(item.api_key),
                "hasApiKey": bool(item.api_key),
            }
        )
    return {
        "enabled": config.enabled or any(item.enabled for item in (config.instances or [])),
        "host": inst.host,
        "port": inst.port,
        "api_key": _redact_key(inst.api_key),
        "apiKey": _redact_key(inst.api_key),
        "use_ssl": inst.use_ssl,
        "useSsl": inst.use_ssl,
        "url_base": inst.url_base,
        "urlBase": inst.url_base,
        "quality_profile_id": inst.quality_profile_id,
        "qualityProfileId": inst.quality_profile_id,
        "root_folder_path": inst.root_folder_path,
        "rootFolderPath": inst.root_folder_path,
        "minimum_availability": inst.minimum_availability,
        "minimumAvailability": inst.minimum_availability,
        "configured": bool(inst.host and inst.api_key),
        "has_api_key": bool(inst.api_key),
        "hasApiKey": bool(inst.api_key),
        "instances": instances,
    }


def serialize_sonarr_config(config: SonarrConfig) -> Dict[str, Any]:
    inst = config.resolve()
    instances = []
    for item in config.instances or [inst]:
        instances.append(
            {
                "id": item.id,
                "name": item.name,
                "enabled": item.enabled,
                "host": item.host,
                "port": item.port,
                "api_key": _redact_key(item.api_key),
                "apiKey": _redact_key(item.api_key),
                "use_ssl": item.use_ssl,
                "useSsl": item.use_ssl,
                "url_base": item.url_base,
                "urlBase": item.url_base,
                "quality_profile_id": item.quality_profile_id,
                "qualityProfileId": item.quality_profile_id,
                "root_folder_path": item.root_folder_path,
                "rootFolderPath": item.root_folder_path,
                "series_type": item.series_type,
                "seriesType": item.series_type,
                "season_folder": item.season_folder,
                "seasonFolder": item.season_folder,
                "language_profile_id": item.language_profile_id,
                "languageProfileId": item.language_profile_id,
                "has_api_key": bool(item.api_key),
                "hasApiKey": bool(item.api_key),
            }
        )
    return {
        "enabled": config.enabled or any(item.enabled for item in (config.instances or [])),
        "host": inst.host,
        "port": inst.port,
        "api_key": _redact_key(inst.api_key),
        "apiKey": _redact_key(inst.api_key),
        "use_ssl": inst.use_ssl,
        "useSsl": inst.use_ssl,
        "url_base": inst.url_base,
        "urlBase": inst.url_base,
        "quality_profile_id": inst.quality_profile_id,
        "qualityProfileId": inst.quality_profile_id,
        "root_folder_path": inst.root_folder_path,
        "rootFolderPath": inst.root_folder_path,
        "series_type": inst.series_type,
        "seriesType": inst.series_type,
        "season_folder": inst.season_folder,
        "seasonFolder": inst.season_folder,
        "language_profile_id": inst.language_profile_id,
        "languageProfileId": inst.language_profile_id,
        "configured": bool(inst.host and inst.api_key),
        "has_api_key": bool(inst.api_key),
        "hasApiKey": bool(inst.api_key),
        "instances": instances,
    }


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
    tmdb_id: Optional[int] = None
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
    tmdb_id: Optional[int] = None
    tvdb_id: Optional[int] = None


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
    instance_id: Optional[str] = None


class AddSonarrSeriesRequest(BaseModel):
    title: Optional[str] = None
    tvdb_id: Optional[int] = None
    tmdb_id: Optional[int] = None
    year: Optional[int] = None
    quality_profile_id: Optional[int] = None
    root_folder_path: Optional[str] = None
    monitored: bool = True
    search_for_missing_episodes: bool = True
    series_type: Optional[str] = "standard"
    season_folder: bool = True
    instance_id: Optional[str] = None

    @model_validator(mode="after")
    def require_external_id(self) -> "AddSonarrSeriesRequest":
        if self.tvdb_id is None and self.tmdb_id is None:
            raise ValueError("tvdb_id or tmdb_id is required")
        return self


class ArrConnectionTestResult(BaseModel):
    ok: bool
    version: Optional[str] = None
    message: str = ""


ArrClientConfig = Union[RadarrConfig, RadarrInstance, SonarrConfig, SonarrInstance]
