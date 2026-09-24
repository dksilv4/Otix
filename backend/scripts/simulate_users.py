#!/usr/bin/env python3
"""
Otix User Simulation Script

Creates multiple AI-powered personas that browse, interact, rate, review,
follow, befriend, and hype up the admin. Each persona has a distinct
personality, taste profile, and communication style.

Personalities:
  - 🎬 Cinephile Chloe — Movie connoisseur, writes sharp reviews
  - 🎮 Gamer Gary — Game enthusiast, casual but enthusiastic
  - 📺 Binge-Watcher Bella — Show addict, emotional reviews
  - 🎧 Audiophile Alex — Music taste-maker, poetic taste
  - 🍿 Casual Chris — All-rounder, follows the crowd
"""

from __future__ import annotations

import asyncio
import json
import random
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone

import httpx

# ── Configuration ──────────────────────────────────────────────────────────

API_BASE = "http://localhost:8000/api/v1"
OLLAMA_BASE = "http://localhost:11434"
OLLAMA_MODEL = "gemma4"

ADMIN_USERNAME = "admin"  # the admin user to hype up

MEDIA_TYPES = ["movie", "show", "game", "music"]
LIST_TYPES = ["trending", "popular", "top_rated"]
LIST_LIMIT = 20

MIN_ACTION_DELAY = 1.0
MAX_ACTION_DELAY = 2.5

# ── Persona Definitions ────────────────────────────────────────────────────

