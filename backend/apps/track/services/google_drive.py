"""Google Drive REST client (urllib) mirroring legacy ``google_drive_service.py``.

The cloud-save proxy routes talk only to the Drive v3 + upload APIs. Every
call funnels through the module ``_request`` leaf (the test seam): a Drive
HTTP status >= 400 maps to a typed ``DriveRequestError`` (401 -> reconnect
detail, otherwise 502 with the upstream body truncated to 200 chars like the
legacy ``resp.text[:200]``). Network failures (``URLError``/``OSError``/
timeouts) propagate to the route's generic 500, exactly as httpx transport
errors did in the legacy router.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"
DRIVE_AUTH_EXPIRED = "Google authorization expired. Please reconnect your account."
_FOLDER_MIME = "application/vnd.google-apps.folder"


class DriveRequestError(Exception):
    """An upstream Drive error (or pre-flight 401) with a client status/detail."""

    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _request(
    method: str,
    url: str,
    access_token: str,
    *,
    params: dict | None = None,
    headers: dict | None = None,
    content: bytes | None = None,
) -> tuple[int, bytes]:
    """Return ``(status, body_bytes)``; raises ``DriveRequestError`` on HTTP >= 400."""
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    req_headers = {"Authorization": f"Bearer {access_token}"}
    if headers:
        req_headers.update(headers)
    request = urllib.request.Request(url, data=content, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:  # Drive answered with an error status
        if exc.code == 401:
            raise DriveRequestError(401, DRIVE_AUTH_EXPIRED) from None
        snippet = exc.read()[:200].decode("utf-8", "replace")
        raise DriveRequestError(502, f"Google Drive API error: {snippet}") from None


def _json(body: bytes) -> dict:
    return json.loads(body.decode("utf-8", "replace"))


class GoogleDriveService:
    def get_or_create_folder(
        self, access_token: str, name: str, parent_id: str | None = None
    ) -> str:
        """Find a folder by name (and optional parent), or create it if not found."""
        query = f"mimeType = '{_FOLDER_MIME}' and name = '{name}' and trashed = false"
        if parent_id:
            query += f" and '{parent_id}' in parents"
        _, body = _request(
            "GET",
            DRIVE_FILES_URL,
            access_token,
            params={"q": query, "fields": "files(id, name)"},
        )
        files = _json(body).get("files", [])
        if files:
            return str(files[0]["id"])

        create = {"name": name, "mimeType": _FOLDER_MIME}
        if parent_id:
            create["parents"] = [parent_id]
        _, body = _request(
            "POST",
            DRIVE_FILES_URL,
            access_token,
            headers={"Content-Type": "application/json"},
            content=json.dumps(create).encode("utf-8"),
        )
        return str(_json(body)["id"])

    def ensure_folder_path(
        self, access_token: str, folder_parts: list[str], root_parent_id: str
    ) -> str:
        """Create a nested folder hierarchy under root_parent_id, return the leaf id."""
        parent_id = root_parent_id
        for part in folder_parts:
            parent_id = self.get_or_create_folder(access_token, part, parent_id=parent_id)
        return parent_id

    def list_files_recursive(
        self, access_token: str, folder_id: str, parent_path: str = ""
    ) -> list[dict]:
        """List all files in a folder tree, prefixing ``name`` with relative paths."""
        all_files: list[dict] = []
        params = {
            "q": f"'{folder_id}' in parents and trashed = false",
            "fields": "files(id, name, mimeType, md5Checksum, modifiedTime, size)",
        }
        _, body = _request("GET", DRIVE_FILES_URL, access_token, params=params)
        for item in _json(body).get("files", []):
            if item.get("mimeType") == _FOLDER_MIME:
                sub_path = f"{parent_path}{item['name']}/" if parent_path else f"{item['name']}/"
                all_files.extend(self.list_files_recursive(access_token, item["id"], sub_path))
            else:
                item["name"] = f"{parent_path}{item['name']}" if parent_path else item["name"]
                all_files.append(item)
        return all_files

    def upload_file(
        self,
        access_token: str,
        folder_id: str,
        filename: str,
        content: bytes,
        file_id: str | None = None,
    ) -> dict:
        """Upload a file; when ``file_id`` is given, update (overwrite) that file."""
        if file_id:
            url = f"{DRIVE_UPLOAD_URL}/{file_id}?uploadType=media"
            _, body = _request(
                "PATCH",
                url,
                access_token,
                headers={"Content-Type": "application/octet-stream"},
                content=content,
            )
            return dict(_json(body))

        url = f"{DRIVE_UPLOAD_URL}?uploadType=multipart"
        boundary = "otix_saves_boundary"
        metadata = {"name": filename, "parents": [folder_id]}
        multipart = (
            (
                f"--{boundary}\r\n"
                "Content-Type: application/json; charset=UTF-8\r\n\r\n"
                f"{json.dumps(metadata)}\r\n"
                f"--{boundary}\r\n"
                "Content-Type: application/octet-stream\r\n\r\n"
            ).encode()
            + content
            + f"\r\n--{boundary}--\r\n".encode()
        )
        _, body = _request(
            "POST",
            url,
            access_token,
            headers={"Content-Type": f"multipart/related; boundary={boundary}"},
            content=multipart,
        )
        return dict(_json(body))

    def download_file(self, access_token: str, file_id: str) -> bytes:
        """Download a file's binary content."""
        url = f"{DRIVE_FILES_URL}/{file_id}?alt=media"
        _, body = _request("GET", url, access_token)
        return body

    def delete_file(self, access_token: str, file_id: str) -> None:
        """Delete a file from Google Drive."""
        url = f"{DRIVE_FILES_URL}/{file_id}"
        _request("DELETE", url, access_token)
