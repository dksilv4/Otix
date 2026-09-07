"""Google-Drive cloud-save proxy routes (legacy ``saves.py`` cloud handlers).

``GET /saves/{game_id}/files``, ``POST /saves/{game_id}/upload``,
``GET /saves/{game_id}/download/{file_id}`` and
``DELETE /saves/{game_id}/delete/{file_id}`` proxy the user's Google Drive via
``GoogleDriveService``. ``DriveRequestError`` (not-linked 401, upstream 401/502)
is replayed verbatim; any other failure (including network transport errors)
surfaces as the per-route legacy 500 detail.
"""

from __future__ import annotations

import logging

from django.http import HttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.track.services.cloud_saves import (
    delete_cloud_file,
    download_cloud_file,
    list_cloud_files,
    upload_cloud_file,
)
from apps.track.services.google_drive import DriveRequestError

logger = logging.getLogger(__name__)

_LIST_FAILED = "Failed to retrieve file list from Google Drive."
_UPLOAD_FAILED = "Failed to upload file to Google Drive."
_DOWNLOAD_FAILED = "Failed to download file from Google Drive."
_DELETE_FAILED = "Failed to delete file from Google Drive."


def _drive_error_response(exc: DriveRequestError) -> Response:
    return Response({"detail": exc.detail}, status=exc.status)


class CloudSaveFilesView(APIView):
    """``GET /saves/{game_id}/files`` — recursive listing for a game/profile."""

    def get(self, request, game_id: str) -> Response:
        profile_id = request.query_params.get("profile_id", "default")
        try:
            files = list_cloud_files(request.user, game_id, profile_id)
        except DriveRequestError as exc:
            return _drive_error_response(exc)
        except Exception:
            logger.exception("failed to list cloud files", extra={"game_id": game_id})
            return Response({"detail": _LIST_FAILED}, status=500)
        return Response(files)


class CloudSaveUploadView(APIView):
    """``POST /saves/{game_id}/upload`` — create or update a save file.

    ``filename`` is a query parameter and may contain forward-slash segments
    (e.g. ``Saved/SaveGames/7656/save.bin``) that become a Drive subfolder
    hierarchy; the ``file`` part carries the raw bytes.
    """

    def post(self, request, game_id: str) -> Response:
        filename = request.query_params.get("filename")
        upload = request.FILES.get("file")
        if not filename:
            return Response({"detail": "filename query parameter is required."}, status=400)
        if upload is None:
            return Response({"detail": "Upload file is required."}, status=400)
        profile_id = request.query_params.get("profile_id", "default")
        file_id = request.query_params.get("file_id")
        try:
            result = upload_cloud_file(
                request.user,
                game_id,
                profile_id,
                filename,
                upload.read(),
                file_id,
            )
        except DriveRequestError as exc:
            return _drive_error_response(exc)
        except Exception:
            logger.exception("failed to upload cloud file game=%s filename=%s", game_id, filename)
            return Response({"detail": _UPLOAD_FAILED}, status=500)
        return Response(result)


class CloudSaveDownloadView(APIView):
    """``GET /saves/{game_id}/download/{file_id}`` — file binary content."""

    def get(self, request, game_id: str, file_id: str) -> Response:
        try:
            content = download_cloud_file(request.user, file_id)
        except DriveRequestError as exc:
            return _drive_error_response(exc)
        except Exception:
            logger.exception("failed to download cloud file game=%s file=%s", game_id, file_id)
            return Response({"detail": _DOWNLOAD_FAILED}, status=500)
        return HttpResponse(
            content,
            content_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={file_id}"},
        )


class CloudSaveDeleteView(APIView):
    """``DELETE /saves/{game_id}/delete/{file_id}`` — delete a save file."""

    def delete(self, request, game_id: str, file_id: str) -> Response:
        try:
            delete_cloud_file(request.user, file_id)
        except DriveRequestError as exc:
            return _drive_error_response(exc)
        except Exception:
            logger.exception("failed to delete cloud file game=%s file=%s", game_id, file_id)
            return Response({"detail": _DELETE_FAILED}, status=500)
        return Response({"status": "success"})