PERSONAS = [
    {
        "name": "Cinephile Chloe",
        "base_username": "cinephile_chloe",
        "bio": "Film school grad. I've seen everything from Tarkovsky to Transformers. If you haven't seen Come and See, don't talk to me about 'intense cinema.' Letterboxd 4 lyfe.",
        "preferred_media_types": ["movie", "show"],
        "preferred_genres": ["drama", "thriller", "sci-fi", "documentary", "horror"],
        "country": "US",
        "rating_style": "harsh",  # rates lower on average, very opinionated
        "interact_rate": 0.5,
        "rating_rate": 0.7,
        "review_rate": 0.35,
        "persona_prompt": (
            "You are a film buff who studied cinema. You have strong opinions and you're slightly pretentious."
            " You love foreign films, indie darlings, and 'elevated horror.'"
            " You think most Hollywood blockbusters are formulaic garbage."
            " Write like a critic who's seen everything — witty, sharp, occasionally sarcastic."
            " You tend to rate things low (4-7 range) unless it's truly exceptional (9-10)."
        ),
    },
    {
        "name": "Gamer Gary",
        "base_username": "gamer_gary",
        "bio": "Steam library of 800+ games, 40% unplayed. Favorite game is whatever I'm currently playing. Achievement hunter. PCMR. Currently addicted to Balatro and Hades II.",
        "preferred_media_types": ["game", "show"],
        "preferred_genres": ["action", "rpg", "strategy", "indie", "shooter"],
        "country": "GB",
        "rating_style": "generous",  # rates everything 6-10
        "interact_rate": 0.7,
        "rating_rate": 0.6,
        "review_rate": 0.25,
        "persona_prompt": (
            "You are a passionate gamer with a huge Steam library."
            " You're enthusiastic and positive, always finding something to appreciate."
            " You write casual, hype-filled reviews like you're talking to a friend."
            " You use gaming lingo: 'runs great on deck', 'the gameplay loop is addictive', 'huge W', 'devs cooked with this one.'"
            " You tend to rate things high because you're generous (6-10)."
        ),
    },
    {
        "name": "Binge-Watcher Bella",
        "base_username": "binge_bella",
        "bio": "Will cancel plans for a new season drop. Currently on my 7th rewatch of Succession. If the episode count is less than 10, that's a green flag. No spoilers please!",
        "preferred_media_types": ["show", "movie"],
        "preferred_genres": ["drama", "comedy", "animation", "mystery", "thriller"],
        "country": "CA",
        "rating_style": "emotional",  # rates based on vibes, all over the place
        "interact_rate": 0.6,
        "rating_rate": 0.6,
        "review_rate": 0.3,
        "persona_prompt": (
            "You are a TV show addict who binges everything."
            " You're emotional and expressive — you get invested in characters easily."
            " You write short, punchy reviews that focus on how the show made you FEEL."
            " You use phrases like 'I'm not okay after that finale', 'this show has me in a chokehold', 'the chemistry is insane.'"
            " Your ratings depend entirely on how the media made you feel (anywhere from 2-10)."
        ),
    },
    {
        "name": "Audiophile Alex",
        "base_username": "audophile_alex",
        "bio": "Vinyl collector, festival goer, playlist curator. My music taste is 'eclectic' which is code for 'I can't decide on a genre.' RateYourMusic refugee. AMA about shoegaze.",
        "preferred_media_types": ["music"],
        "preferred_genres": ["electronic", "rock", "hip-hop", "jazz", "ambient"],
        "country": "DE",
        "rating_style": "thoughtful",  # rates mid-range, writes analytical reviews
        "interact_rate": 0.4,
        "rating_rate": 0.5,
        "review_rate": 0.25,
        "persona_prompt": (
            "You are a music nerd with eclectic taste — you go from ambient to death metal in one playlist."
            " You write poetic, slightly abstract reviews that focus on the 'vibe' and 'texture' of the music."
            " You reference obscure genres like 'shoegaze', 'drone', 'vaporwave', 'math rock.'"
            " You say things like 'the production is so lush', 'this album is a journey', 'the mixing is immaculate.'"
            " You rate thoughtfully — mid to high range (5-9)."
        ),
    },
    {
        "name": "Casual Chris",
        "base_username": "casual_chris",
        "bio": "Just here to find stuff to watch/play/listen. I like what I like 🤷 Not deep. If it's popular, there's probably a reason. Send me your recs!",
        "preferred_media_types": ["movie", "show", "game", "music"],
        "preferred_genres": ["comedy", "action", "adventure", "pop"],
        "country": "AU",
        "rating_style": "casual",  # rates 5-8, short reviews
        "interact_rate": 0.8,  # likes everything, very interactive
        "rating_rate": 0.3,  # doesn't rate much
        "review_rate": 0.1,  # rarely reviews
        "persona_prompt": (
            "You are a casual media consumer — you just want to find good stuff."
            " You're not a critic, you just know what you like."
            " Short, simple reactions: 'this was fun', 'not bad', 'pretty good tbh'."
            " You like popular things and you're not ashamed of it."
            " You tend to rate things positively (6-8) because if you didn't like it you just move on."
            " Write very short reviews, 1 sentence max."
        ),
    },
]


# ── Ollama Client ──────────────────────────────────────────────────────────


@dataclass
class OllamaStats:
    calls: int = 0


class OllamaClient:
    """Talk to a local Ollama instance."""

    def __init__(self, base_url: str = OLLAMA_BASE, model: str = OLLAMA_MODEL):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.stats = OllamaStats()

    async def _ensure_model(self) -> None:
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
        temperature: float = 0.9,
        max_tokens: int = 600,
        retries: int = 2,
    ) -> str:
        """Generate text with Ollama using the chat API."""
        for attempt in range(retries + 1):
            try:
                payload = {
                    "model": self.model,
                    "system": system,
                    "messages": [{"role": "user", "content": prompt}],
                    "options": {"temperature": temperature, "num_predict": max_tokens},
                    "stream": False,
                }
                async with httpx.AsyncClient(timeout=120.0) as c:
                    resp = await c.post(f"{self.base_url}/api/chat", json=payload)
                    resp.raise_for_status()
                    self.stats.calls += 1
                    return resp.json()["message"]["content"].strip()
            except Exception as e:
                if attempt < retries:
                    await asyncio.sleep(2**attempt)
                    continue
                raise

    async def write_review(self, persona: str, title: str, media_type: str) -> str:
        system = (
            f"{persona}\n"
            "Keep your response very short — just 1-3 natural sentences. "
            "No explanations, no options, no markdown. Just the review."
        )
        prompts = [
            f"Write one short sentence reviewing the {media_type} '{title}'.",
            f"What do you think of '{title}'? One short sentence review.",
            f"Review '{title}' in your voice. 1-2 sentences max.",
        ]
        prompt = random.choice(prompts)
        return await self.generate(system, prompt, temperature=0.9, max_tokens=600)
        system = f"{persona}\nWrite a short, catchy review title (max 8 words). ONLY the title, no quotes."
        prompt = f"Write a review title for the {media_type} '{title}'."
        try:
            return await self.generate(system, prompt, temperature=0.8, max_tokens=30)
        except Exception:
            return ""


