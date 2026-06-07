# backend/otix/services/google_drive_service.py
from __future__ import annotations

import json

import httpx
import structlog
from fastapi import HTTPException, status

logger = structlog.get_logger()


class GoogleDriveService:
    @staticmethod
    async def _request(
        method: str,
        url: str,
        access_token: str,
        headers: dict | None = None,
        **kwargs,
    ) -> httpx.Response:
        """Helper to make authenticated HTTP requests to Google APIs."""
        req_headers = {
            "Authorization": f"Bearer {access_token}",
        }
        if headers:
            req_headers.update(headers)

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(method, url, headers=req_headers, **kwargs)
            if resp.status_code >= 400:
                logger.warning(
                    "google drive api error",
                    status_code=resp.status_code,
                    body=resp.text,
                    url=url,
                )
                if resp.status_code == 401:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Google authorization expired. Please reconnect your account.",
                    )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Google Drive API error: {resp.text[:200]}",
                )
            return resp

    async def get_or_create_folder(self, access_token: str, name: str, parent_id: str | None = None) -> str:
        """Find a folder by name (and optional parent), or create it if not found."""
        query = f"mimeType = 'application/vnd.google-apps.folder' and name = '{name}' and trashed = false"
        if parent_id:
            query += f" and '{parent_id}' in parents"

        url = "https://www.googleapis.com/drive/v3/files"
        resp = await self._request(
            "GET",
            url,
            access_token,
            params={"q": query, "fields": "files(id, name)"},
        )
        data = resp.json()
        files = data.get("files", [])

        if files:
            folder_id = files[0]["id"]
            logger.info("found google drive folder", name=name, folder_id=folder_id)
            return str(folder_id)

        # Create folder
        logger.info("creating google drive folder", name=name)
        create_headers = {"Content-Type": "application/json"}
        body = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
        }
        if parent_id:
            body["parents"] = [parent_id]

        resp = await self._request(
            "POST",
            url,
            access_token,
            headers=create_headers,
            content=json.dumps(body),
        )
        new_folder = resp.json()
        new_id = new_folder["id"]
        logger.info("created google drive folder", name=name, folder_id=new_id)
        return str(new_id)

    async def ensure_folder_path(self, access_token: str, folder_parts: list[str], root_parent_id: str) -> str:
        """Create nested folder hierarchy under root_parent_id, return leaf folder ID."""
        parent_id = root_parent_id
        for part in folder_parts:
            parent_id = await self.get_or_create_folder(access_token, part, parent_id=parent_id)
        return parent_id

    async def list_files_recursive(self, access_token: str, folder_id: str, parent_path: str = "") -> list[dict]:
        """List all files in a folder and its subfolders recursively.

        Returns file metadata with reconstructed full relative paths in ``name``.
        """
        all_files: list[dict] = []
        url = "https://www.googleapis.com/drive/v3/files"
        params = {
            "q": f"'{folder_id}' in parents and trashed = false",
            "fields": "files(id, name, mimeType, md5Checksum, modifiedTime, size)",
        }
        resp = await self._request("GET", url, access_token, params=params)
        data = resp.json()
        for item in data.get("files", []):
            if item.get("mimeType") == "application/vnd.google-apps.folder":
                sub_path = f"{parent_path}{item['name']}/" if parent_path else f"{item['name']}/"
                sub_files = await self.list_files_recursive(access_token, item["id"], sub_path)
                all_files.extend(sub_files)
            else:
                item["name"] = f"{parent_path}{item['name']}" if parent_path else item["name"]
                all_files.append(item)
        return all_files

    async def list_files(self, access_token: str, folder_id: str) -> list[dict]:
        """List files inside a folder (returns name, id, md5Checksum, modifiedTime, size)."""
        query = f"'{folder_id}' in parents and trashed = false"
        url = "https://www.googleapis.com/drive/v3/files"
        resp = await self._request(
            "GET",
            url,
            access_token,
            params={
                "q": query,
                "fields": "files(id, name, md5Checksum, modifiedTime, size)",
            },
        )
        data = resp.json()
        return list(data.get("files", []))

    async def upload_file(
        self,
        access_token: str,
        folder_id: str,
        filename: str,
        content: bytes,
        file_id: str | None = None,
    ) -> dict:
        """Upload a file. If file_id is provided, updates (overwrites) it."""
        if file_id:
            logger.info("updating google drive file", filename=filename, file_id=file_id)
            url = f"https://www.googleapis.com/upload/drive/v3/files/{file_id}?uploadType=media"
            resp = await self._request(
                "PATCH",
                url,
                access_token,
                headers={"Content-Type": "application/octet-stream"},
                content=content,
            )
            return dict(resp.json())

        # Create new file using multipart/related
        logger.info("uploading new google drive file", filename=filename)
        url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
        boundary = "otix_saves_boundary"
        metadata = {
            "name": filename,
            "parents": [folder_id],
        }

        # Build multipart payload manually to guarantee drive compatibility
        multipart_body = (
            (
                f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{json.dumps(metadata)}\r\n--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n"
            ).encode()
            + content
            + f"\r\n--{boundary}--\r\n".encode()
        )

        resp = await self._request(
            "POST",
            url,
            access_token,
            headers={"Content-Type": f"multipart/related; boundary={boundary}"},
            content=multipart_body,
        )
        return dict(resp.json())

    async def download_file(self, access_token: str, file_id: str) -> bytes:
        """Download binary content of a file."""
        logger.info("downloading google drive file", file_id=file_id)
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
        resp = await self._request("GET", url, access_token)
        return resp.content

    async def delete_file(self, access_token: str, file_id: str) -> None:
        """Delete a file from Google Drive."""
        logger.info("deleting google drive file", file_id=file_id)
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
        await self._request("DELETE", url, access_token)
