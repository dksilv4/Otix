# backend/otix/api/integrations/saves.py
from __future__ import annotations

import io

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain import GameSaveOfficialPath, GameSavePathSuggestion, MediaItem
from otix.domain.user import User
from otix.services.google_auth_service import get_user_google_access_token
from otix.services.google_drive_service import GoogleDriveService

logger = structlog.get_logger()
router = APIRouter(prefix="/saves", tags=["Saves Sync"])
drive_service = GoogleDriveService()


async def get_google_access_token(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> str:
    """Dependency helper to get a valid Google access token."""
    token = await get_user_google_access_token(current_user, session=db)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account is not linked or permission has expired. Please reconnect Google in Settings.",
        )
    return token


async def get_profile_folder_id(access_token: str, game_id: str, profile_id: str) -> str:
    """Helper to locate or create the nesting folders: Otix Game Saves -> game_id -> profile_id."""
    parent_id = await drive_service.get_or_create_folder(access_token, "Otix Game Saves")
    game_folder_id = await drive_service.get_or_create_folder(access_token, game_id, parent_id=parent_id)
    profile_folder_id = await drive_service.get_or_create_folder(access_token, profile_id, parent_id=game_folder_id)
    return profile_folder_id


@router.get("/{game_id}/files")
async def list_cloud_files(
    game_id: str,
    profile_id: str = Query("default"),
    access_token: str = Depends(get_google_access_token),
) -> list[dict]:
    """List all game save files currently saved in Google Drive for this game/profile."""
    try:
        folder_id = await get_profile_folder_id(access_token, game_id, profile_id)
        files = await drive_service.list_files_recursive(access_token, folder_id)
        return files
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("failed to list cloud files", game_id=game_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve file list from Google Drive.",
        ) from err


@router.post("/{game_id}/upload")
async def upload_cloud_file(
    game_id: str,
    filename: str = Query(...),
    profile_id: str = Query("default"),
    file_id: str | None = Query(None),
    file: UploadFile = File(...),
    access_token: str = Depends(get_google_access_token),
) -> dict:
    """Upload or update a game save file in Google Drive.

    ``filename`` may contain forward-slash path segments (e.g.
    ``Saved/SaveGames/7656/save.bin``) to preserve subfolder structure as
    Google Drive folders.
    """
    try:
        content = await file.read()
        profile_folder_id = await get_profile_folder_id(access_token, game_id, profile_id)

        # Split relative path into folder hierarchy + basename
        parts = filename.replace("\\", "/").split("/")
        basename = parts[-1]
        folder_parts = parts[:-1]

        parent_id = profile_folder_id
        if folder_parts:
            parent_id = await drive_service.ensure_folder_path(
                access_token,
                folder_parts,
                profile_folder_id,
            )

        result = await drive_service.upload_file(
            access_token,
            parent_id,
            basename,
            content,
            file_id=file_id,
        )
        return result
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("failed to upload cloud file", game_id=game_id, filename=filename)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload file to Google Drive.",
        ) from err


@router.get("/{game_id}/download/{file_id}")
async def download_cloud_file(
    game_id: str,
    file_id: str,
    access_token: str = Depends(get_google_access_token),
) -> StreamingResponse:
    """Download a save file's binary content from Google Drive."""
    try:
        content = await drive_service.download_file(access_token, file_id)
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={file_id}"},
        )
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("failed to download cloud file", game_id=game_id, file_id=file_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to download file from Google Drive.",
        ) from err


@router.delete("/{game_id}/delete/{file_id}")
async def delete_cloud_file(
    game_id: str,
    file_id: str,
    access_token: str = Depends(get_google_access_token),
) -> dict:
    """Delete a save file from Google Drive."""
    try:
        await drive_service.delete_file(access_token, file_id)
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("failed to delete cloud file", game_id=game_id, file_id=file_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete file from Google Drive.",
        ) from err


class SaveLocationSuggestionRequest(BaseModel):
    platform: str
    path_pattern: str