# ── Otix API Client ────────────────────────────────────────────────────────


class OtixClient:
    """HTTP client for the Otix API."""

    def __init__(self, base: str = API_BASE):
        self.base = base.rstrip("/")
        self.token: str | None = None
        self.user_id: str | None = None
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
            return await c.request(method, url, headers=self._headers, **kwargs)

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
            print(f"    [!] User '{username}' already exists, logging in.")
            await self.login(email, password)
            return
        resp.raise_for_status()
        data = resp.json()
        self.token = data["access_token"]
        self.user_id = data["user"]["id"]
        self.username = data["user"]["username"]
        print(f"    [+] Registered as '{self.username}' (id={self.user_id[:8]}...)")

    async def login(self, identity: str, password: str) -> None:
        body = {"identity": identity, "password": password}
        resp = await self._request("POST", "/auth/login", json=body)
        resp.raise_for_status()
        data = resp.json()
        if data.get("two_factor_required"):
            raise RuntimeError("2FA required, cannot proceed")
        self.token = data["access_token"]
        self.username = identity

    async def update_profile(self, **kwargs) -> None:
        resp = await self._request("PATCH", "/auth/me", json=kwargs)
        resp.raise_for_status()

    async def get_user_profile(self, username: str) -> dict | None:
        resp = await self._request("GET", f"/users/{username}")
        if resp.status_code == 200:
            return resp.json()
        return None

    async def follow_user(self, username: str) -> bool:
        resp = await self._request("POST", f"/users/{username}/follow")
        return resp.status_code in (200, 201)

    async def send_friend_request(self, user_id: str) -> bool:
        resp = await self._request("POST", f"/friends/requests/{user_id}")
        return resp.status_code == 201

    async def rate_user(self, username: str, score: int) -> bool:
        resp = await self._request("PUT", f"/users/{username}/rating", json={"score": score})
        return resp.status_code == 200

    async def discover_hero(self) -> list[dict]:
        resp = await self._request("GET", "/discover/hero?limit=9")
        resp.raise_for_status()
        return resp.json().get("items", [])

    async def discover_sections(self) -> list[dict]:
        resp = await self._request("GET", "/discover/sections")
        resp.raise_for_status()
        return resp.json().get("sections", [])

    async def discover_list(self, media_type: str, list_type: str) -> list[dict]:
        resp = await self._request("GET", f"/discover/{media_type}/{list_type}?limit={LIST_LIMIT}")
        resp.raise_for_status()
        return resp.json().get("items", [])

    async def set_interaction(self, media_type: str, media_id: str, interaction: str) -> bool:
        resp = await self._request(
            "PUT",
            f"/media/{media_type}/{media_id}/interactions/{interaction}",
            json={"extra_data": {}},
        )
        return resp.status_code == 200

    async def set_rating(self, media_type: str, media_id: str, score: int) -> bool:
        resp = await self._request(
            "PUT", f"/media/{media_type}/{media_id}/rating", json={"score": score}
        )
        return resp.status_code == 200

    async def write_review(
        self, media_type: str, media_id: str, title: str, content: str, is_spoiler: bool = False
    ) -> bool:
        resp = await self._request(
            "PUT",
            f"/media/{media_type}/{media_id}/review",
            json={
                "title": (title or "")[:200],
                "content": content[:5000],
                "is_spoiler": is_spoiler,
                "is_private": False,
            },
        )
        return resp.status_code == 200

    async def set_mood(self, mood: str) -> bool:
        """Set a mood check-in for today."""
        resp = await self._request(
            "PUT",
            "/user/mood",
            json={"mood": mood, "status": "submitted"},
        )
        return resp.status_code in (200, 201)


