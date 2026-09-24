#!/usr/bin/env python3
"""
Otix User Simulation Script

Uses a local Ollama model (gemma4) to simulate a real user:
- Registers a new user
- Browses discover page (hero, sections, trending/popular/top_rated for all media types)
- Interacts with media (likes, watchlists, marks as watched/played)
- Rates and reviews media
- Watches episodes for shows
"""

from __future__ import annotations

import asyncio
import json
import random
import sys
import time
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

import httpx

# ── Configuration ──────────────────────────────────────────────────────────

API_BASE = "http://localhost:8000/api/v1"
OLLAMA_BASE = "http://localhost:11434"
OLLAMA_MODEL = "gemma4"  # or "otis" — gemma4 is more capable

USER_EMAIL = f"simuser_{uuid.uuid4().hex[:8]}@example.com"
USERNAME = f"simuser_{uuid.uuid4().hex[:8]}"
PASSWORD = "SimUser123!"

MEDIA_TYPES = ["movie", "show", "game", "music"]
LIST_TYPES = ["trending", "popular", "top_rated"]

# How many items to fetch per list query
LIST_LIMIT = 20

# Probability of performing each action type
P_INTERACT = 0.6  # probability to add an interaction (like/watchlist/etc)
P_RATING = 0.5  # probability to rate
P_REVIEW = 0.2  # probability to write a review (lower since it's more effort)
P_SPOILER = 0.1  # probability the review is a spoiler

# Delay range between actions (seconds)
MIN_DELAY = 1.0
MAX_DELAY = 3.0

# ── Ollama Client ──────────────────────────────────────────────────────────


class OllamaClient:
    """Talk to a local Ollama instance."""

    def __init__(self, base_url: str = OLLAMA_BASE, model: str = OLLAMA_MODEL):
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def _ensure_model(self) -> None:
        """Check the model is available; pull if not."""
        async with httpx.AsyncClient() as c:
            resp = await c.get(f"{self.base_url}/api/tags")
            resp.raise_for_status()
            models = {m["name"].split(":")[0] for m in resp.json()["models"]}
            if self.model not in models:
                print(f"  Pulling model {self.model} (first time may take a while)...")
                payload = {"name": self.model, "stream": False}
                resp2 = await c.post(f"{self.base_url}/api/pull", json=payload, timeout=None)
                resp2.raise_for_status()
                print(f"  Model {self.model} ready.")

    async def generate(
        self,
        system: str,
        prompt: str,
        *,
        temperature: float = 0.8,
        max_tokens: int = 256,
    ) -> str:
        """Generate text with Ollama."""
        payload = {
            "model": self.model,
            "system": system,
            "prompt": prompt,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=60.0) as c:
            resp = await c.post(f"{self.base_url}/api/generate", json=payload)
            resp.raise_for_status()
            return resp.json()["response"].strip()

    async def decide(self, prompt: str) -> str:
        """Get a short decision from the model (for choosing actions)."""
        system = (
            "You are a media-enthusiast user of a social tracking app. "
            "Respond with ONLY a single short answer. No explanation. No markdown."
        )
        return await self.generate(system, prompt, temperature=0.7, max_tokens=30)

    async def write_review(self, title: str, media_type: str) -> str:
        """Write a review for a media item."""
        system = (
            "You are a passionate media fan writing a short, authentic review. "
            "Write 1-3 natural sentences expressing your opinion. "
            "Do NOT use markdown. Just plain text. "
            "Vary your tone: sometimes enthusiastic, sometimes critical, sometimes thoughtful."
        )
        review_prompts = [
            f"Write a short review of the {media_type} titled '{title}'. What did you think of it?",
            f"Review '{title}'. Be honest — what worked and what didn't?",
            f"What's your take on '{title}'? Write a quick review.",
            f"Tell me about '{title}' — is it worth experiencing?",
        ]
        prompt = random.choice(review_prompts)
        return await self.generate(system, prompt, temperature=0.9, max_tokens=200)


# ── Otix API Client ────────────────────────────────────────────────────────


