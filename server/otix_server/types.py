from __future__ import annotations

from pydantic import BaseModel


class HostedFile(BaseModel):
    id: str
    filename: str
    filepath: str
    filesize: int
    sha256_head: str
    extension: str
    format_category: str = "installer"
    library_name: str
    game_title: str
    matched_igdb_id: str | None = None
    modified_at: str | None = None