# ── Persona Simulation ─────────────────────────────────────────────────────


def format_title(item: dict) -> str:
    return item.get("title") or item.get("name") or "Unknown"


def generate_rating(style: str) -> int:
    """Generate a rating from 1-10 based on persona's rating style."""
    distributions = {
        "harsh": lambda: int(random.gauss(4.5, 1.8)),  # 2-7 mostly, rarely 9-10
        "generous": lambda: int(random.gauss(7.5, 1.5)),  # 5-10 mostly
        "emotional": lambda: random.choice([1, 2, 3, 6, 7, 8, 9, 10, 10]),  # wild swings
        "thoughtful": lambda: int(random.gauss(7.0, 1.5)),  # 5-9
        "casual": lambda: int(random.gauss(6.5, 1.2)),  # 5-8
    }
    fn = distributions.get(style, lambda: random.randint(4, 8))
    return max(1, min(10, fn()))


def pick_interaction(media_type: str) -> str | None:
    """Pick an interaction type based on media type and persona."""
    opts = {
        "movie": ["liked", "watchlisted", "watched"],
        "show": ["liked", "watchlisted", "watched", "started"],
        "game": ["liked", "watchlisted", "played"],
        "music": ["liked", "listened"],
    }
    choices = opts.get(media_type, ["liked"])
    return random.choice(choices)