class OtixClient:
    """Thin HTTP client for the Otix API."""

    def __init__(self, base: str = API_BASE):
        self.base = base.rstrip("/")
        self.token: str | None = None
        self.username: str | None = None

    @property
    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    async def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        url = f"{self.base}{path}"
        async with httpx.AsyncClient(timeout=30.0) as c:
            resp = await c.request(method, url, headers=self._headers, **kwargs)
            return resp

    async def register(self, email: str, username: str, password: str) -> None:
        body = {
            "email": email,
            "username": username,
            "password": password,
            "confirm_password": password,
            "date_of_birth": "1990-01-01",
        }
        resp = await self._request("POST", "/auth/register", json=body)
        if resp.status_code == 409:
            print(f"  [!] User '{username}' already exists, logging in instead.")
            await self.login(email, password)
            return
        resp.raise_for_status()
        data = resp.json()
        self.token = data["access_token"]
        self.username = data["user"]["username"]
        print(f"  [+] Registered user: {self.username} (id={data['user']['id'][:8]}...)")

    async def login(self, identity: str, password: str) -> None:
        body = {"identity": identity, "password": password}
        resp = await self._request("POST", "/auth/login", json=body)
        resp.raise_for_status()
        data = resp.json()
        if data.get("two_factor_required"):
            raise RuntimeError("2FA required — cannot proceed with simulation login")
        self.token = data["access_token"]
        self.username = identity
        print(f"  [+] Logged in as: {self.username}")

    async def discover_hero(self) -> list[dict]:
        resp = await self._request("GET", "/discover/hero?limit=9")
        resp.raise_for_status()
        return resp.json().get("items", [])

    async def discover_sections(self) -> list[dict]:
        resp = await self._request("GET", "/discover/sections")
        resp.raise_for_status()
        return resp.json().get("sections", [])

    async def discover_list(self, media_type: str, list_type: str) -> list[dict]:
        resp = await self._request(
            "GET",
            f"/discover/{media_type}/{list_type}?limit={LIST_LIMIT}",
        )
        resp.raise_for_status()
        return resp.json().get("items", [])

    async def set_interaction(self, media_type: str, media_id: str, interaction: str) -> bool:
        resp = await self._request(
            "PUT",
            f"/media/{media_type}/{media_id}/interactions/{interaction}",
            json={"extra_data": {}},
        )
        if resp.status_code == 200:
            return True
        # 422 means the interaction type isn't valid for this media type (e.g. "listened" for movie)
        return False

    async def set_rating(self, media_type: str, media_id: str, score: int) -> bool:
        resp = await self._request(
            "PUT",
            f"/media/{media_type}/{media_id}/rating",
            json={"score": score},
        )
        return resp.status_code == 200

    async def write_review(
        self, media_type: str, media_id: str, title: str, content: str, is_spoiler: bool = False
    ) -> bool:
        resp = await self._request(
            "PUT",
            f"/media/{media_type}/{media_id}/review",
            json={
                "title": title[:200] if title else "",
                "content": content[:5000],
                "is_spoiler": is_spoiler,
                "is_private": False,
            },
        )
        return resp.status_code == 200


# ── Simulation Logic ───────────────────────────────────────────────────────


def pick_interaction(media_type: str) -> str | None:
    """Pick a random interaction type appropriate for the media type."""
    opts = []
    if media_type == "movie":
        opts = ["liked", "watchlisted", "watched"]
    elif media_type == "show":
        opts = ["liked", "watchlisted", "watched", "started"]
    elif media_type == "game":
        opts = ["liked", "watchlisted", "played"]
    elif media_type == "music":
        opts = ["liked", "listened"]
    return random.choice(opts)


async def pick_rating(ollama: OllamaClient, title: str, media_type: str) -> int:
    """Use Ollama to decide a rating 1-10."""
    prompt = (
        f"Rate the {media_type} '{title}' from 1 to 10. Respond with ONLY the number, nothing else."
    )
    try:
        raw = await ollama.decide(prompt)
        score = int("".join(c for c in raw if c.isdigit()) or "5")
        return max(1, min(10, score))
    except Exception:
        return random.randint(4, 9)


def format_title(item: dict) -> str:
    """Extract a display title from a media item."""
    return item.get("title") or item.get("name") or "Unknown"


