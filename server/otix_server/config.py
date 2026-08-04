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
    registry_url: str = "https://api.otix.io"
    enable_upnp: bool = True
    enable_heartbeat: bool = True


class LibraryConfig(BaseModel):
    name: str
    path: str
    allowed_extensions: List[str] = [".iso", ".img", ".exe", ".zip", ".7z", ".rar"]


class SavesConfig(BaseModel):
    storage_path: str = "./storage/saves"
    max_snapshots_per_game: int = 10
    auto_backup_on_exit: bool = True


class AppConfig(BaseModel):
    server: ServerSettings = Field(default_factory=ServerSettings)
    game_libraries: List[LibraryConfig] = Field(default_factory=list)
    saves: SavesConfig = Field(default_factory=SavesConfig)


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