async def simulate_persona(
    ollama: OllamaClient,
    persona: dict,
    admin_username: str,
) -> dict:
    """Run the full simulation for a single persona."""
    tag = persona["name"]
    base = persona["base_username"]
    uid = uuid.uuid4().hex[:6]
    email = f"{base}_{uid}@example.com"
    username = f"{base}_{uid}"
    password = "Persona123!"

    otix = OtixClient()
    stats = {
        "name": tag,
        "username": username,
        "items_seen": 0,
        "interactions": 0,
        "ratings": 0,
        "reviews": 0,
        "errors": 0,
    }

    # ── Register ──────────────────────────────────────────────────────
    print(f"\n  {'=' * 56}")
    print(f"  🌟 {tag}")
    print(f"  {'=' * 56}")
    print(f"    Bio: {persona['bio'][:70]}...")
    print(f"    Registering as '{username}'...")
    await otix.register(email, username, password)
    await asyncio.sleep(1)  # wait for DB commit

    # ── Set up profile ─────────────────────────────────────────────────
    print(f"    Setting up profile...")
    avatar_id = random.randint(1, 400)
    avatar_url = f"https://i.pravatar.cc/400?u={username}"
    bg_id = random.randint(1, 200)
    await otix.update_profile(
        bio=persona["bio"],
        avatar_url=avatar_url,
        preferred_media_types=persona["preferred_media_types"],
        preferred_genres=persona["preferred_genres"],
        country=persona["country"],
        onboarding_completed=True,
    )

    # ── Follow admin, send friend request, rate admin ──────────────────
    print(f"    Following @{admin_username}...")

    # Get admin's user profile to get their user_id
    admin_profile = await otix.get_user_profile(admin_username)
    if admin_profile:
        admin_id = admin_profile["id"]
        print(f"    Admin found: @{admin_username} (id={admin_id[:8]}...)")

        # Follow
        followed = await otix.follow_user(admin_username)
        print(f"    Follow @{admin_username}: {'✓' if followed else '✗'}")

        # Send friend request
        fr = await otix.send_friend_request(admin_id)
        print(f"    Friend request to @{admin_username}: {'✓' if fr else '✗'}")

        # Rate admin 5 stars
        rated = await otix.rate_user(admin_username, 5)
        print(f"    Rated @{admin_username} 5/5: {'✓' if rated else '✗'}")
    else:
        print(f"    [!] Could not find admin profile @{admin_username}")

    smart_delay()

    # ── Browse Discover ────────────────────────────────────────────────
    print(f"    Browsing discover pages...")
    seen_ids: set[str] = set()
    all_items: list[dict] = []

    # Hero
    try:
        for item in await otix.discover_hero():
            if item["id"] not in seen_ids:
                seen_ids.add(item["id"])
                all_items.append(item)
    except Exception as e:
        print(f"    [!] Hero fetch: {e}")

    # Sections
    try:
        sections = await otix.discover_sections()
        for sec in sections:
            mt = sec.get("media_type") or sec.get("type")
            lt = sec.get("list_type") or sec.get("type")
            if mt and lt:
                try:
                    for item in await otix.discover_list(mt, lt):
                        if item["id"] not in seen_ids:
                            seen_ids.add(item["id"])
                            all_items.append(item)
                except Exception:
                    pass
    except Exception:
        pass

    # All media_types x list_types
    for mt in MEDIA_TYPES:
        for lt in LIST_TYPES:
            try:
                for item in await otix.discover_list(mt, lt):
                    if item["id"] not in seen_ids:
                        seen_ids.add(item["id"])
                        all_items.append(item)
            except Exception:
                pass

    print(f"    Found {len(all_items)} unique items to interact with.")

    # ── Interact with every item ───────────────────────────────────────
    random.shuffle(all_items)

    for idx, item in enumerate(all_items):
        media_id = item["id"]
        media_type = item.get("media_type", "movie")
        title = format_title(item)

        stats["items_seen"] += 1

        actions_taken: list[str] = []
        persona_prompt = persona["persona_prompt"]

        try:
            # ── Interaction ──
            interact_rate = persona["interact_rate"]
            if random.random() < interact_rate:
                interaction = pick_interaction(media_type)
                if interaction:
                    ok = await otix.set_interaction(media_type, media_id, interaction)
                    if ok:
                        actions_taken.append(
                            f"❤️ {interaction}" if interaction == "liked" else f"▶️ {interaction}"
                        )
                        stats["interactions"] += 1
                    smart_delay(0.5, 1.5)

            # ── Rating ──
            rating_rate = persona["rating_rate"]
            if random.random() < rating_rate:
                score = generate_rating(persona["rating_style"])
                ok = await otix.set_rating(media_type, media_id, score)
                if ok:
                    rating_stars = "⭐" * score
                    actions_taken.append(f"🗳️ {score}/10")
                    stats["ratings"] += 1
                    smart_delay(0.5, 1.5)

            # ── Review ──
            review_rate = persona["review_rate"]
            if random.random() < review_rate:
                review_text = await ollama.write_review(persona_prompt, title, media_type)
                is_spoiler = random.random() < 0.1
                ok = await otix.write_review(media_type, media_id, "", review_text, is_spoiler)
                if ok:
                    actions_taken.append(f"📝 review ({len(review_text)} chars)")
                    stats["reviews"] += 1
                    smart_delay(1.0, 2.0)

        except Exception as e:
            stats["errors"] += 1
            actions_taken.append(f"⚠️ err: {e}")

        # Progress indicator
        pct = (idx + 1) / len(all_items) * 100
        if actions_taken:
            marker = " | ".join(actions_taken)
        else:
            marker = "—"
        sys.stdout.write(f"\r    [{idx + 1}/{len(all_items)}] {pct:5.1f}%  {marker:<50}")
        sys.stdout.flush()

    print(f"\n    {'─' * 56}")
    print(
        f"    Done! Items: {stats['items_seen']}, "
        f"Interactions: {stats['interactions']}, "
        f"Ratings: {stats['ratings']}, "
        f"Reviews: {stats['reviews']}, "
        f"Errors: {stats['errors']}"
    )

    return stats


