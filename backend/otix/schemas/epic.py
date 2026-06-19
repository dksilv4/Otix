"""Pydantic schemas for the Epic Games Store integration."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# ── Incoming payload from the JS plugin ──────────────────────────────

class EpicGamePayload(BaseModel):
    """A single game from the user's Epic Games library."""

    epic_app_id: str = Field(..., description="Epic Store app name (e.g. 'Fortnite')")
    title: str = Field(..., max_length=512)
    developer: str | None = None
    publisher: str | None = None
    is_installed: bool = False
    install_size: int | None = None
    last_played: datetime | None = None
    platform: str | None = "Windows"
    metadata: dict | None = None
    """Extra info forwarded from legendary (version, etc.)."""


class EpicLibraryPushRequest(BaseModel):
    """Full payload pushed by the Epic plugin after a legendary scan."""

    account_id: str = Field(..., description="Epic account ID")
    display_name: str | None = None
    games: list[EpicGamePayload] = Field(..., max_length=5000)
    """Full library snapshot (owned games + installed games)."""


# ── Response schemas ─────────────────────────────────────────────────

class EpicGameResult(BaseModel):
    """Result for a single game in the ingestion pipeline."""

    epic_app_id: str
    title: str
    status: str = Field(..., pattern=r"^(matched|created|unmatched|failed)$")
    media_item_id: str | None = None
    match_type: str | None = Field(
        None, pattern=r"^(local|external_id|igdb_crossref|igdb_search|igdb_fuzzy|trigram|none)$",
    )


class EpicLibraryPushResponse(BaseModel):
    """Response after processing an Epic library push."""

    account_id: str
    matched: int = 0
    created: int = 0
    unmatched: int = 0
    failed: int = 0
    total: int = 0
    synced: int = 0
    results: list[EpicGameResult] = []


# ── Library view schemas ─────────────────────────────────────────────

class UserEpicGameSummary(BaseModel):
    """Epic game entry for the library tab."""

    epic_app_id: str
    title: str
    developer: str | None = None
    publisher: str | None = None
    is_installed: bool = False
    install_size: int | None = None
    last_played: datetime | None = None
    is_matched: bool = False
    media_item_id: str | None = None

    model_config = {"from_attributes": True}


class UserEpicGameListResponse(BaseModel):
    """Paginated list of Epic games."""

    items: list[UserEpicGameSummary]
    next_cursor: str | None = None
    has_more: bool = False


# ── Integration status ───────────────────────────────────────────────

class EpicIntegrationStatus(BaseModel):
    """Epic integration status for the current user."""

    connected: bool = False
    epic_id: str | None = None
    epic_display_name: str | None = None
    game_count: int = 0
    matched_count: int = 0
    unmatched_count: int = 0
    last_scanned_at: datetime | None = None


# ── Disconnect ───────────────────────────────────────────────────────

class EpicDisconnectResponse(BaseModel):
    """Response after unlinking Epic integration."""

    success: bool = True
    message: str = "Epic Games account unlinked"
