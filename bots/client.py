from __future__ import annotations

import json
import random
import time
from pathlib import Path

import httpx
import structlog

from bots.config import (
    API_BASE_URL,
    API_TIMEOUT,
    BOT_LOG_DIR,
    HTTP_POOL_LIMIT,
    HTTP_POOL_PER_HOST,
)

logger = structlog.get_logger()


class OtixClient:
    """Async HTTP client for the Otix API. Designed to be shared across all bots."""

    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None
        self._bot_tokens: dict[str, str] = {}  # bot_name -> token
        self._error_log_dir = Path(BOT_LOG_DIR)
        self._error_log_dir.mkdir(parents=True, exist_ok=True)

    async def start(self) -> None:
        limits = httpx.Limits(
            max_connections=HTTP_POOL_LIMIT,
            max_keepalive_connections=HTTP_POOL_PER_HOST,
        )
        self._client = httpx.AsyncClient(
            base_url=API_BASE_URL,
            timeout=httpx.Timeout(API_TIMEOUT),
            limits=limits,
        )

    async def stop(self) -> None:
        if self._client:
            await self._client.aclose()

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("Client not started")
        return self._client

    def _headers(self, bot_name: str) -> dict[str, str]:
        token = self._bot_tokens.get(bot_name)
        if token:
            return {"Authorization": f"Bearer {token}"}
        return {}

    # ── error logging ─────────────────────────────────────

    async def _request(
        self,
        bot_name: str,
        method: str,
        path: str,
        **kwargs: object,
    ) -> httpx.Response:
        """Wrapper that logs errors with full context for bug detection."""
        headers = self._headers(bot_name)
        if "headers" in kwargs:
            extra = kwargs.pop("headers")
            if isinstance(extra, dict):
                headers = {**headers, **extra}

        r = await self.client.request(method, path, headers=headers, **kwargs)

        if r.status_code >= 400:
            self._log_error(bot_name, method, path, r, kwargs)
        return r

    def _log_error(
        self,
        bot_name: str,
        method: str,
        path: str,
        response: httpx.Response,
        kwargs: dict,
    ) -> None:
        """Save a structured error log for later analysis. Silent for 401/404/409 (expected)."""
        # Only log unexpected errors to console; write all to file
        if response.status_code >= 500:
            logger.warning("api_5xx", bot=bot_name, method=method, path=path, status=response.status_code)

        error_entry = {
            "timestamp": time.time(),
            "bot": bot_name,
            "method": method,
            "path": path,
            "status_code": response.status_code,
            "request_kwargs": {k: str(v)[:500] for k, v in kwargs.items()},
            "response_body": None,
        }
        try:
            body = response.text[:2000]
            error_entry["response_body"] = body
        except Exception:
            pass

        log_line = json.dumps(error_entry, default=str)
        bot_log = self._error_log_dir / f"{bot_name}.jsonl"
        try:
            with open(bot_log, "a") as f:
                f.write(log_line + "\n")
        except Exception:
            pass

    # ── auth ──────────────────────────────────────────────

    async def register(self, bot_name: str, email: str, username: str, password: str, dob: str = "1995-06-15") -> str | None:
        r = await self._request(bot_name, "POST", "/auth/register", json={
            "email": email,
            "username": username,
            "password": password,
            "date_of_birth": dob,
        })
        if r.status_code == 201:
            data = r.json()
            self._bot_tokens[bot_name] = data["access_token"]
            return data["access_token"]
        return None

    async def login(self, bot_name: str, identity: str, password: str) -> str | None:
        r = await self._request(bot_name, "POST", "/auth/login", json={
            "identity": identity, "password": password,
        })
        data = r.json()
        if "access_token" in data and data["access_token"]:
            self._bot_tokens[bot_name] = data["access_token"]
            return data["access_token"]
        return None

    # ── profile ───────────────────────────────────────────

    async def get_me(self, bot_name: str) -> dict | None:
        r = await self._request(bot_name, "GET", "/auth/me")
        return r.json() if r.status_code == 200 else None

    async def update_profile(self, bot_name: str, **fields: object) -> dict | None:
        r = await self._request(bot_name, "PATCH", "/auth/me", json=fields)
        return r.json() if r.status_code == 200 else None

    # ── discover ──────────────────────────────────────────

    async def discover_hero(self, bot_name: str) -> dict | None:
        r = await self._request(bot_name, "GET", "/discover/hero",
                                params={"exclude_adult": "true"})
        return r.json() if r.status_code == 200 else None

    async def discover_sections(self, bot_name: str) -> dict | None:
        r = await self._request(bot_name, "GET", "/discover/sections")
        return r.json() if r.status_code == 200 else None

    async def discover_list(self, bot_name: str, media_type: str, list_type: str,
                            page: int = 1, page_size: int = 20) -> dict | None:
        r = await self._request(bot_name, "GET", f"/discover/{media_type}/{list_type}",
                                params={"page": page, "page_size": page_size})
        return r.json() if r.status_code == 200 else None

    # ── media ─────────────────────────────────────────────

    async def media_detail(self, bot_name: str, media_id: str) -> dict | None:
        r = await self._request(bot_name, "GET", f"/media/{media_id}")
        return r.json() if r.status_code == 200 else None

    async def media_search(self, bot_name: str, q: str, media_type: str | None = None,
                           page: int = 1, page_size: int = 20) -> dict | None:
        params: dict[str, object] = {"q": q, "page": page, "page_size": page_size}
        if media_type:
            params["media_type"] = media_type
        r = await self._request(bot_name, "GET", "/media/search", params=params)
        if r.status_code == 200:
            data = r.json()
            items = data.get("items", [])
            total = data.get("total")
            logger.info("bot.search_result",
                        bot=bot_name,
                        query=q,
                        media_type=media_type,
                        page=page,
                        total=total if total is not None else 0,
                        items_returned=len(items),
                        tracks=len(data.get("tracks", [])),
                        backfill_pending=data.get("backfill_pending", False))
            return data
        return None

    async def media_browse(self, bot_name: str, media_type: str | None = None,
                           page: int = 1, page_size: int = 20,
                           sort_by: str = "popularity") -> dict | None:
        params: dict[str, object] = {"page": page, "page_size": page_size, "sort_by": sort_by}
        if media_type:
            params["media_type"] = media_type
        r = await self._request(bot_name, "GET", "/media", params=params)
        return r.json() if r.status_code == 200 else None

    async def media_genres(self, bot_name: str) -> list | None:
        r = await self._request(bot_name, "GET", "/media/genres")
        return r.json() if r.status_code == 200 else None

    # ── interactions ──────────────────────────────────────

    async def get_interactions(self, bot_name: str, media_id: str) -> dict | None:
        r = await self._request(bot_name, "GET", f"/media/{media_id}/interactions")
        return r.json() if r.status_code == 200 else None

    async def set_interaction(self, bot_name: str, media_id: str, interaction_type: str) -> dict | None:
        r = await self._request(bot_name, "PUT",
                                f"/media/{media_id}/interactions/{interaction_type}",
                                json={"extra_data": None})
        return r.json() if r.status_code == 200 else None

    # ── reviews ───────────────────────────────────────────

    async def get_review(self, bot_name: str, media_id: str) -> dict | None:
        r = await self._request(bot_name, "GET", f"/media/{media_id}/review")
        return r.json() if r.status_code == 200 else None

    async def put_review(self, bot_name: str, media_id: str, score: int | None = None,
                         content: str | None = None) -> dict | None:
        r = await self._request(bot_name, "PUT", f"/media/{media_id}/review", json={
            "score": score, "content": content,
            "is_spoiler": False, "is_private": False,
        })
        return r.json() if r.status_code == 200 else None

    async def get_reviews(self, bot_name: str, media_id: str) -> list | None:
        r = await self._request(bot_name, "GET", f"/media/{media_id}/reviews")
        return r.json() if r.status_code == 200 else None

    async def vote_review(self, bot_name: str, review_user_id: str,
                          media_item_id: str, vote_type: str = "up") -> bool:
        r = await self._request(bot_name, "POST",
                                f"/reviews/{review_user_id}/{media_item_id}/vote",
                                json={"vote_type": vote_type})
        return r.status_code == 204

    # ── users ─────────────────────────────────────────────

    async def user_profile(self, bot_name: str, username: str) -> dict | None:
        r = await self._request(bot_name, "GET", f"/users/{username}")
        return r.json() if r.status_code == 200 else None

    async def user_reviews(self, bot_name: str, username: str) -> list | None:
        r = await self._request(bot_name, "GET", f"/users/{username}/reviews")
        return r.json() if r.status_code == 200 else None

    async def user_stats(self, bot_name: str, username: str) -> dict | None:
        r = await self._request(bot_name, "GET", f"/users/{username}/stats")
        return r.json() if r.status_code == 200 else None

    async def put_user_rating(self, bot_name: str, username: str, score: int) -> dict | None:
        r = await self._request(bot_name, "PUT", f"/users/{username}/rating",
                                json={"score": score})
        return r.json() if r.status_code == 200 else None

    # ── people / artists ──────────────────────────────────

    async def people_list(self, bot_name: str, page: int = 1) -> dict | None:
        r = await self._request(bot_name, "GET", "/person", params={"page": page})
        return r.json() if r.status_code == 200 else None

    async def person_detail(self, bot_name: str, person_id: str) -> dict | None:
        r = await self._request(bot_name, "GET", f"/person/{person_id}")
        return r.json() if r.status_code == 200 else None

    async def person_search(self, bot_name: str, q: str) -> dict | None:
        r = await self._request(bot_name, "GET", "/person/search", params={"q": q})
        return r.json() if r.status_code == 200 else None

    # ── follow ────────────────────────────────────────────

    async def follow(self, bot_name: str, target_username: str) -> bool:
        r = await self._request(bot_name, "POST", f"/users/{target_username}/follow")
        return r.status_code == 201

    async def unfollow(self, bot_name: str, target_username: str) -> bool:
        r = await self._request(bot_name, "DELETE", f"/users/{target_username}/follow")
        return r.status_code == 204

    async def followers(self, bot_name: str) -> list | None:
        r = await self._request(bot_name, "GET", f"/users/{bot_name}/followers")
        return r.json() if r.status_code == 200 else None

    async def following(self, bot_name: str) -> list | None:
        r = await self._request(bot_name, "GET", f"/users/{bot_name}/following")
        return r.json() if r.status_code == 200 else None

    async def follow_status(self, bot_name: str, target_username: str) -> dict | None:
        r = await self._request(bot_name, "GET", f"/users/{target_username}/follow/status")
        return r.json() if r.status_code == 200 else None

    # ── library ───────────────────────────────────────────

    async def library(self, bot_name: str, tab: str = "overview", page: int = 1) -> dict | None:
        r = await self._request(bot_name, "GET", f"/library/{tab}",
                                params={"page": page, "page_size": 20})
        return r.json() if r.status_code == 200 else None

    # ── lists ─────────────────────────────────────────────

    async def list_create(self, bot_name: str, name: str, description: str = "",
                          is_public: bool = True) -> dict | None:
        r = await self._request(bot_name, "POST", "/list", json={
            "name": name, "description": description, "is_public": is_public,
        })
        return r.json() if r.status_code in (200, 201) else None

    async def list_get(self, bot_name: str, list_id: str) -> dict | None:
        r = await self._request(bot_name, "GET", f"/list/{list_id}")
        return r.json() if r.status_code == 200 else None

    async def lists_all(self, bot_name: str) -> list | None:
        r = await self._request(bot_name, "GET", "/list")
        return r.json() if r.status_code == 200 else None

    async def lists_mine(self, bot_name: str) -> list | None:
        r = await self._request(bot_name, "GET", "/list/mine")
        return r.json() if r.status_code == 200 else None

    async def list_add_item(self, bot_name: str, list_id: str,
                            media_item_id: str) -> dict | None:
        r = await self._request(bot_name, "POST", f"/list/{list_id}/item",
                                json={"media_item_id": media_item_id})
        return r.json() if r.status_code in (200, 201) else None

    async def list_remove_item(self, bot_name: str, list_id: str,
                               media_item_id: str) -> bool:
        r = await self._request(bot_name, "DELETE",
                                f"/list/{list_id}/item/{media_item_id}")
        return r.status_code == 204

    async def list_get_collaborators(self, bot_name: str, list_id: str) -> list | None:
        r = await self._request(bot_name, "GET", f"/list/{list_id}/collaborators")
        return r.json() if r.status_code == 200 else None

    async def list_add_collaborator(self, bot_name: str, list_id: str,
                                    user_id: str, permission: str = "VIEW") -> dict | None:
        r = await self._request(bot_name, "POST", f"/list/{list_id}/collaborators",
                                json={"user_id": user_id, "permission": permission})
        return r.json() if r.status_code in (200, 201) else None

    async def list_like(self, bot_name: str, list_id: str) -> dict | None:
        r = await self._request(bot_name, "POST", f"/list/{list_id}/like")
        return r.json() if r.status_code == 200 else None

    async def list_unlike(self, bot_name: str, list_id: str) -> dict | None:
        r = await self._request(bot_name, "DELETE", f"/list/{list_id}/like")
        return r.json() if r.status_code == 200 else None

    # ── notifications ─────────────────────────────────────

    async def notifications(self, bot_name: str) -> list | None:
        r = await self._request(bot_name, "GET", "/notifications")
        return r.json() if r.status_code == 200 else None