def smart_delay(lo: float = MIN_ACTION_DELAY, hi: float = MAX_ACTION_DELAY) -> None:
    """Simulate human reading/thinking time."""
    time.sleep(random.uniform(lo, hi))


# ── Main ───────────────────────────────────────────────────────────────────


async def main():
    print("=" * 70)
    print("  🎭  Otix Persona Simulation")
    print("=" * 70)
    print(f"  API:       {API_BASE}")
    print(f"  Ollama:    {OLLAMA_BASE} ({OLLAMA_MODEL})")
    print(f"  Admin:     @{ADMIN_USERNAME}")
    print(f"  Personas:  {len(PERSONAS)}")
    print(f"  Time:      {datetime.now(timezone.utc).isoformat()}")
    print()

    # ── Init ────────────────────────────────────────────────────────────
    ollama = OllamaClient(model=OLLAMA_MODEL)

    print("[1/3] Ensuring Ollama model is available...")
    try:
        await ollama._ensure_model()
    except Exception as e:
        print(f"  [!] Ollama check failed: {e}")
        print("  Make sure Ollama is running: `ollama serve`")
        sys.exit(1)
    print()

    # ── Verify admin exists ────────────────────────────────────────────
    print("[2/3] Verifying admin user exists...")
    check_client = OtixClient()
    admin = await check_client.get_user_profile(ADMIN_USERNAME)
    if admin:
        print(f"  [+] Found @{ADMIN_USERNAME} (id={admin['id'][:8]}...)")
    else:
        print(f"  [!] Could not find @{ADMIN_USERNAME}. Continuing anyway.")
    print()

    # ── Run all personas ──────────────────────────────────────────────
    print(f"[3/3] Running {len(PERSONAS)} persona simulations...")
    start = time.time()
    all_stats: list[dict] = []

    for i, persona in enumerate(PERSONAS):
        pstart = time.time()
        result = await simulate_persona(ollama, persona, ADMIN_USERNAME)
        elapsed = time.time() - pstart
        result["elapsed"] = round(elapsed)
        all_stats.append(result)

        # Brief pause between personas
        if i < len(PERSONAS) - 1:
            print(f"\n  --- Pausing between personas ---")
            smart_delay(5.0, 8.0)

    total_elapsed = time.time() - start

    # ── Summary ────────────────────────────────────────────────────────
    print()
    print("=" * 70)
    print("  📊  Simulation Complete")
    print("=" * 70)
    print(f"  Total duration: {total_elapsed:.0f}s ({total_elapsed / 60:.1f}m)")
    print(f"  Ollama API calls: {ollama.stats.calls}")
    print()
    print(
        f"  {'Persona':<22} {'Items':>6} {'Interact':>9} {'Ratings':>8} {'Reviews':>8} {'Errors':>7} {'Time':>5}"
    )
    print(f"  {'─' * 22} {'─' * 6} {'─' * 9} {'─' * 8} {'─' * 8} {'─' * 7} {'─' * 5}")
    totals = {"items_seen": 0, "interactions": 0, "ratings": 0, "reviews": 0, "errors": 0}
    for s in all_stats:
        print(
            f"  {s['name']:<22} {s['items_seen']:>6} {s['interactions']:>9} {s['ratings']:>8} {s['reviews']:>8} {s['errors']:>7} {s.get('elapsed', 0):>5}s"
        )
        for k in totals:
            totals[k] += s[k]
    print(f"  {'─' * 22} {'─' * 6} {'─' * 9} {'─' * 8} {'─' * 8} {'─' * 7} {'─' * 5}")
    print(
        f"  {'TOTAL':<22} {totals['items_seen']:>6} {totals['interactions']:>9} {totals['ratings']:>8} {totals['reviews']:>8} {totals['errors']:>7} {total_elapsed:>5.0f}s"
    )
    print()
    print(f"  Users created:")
    for s in all_stats:
        print(f"    @{s['username']}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