async def simulate_browsing_and_interaction(ollama: OllamaClient, otix: OtixClient) -> dict:
    """Main simulation: browse discover pages, interact with media."""
    stats = {
        "items_seen": 0,
        "interactions": 0,
        "ratings": 0,
        "reviews": 0,
        "errors": 0,
    }

    seen_ids: set[str] = set()
    all_items: list[dict] = []

    # ── Phase 1: Browse discover pages ──────────────────────────────────
    print("\n  ── Phase 1: Browsing Discover ──")

    # Hero section
    print("  Fetching hero...")
    hero_items = await otix.discover_hero()
    for item in hero_items:
        if item["id"] not in seen_ids:
            seen_ids.add(item["id"])
            all_items.append(item)

    # Discover sections (may give us {media_type, list_type} hints)
    print("  Fetching sections...")
    try:
        sections = await otix.discover_sections()
        for sec in sections:
            mt = sec.get("media_type")
            lt = sec.get("list_type") or sec.get("type")
            if mt and lt:
                try:
                    items = await otix.discover_list(mt, lt)
                    for item in items:
                        if item["id"] not in seen_ids:
                            seen_ids.add(item["id"])
                            all_items.append(item)
                    await asyncio.sleep(random.uniform(0.3, 0.8))
                except Exception:
                    pass
    except Exception as e:
        print(f"  [!] Sections fetch failed: {e}")

    # All media_types x list_types
    print("  Fetching media lists (trending/popular/top_rated)...")
    for mt in MEDIA_TYPES:
        for lt in LIST_TYPES:
            try:
                items = await otix.discover_list(mt, lt)
                for item in items:
                    if item["id"] not in seen_ids:
                        seen_ids.add(item["id"])
                        all_items.append(item)
                # Brief pause between requests
                await asyncio.sleep(random.uniform(0.2, 0.5))
            except Exception as e:
                print(f"    [!] {mt}/{lt}: {e}")

    print(f"  Found {len(all_items)} unique media items across discover pages.\n")

    # ── Phase 2: Interact with each item ────────────────────────────────
    print(f"  ── Phase 2: Interacting ({len(all_items)} items) ──")

    # Shuffle so we don't just process in API order
    random.shuffle(all_items)

    for idx, item in enumerate(all_items):
        media_id = item["id"]
        media_type = item.get("media_type", "movie")
        title = format_title(item)

        stats["items_seen"] += 1
        print(f"  [{idx + 1}/{len(all_items)}] {media_type}: {title[:50]}...", end="", flush=True)

        actions_taken: list[str] = []

        try:
            # ── Interaction (like/watchlist/watched/etc) ──
            if random.random() < P_INTERACT:
                interaction = pick_interaction(media_type)
                if interaction:
                    ok = await otix.set_interaction(media_type, media_id, interaction)
                    if ok:
                        actions_taken.append(interaction)
                        stats["interactions"] += 1
                    delay_smart()

            # ── Rating ──
            if random.random() < P_RATING:
                score = await pick_rating(ollama, title, media_type)
                ok = await otix.set_rating(media_type, media_id, score)
                if ok:
                    actions_taken.append(f"rated {score}/10")
                    stats["ratings"] += 1
                    delay_smart()

            # ── Review ──
            if random.random() < P_REVIEW:
                review_text = await ollama.write_review(title, media_type)
                is_spoiler = random.random() < P_SPOILER
                review_title = ""
                ok = await otix.write_review(
                    media_type, media_id, review_title, review_text, is_spoiler
                )
                if ok:
                    actions_taken.append(f"reviewed ({len(review_text)} chars)")
                    stats["reviews"] += 1
                    delay_smart()

        except Exception as e:
            stats["errors"] += 1
            print(f"  ERROR: {e}", end="", flush=True)

        if actions_taken:
            print(f"  → {', '.join(actions_taken)}")
        else:
            print("  → skipped")

    return stats


def delay_smart() -> None:
    """Wait a bit to simulate human reading / thinking time."""
    time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))


# ── Main ───────────────────────────────────────────────────────────────────


async def main():
    print("=" * 60)
    print("  Otix User Simulation")
    print("=" * 60)
    print(f"  API:       {API_BASE}")
    print(f"  Ollama:    {OLLAMA_BASE} ({OLLAMA_MODEL})")
    print(f"  User:      {USERNAME}")
    print(f"  Time:      {datetime.now(timezone.utc).isoformat()}")
    print()

    # ── Init clients ────────────────────────────────────────────────────
    ollama = OllamaClient(model=OLLAMA_MODEL)
    otix = OtixClient()

    # ── Ensure Ollama model is ready ────────────────────────────────────
    print("[1/3] Ensuring Ollama model is available...")
    try:
        await ollama._ensure_model()
    except Exception as e:
        print(f"  [!] Ollama check failed: {e}")
        print("  Make sure Ollama is running: `ollama serve`")
        sys.exit(1)
    print()

    # ── Register / Login ────────────────────────────────────────────────
    print("[2/3] Authenticating with Otix...")
    try:
        await otix.register(USER_EMAIL, USERNAME, PASSWORD)
    except Exception as e:
        print(f"  [!] Auth failed: {e}")
        sys.exit(1)
    print()

    # ── Simulate browsing and interaction ───────────────────────────────
    print("[3/3] Running simulation...")
    start = time.time()
    stats = await simulate_browsing_and_interaction(ollama, otix)
    elapsed = time.time() - start

    # ── Summary ─────────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print("  Simulation Complete")
    print("=" * 60)
    print(f"  Duration:       {elapsed:.0f}s")
    print(f"  Items seen:     {stats['items_seen']}")
    print(f"  Interactions:   {stats['interactions']}")
    print(f"  Ratings:        {stats['ratings']}")
    print(f"  Reviews:        {stats['reviews']}")
    print(f"  Errors:         {stats['errors']}")
    print(f"  User:           {USERNAME}")
    print(f"  Email:          {USER_EMAIL}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