class SaveLocationResponse(BaseModel):
    platform: str
    path_pattern: str
    is_verified: bool


class GameSaveLocationsResponse(BaseModel):
    game_id: str
    verified: list[SaveLocationResponse]
    suggested: list[dict]


CONSENSUS_THRESHOLD = 3


@router.get("/locations/{media_item_id}", response_model=GameSaveLocationsResponse)
async def get_save_locations(
    media_item_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Retrieve verified and suggested save path patterns for a game."""
    # Ensure media item exists
    media_item = await db.scalar(select(MediaItem).where(MediaItem.id == media_item_id))
    if not media_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Game not found.",
        )

    # Fetch official paths
    official_stmt = select(GameSaveOfficialPath).where(GameSaveOfficialPath.game_id == media_item_id)
    official_rows = (await db.scalars(official_stmt)).all()

    # Fetch suggestion aggregates
    suggested_stmt = (
        select(
            GameSavePathSuggestion.platform,
            GameSavePathSuggestion.path_pattern,
            func.count(GameSavePathSuggestion.id).label("count"),
        )
        .where(GameSavePathSuggestion.game_id == media_item_id)
        .group_by(GameSavePathSuggestion.platform, GameSavePathSuggestion.path_pattern)
        .order_by(func.count(GameSavePathSuggestion.id).desc())
    )
    suggested_rows = (await db.execute(suggested_stmt)).all()

    verified = [
        SaveLocationResponse(
            platform=row.platform,
            path_pattern=row.path_pattern,
            is_verified=row.is_verified,
        )
        for row in official_rows
    ]

    suggested = [
        {
            "platform": row.platform,
            "path_pattern": row.path_pattern,
            "count": row.count,
        }
        for row in suggested_rows
    ]

    return {
        "game_id": media_item_id,
        "verified": verified,
        "suggested": suggested,
    }


@router.post("/locations/{media_item_id}/suggest")
async def suggest_save_location(
    media_item_id: str,
    req: SaveLocationSuggestionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Submit a game save location suggestion for user confirmation and consensus aggregation."""
    # Ensure media item exists
    media_item = await db.scalar(select(MediaItem).where(MediaItem.id == media_item_id))
    if not media_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Game not found.",
        )

    # Upsert user suggestion
    stmt = select(GameSavePathSuggestion).where(
        GameSavePathSuggestion.user_id == current_user.id,
        GameSavePathSuggestion.game_id == media_item_id,
        GameSavePathSuggestion.platform == req.platform,
    )
    existing = await db.scalar(stmt)
    if existing:
        existing.path_pattern = req.path_pattern
    else:
        suggestion = GameSavePathSuggestion(
            game_id=media_item_id,
            user_id=current_user.id,
            platform=req.platform,
            path_pattern=req.path_pattern,
        )
        db.add(suggestion)

    await db.flush()

    # Calculate consensus
    count_stmt = select(func.count(GameSavePathSuggestion.id)).where(
        GameSavePathSuggestion.game_id == media_item_id,
        GameSavePathSuggestion.platform == req.platform,
        GameSavePathSuggestion.path_pattern == req.path_pattern,
    )
    suggestion_count = await db.scalar(count_stmt)

    promoted = False
    if suggestion_count >= CONSENSUS_THRESHOLD:
        # Promote to official verified path
        official_stmt = select(GameSaveOfficialPath).where(
            GameSaveOfficialPath.game_id == media_item_id,
            GameSaveOfficialPath.platform == req.platform,
        )
        official = await db.scalar(official_stmt)
        if official:
            official.path_pattern = req.path_pattern
            official.is_verified = True
        else:
            official = GameSaveOfficialPath(
                game_id=media_item_id,
                platform=req.platform,
                path_pattern=req.path_pattern,
                is_verified=True,
            )
            db.add(official)
        promoted = True

    await db.commit()

    return {
        "status": "success",
        "suggestion_count": suggestion_count,
        "promoted_to_official": promoted,
    }
