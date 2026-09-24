from __future__ import annotations

import os
from pathlib import Path
from typing import List
import yaml
from pydantic import BaseModel, Field


class ServerSettings(BaseModel):
    name: str = "Otix Game Server"
    port: int = 8000
    host: str = "0.0.0.0"
    auth_token: str = "otix_secret_token"
    registry_url: str = ""
    enable_upnp: bool = True
    enable_heartbeat: bool = False
    downloads_path: str = "./storage/downloads"


GAME_EXTENSIONS = [".iso", ".img", ".exe", ".zip", ".7z", ".rar"]
ISO_EXTENSIONS = [".iso", ".img", ".chd", ".rvz", ".nkit", ".cso"]


class LibraryConfig(BaseModel):
    name: str
    path: str
    kind: str = "game"  # "game" | "iso"
    allowed_extensions: List[str] = Field(default_factory=lambda: list(GAME_EXTENSIONS))


class SavesConfig(BaseModel):
    storage_path: str = "./storage/saves"
    max_snapshots_per_game: int = 10
    auto_backup_on_exit: bool = True


from otix_server.usenet_types import UsenetConfig
from otix_server.arr_types import RadarrConfig, SonarrConfig


class DesktopSettings(BaseModel):
    launch_on_startup: bool = False
    minimize_to_tray: bool = False
    close_to_tray: bool = False
    always_on_top: bool = False
    start_minimized: bool = False
    games_download_path: str = ""
    games_install_path: str = ""
    scan_on_launch: bool = False


class OrganizeSettings(BaseModel):
    post_process_enabled: bool = True
    auto_search_wishlist: bool = False
    wishlist_interval_hours: int = 12
    preferred_repackers: str = ""
    allow_hypervisor: bool = False
    auto_organize_enabled: bool = False
    naming_template: str = "{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}"
    iso_download_path: str = ""


class AppConfig(BaseModel):
    server: ServerSettings = Field(default_factory=ServerSettings)
    game_libraries: List[LibraryConfig] = Field(default_factory=list)
    saves: SavesConfig = Field(default_factory=SavesConfig)
    usenet: UsenetConfig = Field(default_factory=UsenetConfig)
    radarr: RadarrConfig = Field(default_factory=RadarrConfig)
    sonarr: SonarrConfig = Field(default_factory=SonarrConfig)
    desktop: DesktopSettings = Field(default_factory=DesktopSettings)
    organize: OrganizeSettings = Field(default_factory=OrganizeSettings)



def load_config(config_path: str | None = None) -> AppConfig:
    path = config_path or os.getenv("CONFIG_PATH", "config.yaml")
    p = Path(path)
    if not p.exists():
        example_p = p.parent / "config.example.yaml"
        if example_p.exists():
            p = example_p
        else:
            return AppConfig()

    try:
        with open(p, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return AppConfig.model_validate(data)
    except Exception as err:
        print(f"[Warning] Failed to load config from {p}: {err}. Using default settings.")
        return AppConfig()


def save_config(config: AppConfig, config_path: str | None = None) -> bool:
    """Save updated application configuration to YAML file."""
    path = config_path or os.getenv("CONFIG_PATH", "config.yaml")
    p = Path(path)
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        dump_data = config.model_dump()
        with open(p, "w", encoding="utf-8") as f:
            yaml.safe_dump(dump_data, f, default_flow_style=False, sort_keys=False)
        return True
    except Exception as err:
        print(f"[Error] Failed to save config to {p}: {err}")
        return False

