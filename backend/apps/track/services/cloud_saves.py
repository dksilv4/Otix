"""Google-Drive cloud-save orchestration (legacy ``saves.py`` cloud handlers).

Each function mirrors one legacy cloud route's logic: resolve a usable Drive
access token (401-as-``DriveRequestError`` when the user has no Drive link or
the token can no longer refresh), walk/create the ``Otix Game Saves ->
game_id -> profile_id`` folder chain, then delegate to ``GoogleDriveService``.
Upstream errors already surface as ``DriveRequestError``; anything else (e.g.
a network transport failure) propagates and the view turns it into the
per-route legacy 500 detail.
"""

from __future__ import annotations

from apps.accounts.services.oauth import get_user_google_drive_access_token
from apps.track.services.google_drive import DriveRequestError, GoogleDriveService

DRIVE_NOT_LINKED = (
    "Google Drive not linked or permission expired. Please reconnect Google Drive in Settings."
)

_drive = GoogleDriveService()


def _require_token(user) -> str:
    """Return a usable Drive token or raise the not-linked 401."""
    token = get_user_google_drive_access_token(user)
    if token is None:
        raise DriveRequestError(401, DRIVE_NOT_LINKED)
    return token


def _profile_folder_id(access_token: str, game_id: str, profile_id: str) -> str:
    parent = _drive.get_or_create_folder(access_token, "Otix Game Saves")
    game_folder = _drive.get_or_create_folder(access_token, game_id, parent_id=parent)
    return _drive.get_or_create_folder(access_token, profile_id, parent_id=game_folder)


def list_cloud_files(user, game_id: str, profile_id: str) -> list[dict]:
    token = _require_token(user)
    folder_id = _profile_folder_id(token, game_id, profile_id)
    return _drive.list_files_recursive(token, folder_id)


def upload_cloud_file(
    user,
    game_id: str,
    profile_id: str,
    filename: str,
    content: bytes,
    file_id: str | None,
) -> dict:
    token = _require_token(user)
    profile_folder = _profile_folder_id(token, game_id, profile_id)
    parts = filename.replace("\\", "/").split("/")
    basename = parts[-1]
    folder_parts = parts[:-1]
    parent_id = profile_folder
    if folder_parts:
        parent_id = _drive.ensure_folder_path(token, folder_parts, profile_folder)
    return _drive.upload_file(token, parent_id, basename, content, file_id=file_id)


def download_cloud_file(user, file_id: str) -> bytes:
    token = _require_token(user)
    return _drive.download_file(token, file_id)


def delete_cloud_file(user, file_id: str) -> None:
    token = _require_token(user)
    _drive.delete_file(token, file_id)
