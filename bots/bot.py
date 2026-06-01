from __future__ import annotations

import asyncio
import datetime
import random

import structlog

from bots.client import OtixClient
from bots.config import (
    ACTIVITY_TIERS,
    ADMIN_REVIEWS,
    ALL_GENRES,
    BASE_ACTION_WEIGHTS,
    BIO_TEMPLATES,
    BOT_ADMIN_USERNAME,
    CHRONOTYPES,
    COUNTRIES,
    FIRST_NAMES,
    INTERACTION_TYPES,
    LAST_NAMES,
    LANGUAGES,
    LIST_DESCRIPTIONS,
    LIST_NAMES,
    MAX_BROWSE_PAGES,
    MEDIA_TYPES,
    PERSONALITIES,
    REVIEW_TEMPLATES,
    SEARCH_QUERIES,
    SESSION_TEMPLATES,
    ActivityTier,
    Chronotype,
    SessionTemplate,
    avatar_url,
    cover_url,
)

logger = structlog.get_logger()


class Bot:
    """A simulated human with a unique identity, personality, and taste profile."""

    def __init__(self, client: OtixClient, index: int) -> None:
        self.index = index
        self.client = client

        # ── Identity ──────────────────────────────────────
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        self.display_name: str = f"{first} {last}"
        suffix = f"{random.randint(1, 9999)}" if random.random() < 0.3 else ""
        self.username: str = f"{first.lower()}{last.lower()}{suffix}"
        self.email: str = f"{first.lower()}.{last.lower()}{suffix}@example.com"
        self.password: str = "botpass123"
        self.date_of_birth: str = self._random_dob()

        # ── Personality ───────────────────────────────────
        self.personality = random.choice(PERSONALITIES)

        # ── Chronotype & activity ─────────────────────────
        self.chronotype = random.choices(
            CHRONOTYPES, weights=[0.18, 0.15, 0.25, 0.17, 0.25], k=1
        )[0]
        self.activity_tier = random.choices(
            ACTIVITY_TIERS, weights=[t.weight for t in ACTIVITY_TIERS], k=1
        )[0]

        # ── Taste profile ─────────────────────────────────
        self.preferred_media_types = self._weighted_pick_list(
            self.personality.media_type_weights, k=random.randint(2, 4)
        )
        self.pref_genres: list[str] = self._pick_genres()
        self.country = random.choice(COUNTRIES)
        self.languages = random.sample(LANGUAGES, k=random.randint(1, 3))
        if "en" not in self.languages:
            self.languages.insert(0, "en")

        # ── Avatar / cover ────────────────────────────────
        seed = f"{self.username}{random.randint(0, 99999)}"
        self.avatar = avatar_url(seed)
        self.cover = cover_url(seed + "bg")

        # ── Bio ───────────────────────────────────────────
        self.bio = self._build_bio()

        # ── Base action weights ───────────────────────────
        self._base_weights: dict[str, float] = dict(BASE_ACTION_WEIGHTS)
        for k, v in self.personality.action_weights.items():
            self._base_weights[k] = v
        if "review" in self._base_weights:
            self._base_weights["review"] += self.personality.review_probability_boost
        self._base_weights["view_admin"] = 0.08
        self._base_weights["rate_admin"] = 0.04
        self._base_weights["like_admin_review"] = 0.03

        # ── Session weights (built from templates) ────────
        self._session_weights: list[tuple[SessionTemplate, float]] = []
        for tmpl in SESSION_TEMPLATES:
            w = tmpl.base_weight
            # Personality adjustments to session weights
            if tmpl.name == "social" and self.personality.fickle:
                w *= 1.4
            if tmpl.name == "social" and self.personality.name == "social_butterfly":
                w *= 1.6
            if tmpl.name == "deep_dive" and self.personality.harsh_critic:
                w *= 1.3
            if tmpl.name == "list_curation" and self.personality.watchlist_addict:
                w *= 1.5
            if tmpl.name == "discovery" and self.personality.likes_everything:
                w *= 1.3
            self._session_weights.append((tmpl, w))

        # ── Dynamic search queue ──────────────────────────
        self._search_queue: list[str] = list(SEARCH_QUERIES)
        random.shuffle(self._search_queue)
        self._search_idx: int = 0
        self._seen_titles: set[str] = set()  # dedupe search terms

        # ── State ─────────────────────────────────────────
        self._known_media_ids: list[str] = []
        self._known_usernames: list[str] = []
        self._known_person_ids: list[str] = []
        self._known_user_ids: list[str] = []
        self._known_list_ids: list[str] = []
        self._my_list_ids: list[str] = []
        self._my_user_id: str | None = None
        self._profile_setup: bool = False
        self._action_count: int = 0
        self._session_count: int = 0

        # ── Taste-based social cache ──────────────────────
        # username -> {"genres": [...], "media_types": [...], "overlap": float}
        self._taste_profiles: dict[str, dict] = {}

        # ── Admin worship ─────────────────────────────────
        self._admin_id: str | None = None
        self._admin_followed: bool = False
        self._admin_rated: bool = False
        self._admin_review_ids: list[tuple[str, str]] = []

    # ── identity helpers ─────────────────────────────────

    def _random_dob(self) -> str:
        year = random.randint(1980, 2005)
        month = random.randint(1, 12)
        day = random.randint(1, 28)
        return f"{year}-{month:02d}-{day:02d}"

    def _weighted_pick_list(self, weights: dict[str, float], k: int = 2) -> list[str]:
        if not weights:
            return random.sample(MEDIA_TYPES, k=min(k, len(MEDIA_TYPES)))
        items = list(weights.keys())
        w = list(weights.values())
        picked: list[str] = []
        remaining = list(items)
        remaining_w = list(w)
        for _ in range(min(k, len(items))):
            if not remaining:
                break
            choice = random.choices(remaining, weights=remaining_w, k=1)[0]
            picked.append(choice)
            idx = remaining.index(choice)
            remaining.pop(idx)
            remaining_w.pop(idx)
        return picked or random.sample(MEDIA_TYPES, k=1)

    def _pick_genres(self) -> list[str]:
        candidates = set()
        for mt in self.preferred_media_types:
            pool = ALL_GENRES.get(mt, [])
            if pool:
                n = random.randint(1, min(3, len(pool)))
                candidates.update(random.sample(pool, n))
        candidates.update(self.personality.favorite_genres)
        n = random.randint(2, min(5, len(candidates)))
        return random.sample(list(candidates), n)

    def _build_bio(self) -> str:
        tmpl = random.choice(BIO_TEMPLATES)
        movie = random.choice(ALL_GENRES.get("movie", ["film"]))
        music = random.choice(ALL_GENRES.get("music", ["pop"]))
        game = random.choice(ALL_GENRES.get("game", ["rpg"]))
        g1, g2 = random.sample(self.pref_genres, k=min(2, len(self.pref_genres)))
        if len(self.pref_genres) < 2:
            g2 = random.choice(ALL_GENRES.get("movie", ["drama"]))
        return tmpl.format(
            movie=movie, music=music, game=game,
            genre1=g1, genre2=g2,
        )

    # ── chronotype / wakefulness ─────────────────────────

    def is_awake(self) -> bool:
        """Check if the bot would be active at the current hour (UTC)."""
        if self.chronotype.name == "always_on":
            return True
        hour = datetime.datetime.now(datetime.timezone.utc).hour
        start = self.chronotype.active_hour_start
        end = self.chronotype.active_hour_end
        if start <= end:
            return start <= hour <= end
        else:
            # Wraps past midnight (e.g., 21-4)
            return hour >= start or hour <= end

    def cooldown_multiplier(self) -> float:
        """Return the cooldown multiplier combining chronotype and activity tier."""
        m = self.activity_tier.cooldown_multiplier
        if not self.is_awake():
            m *= self.chronotype.sleep_multiplier
        return m

    # ── lifecycle ─────────────────────────────────────────

    async def start(self) -> bool:
        await asyncio.sleep(random.uniform(0.1, 2.0))

        for attempt in range(3):
            token = await self.client.login(self.username, self.email, self.password)
            if token:
                break
            if attempt < 2:
                await asyncio.sleep(1.0 * (attempt + 1))

        if token is None:
            for attempt in range(3):
                token = await self.client.login(self.username, self.username, self.password)
                if token:
                    break
                if attempt < 2:
                    await asyncio.sleep(1.0 * (attempt + 1))

        if token is None:
            logger.info("bot.registering", name=self.display_name, username=self.username)
            await asyncio.sleep(random.uniform(0.5, 2.0))
            token = await self.client.register(
                self.username, self.email, self.username, self.password,
                dob=self.date_of_birth,
            )
            if token is None:
                logger.error("bot.auth_failed", name=self.display_name)
                return False
            self._profile_setup = False
        else:
            me = await self.client.get_me(self.username)
            if me:
                self._my_user_id = me.get("id")
                if me.get("bio") or me.get("avatar_url"):
                    self._profile_setup = True

        if not self._profile_setup:
            await self._setup_profile()

        # Self-flag as bot for analytics separation
        try:
            await self.client.update_profile(self.username, is_bot=True)
        except Exception:
            pass

        await self._find_and_follow_admin()

        logger.info("bot.ready",
                     name=self.display_name,
                     username=self.username,
                     personality=self.personality.name,
                     chronotype=self.chronotype.name,
                     tier=self.activity_tier.name)
        return True

    async def _setup_profile(self) -> None:
        try:
            result = await self.client.update_profile(
                self.username,
                bio=self.bio,
                avatar_url=self.avatar,
                background_url=self.cover,
                preferred_media_types=self.preferred_media_types,
                preferred_genres=self.pref_genres,
                preferred_languages=self.languages,
                country=self.country,
                onboarding_completed=True,
            )
            if result:
                self._my_user_id = result.get("id")
                self._profile_setup = True
                logger.info("bot.profile_setup",
                            name=self.display_name,
                            genres=self.pref_genres)
        except Exception:
            logger.exception("bot.profile_setup_failed", name=self.display_name)

    async def stop(self) -> None:
        pass

    # ── admin worship ────────────────────────────────────

    async def _find_and_follow_admin(self) -> None:
        try:
            profile = await self.client.user_profile(self.username, BOT_ADMIN_USERNAME)
            if profile:
                self._admin_id = profile.get("id")
                if self._admin_id:
                    await self.client.follow(self.username, BOT_ADMIN_USERNAME)
                    self._admin_followed = True
                    logger.info("bot.followed_king",
                                name=self.display_name,
                                admin=BOT_ADMIN_USERNAME)
                    reviews = await self.client.user_reviews(self.username, BOT_ADMIN_USERNAME)
                    if reviews:
                        for rev in reviews:
                            uid = rev.get("user_id")
                            mid = rev.get("media_item_id")
                            if uid and mid:
                                self._admin_review_ids.append((uid, mid))
        except Exception:
            pass

    async def _rate_admin_profile(self) -> None:
        if not self._admin_id:
            return
        score, content = random.choice(ADMIN_REVIEWS)
        await self.client.put_user_rating(self.username, BOT_ADMIN_USERNAME, score=score)
        self._admin_rated = True

    async def _do_view_admin(self) -> dict | None:
        profile = await self.client.user_profile(self.username, BOT_ADMIN_USERNAME)
        if profile:
            if not self._admin_id:
                self._admin_id = profile.get("id")
            return {"emoji": "👑", "label": "visited the king's profile", "detail": BOT_ADMIN_USERNAME}
        return None

    async def _do_rate_admin(self) -> dict | None:
        if not self._admin_id:
            profile = await self.client.user_profile(self.username, BOT_ADMIN_USERNAME)
            if profile:
                self._admin_id = profile.get("id")
        score, content = random.choice(ADMIN_REVIEWS)
        await self.client.put_user_rating(self.username, BOT_ADMIN_USERNAME, score=score)
        self._admin_rated = True
        return {"emoji": "🙇", "label": "praised the king", "detail": f"{score}/10"}

    async def _do_like_admin_review(self) -> dict | None:
        if not self._admin_review_ids:
            reviews = await self.client.user_reviews(self.username, BOT_ADMIN_USERNAME)
            if reviews:
                for rev in reviews:
                    uid = rev.get("user_id")
                    mid = rev.get("media_item_id")
                    if uid and mid:
                        self._admin_review_ids.append((uid, mid))
        if self._admin_review_ids:
            uid, mid = random.choice(self._admin_review_ids)
            await self.client.vote_review(self.username, uid, mid, "up")
            return {"emoji": "🏅", "label": "upvoted king's review"}
        return await self._do_view_admin()

    # ── session system ───────────────────────────────────

    def _pick_session(self) -> SessionTemplate:
        """Pick a session type weighted by template weights."""
        templates = [s[0] for s in self._session_weights]
        weights = [s[1] for s in self._session_weights]
        return random.choices(templates, weights=weights, k=1)[0]

    def _session_action_weights(self, session: SessionTemplate) -> dict[str, float]:
        """Merge base weights with session overrides for coherent action chains."""
        merged = dict(self._base_weights)
        for k, v in session.action_weights.items():
            merged[k] = merged.get(k, 0.0) + v
        return merged

    async def run_session(self) -> None:
        """Execute a coherent multi-step session, then return."""
        session = self._pick_session()
        weights = self._session_action_weights(session)
        steps = random.randint(
            self.activity_tier.session_steps_min,
            self.activity_tier.session_steps_max,
        )

        self._session_count += 1
        logger.info("bot.session_start",
                     name=self.display_name,
                     session=session.name,
                     steps=steps,
                     tier=self.activity_tier.name,
                     awake=self.is_awake())

        for step in range(steps):
            action = self._pick_action(weights)
            method = getattr(self, f"_do_{action}", None)
            info: dict[str, object] = {}
            if method:
                try:
                    info = await method() or {}
                except Exception:
                    logger.exception("bot.action_error",
                                     name=self.display_name,
                                     action=action,
                                     session=session.name)
            self._action_count += 1

            # One-line action log
            parts: list[str] = [f"{self.display_name}"]
            if info.get("emoji"):
                parts.append(f"[{info['emoji']}]")
            parts.append(info.get("label", action))
            detail = info.get("detail", "")
            logger.info(" ".join(parts) + (f" | {detail}" if detail else ""))

            # Brief pause between steps within a session
            if step < steps - 1:
                await asyncio.sleep(random.uniform(1.0, 4.0))

    def _pick_action(self, weights: dict[str, float]) -> str:
        actions = list(weights.keys())
        w = list(weights.values())
        return random.choices(actions, weights=w, k=1)[0]

    # ── actions ───────────────────────────────────────────

    async def _do_browse_discover(self) -> dict | None:
        section = random.choice(["hero", "sections", "list"])
        if section == "hero":
            data = await self.client.discover_hero(self.username)
            if data:
                self._harvest_media(data)
                return {"emoji": "🏠", "label": "discover hero"}
        elif section == "sections":
            data = await self.client.discover_sections(self.username)
            if data:
                self._harvest_media(data)
                return {"emoji": "🧭", "label": "discover sections"}
        else:
            mt = random.choice(self.preferred_media_types)
            lt = random.choice([
                "trending", "popular", "top_rated", "upcoming", "now_playing",
            ])
            page = random.randint(1, MAX_BROWSE_PAGES)
            data = await self.client.discover_list(self.username, mt, lt, page=page)
            if data:
                self._harvest_media(data)
                return {"emoji": "📋", "label": f"browsed {lt}", "detail": f"type={mt} page={page}"}
        return None

    async def _do_search(self) -> dict | None:
        # Dynamic search: pull from personal queue, fall back to static list
        q = self._next_search_query()
        mt = random.choice(self.preferred_media_types) if random.random() < 0.6 else None
        page = random.randint(1, 2)
        data = await self.client.media_search(self.username, q, media_type=mt, page=page)
        if data:
            self._harvest_media(data)
            # Derive new search terms from results
            self._derive_searches(data)
            return {"emoji": "🔍", "label": "searched", "detail": f"\"{q}\"" + (f" ({mt})" if mt else "")}
        return None

    def _next_search_query(self) -> str:
        """Get next search term from the dynamic queue, replenishing as needed."""
        if self._search_idx >= len(self._search_queue):
            # Replenish from static list, avoiding recent searches
            fresh = [q for q in SEARCH_QUERIES if q not in self._seen_titles]
            if not fresh:
                fresh = list(SEARCH_QUERIES)
            random.shuffle(fresh)
            self._search_queue.extend(fresh)
        q = self._search_queue[self._search_idx]
        self._search_idx += 1
        return q

    def _derive_searches(self, data: dict | list) -> None:
        """Add new search terms based on discovered content."""
        items: list[dict] = []
        if isinstance(data, dict):
            items = data.get("items") or data.get("results") or []
        elif isinstance(data, list):
            items = data

        for item in items[:5]:  # limit derived terms
            title = item.get("title") or item.get("name") or ""
            if title and title.lower() not in self._seen_titles:
                self._seen_titles.add(title.lower())
                self._search_queue.append(title)
                # Sometimes add a genre-derivative
                genres = item.get("genres") or []
                if isinstance(genres, list) and genres and random.random() < 0.3:
                    g = random.choice(genres)
                    if isinstance(g, dict):
                        g = g.get("name", "")
                    if g and f"{g} {random.choice(['movies', 'shows', 'games', 'music', 'artists'])}" not in self._seen_titles:
                        self._search_queue.append(f"{g} {random.choice(['movies', 'shows', 'music', 'games'])}")

    async def _do_view_media(self) -> dict | None:
        await self._ensure_media_ids()
        if self._known_media_ids:
            media_id = random.choice(self._known_media_ids)
            detail = await self.client.media_detail(self.username, media_id)
            if detail:
                title = detail.get("title") or detail.get("name") or media_id[:20]
                self._harvest_media(detail)
                # Derive searches from this specific title
                self._derive_searches_from_detail(detail)
                return {"emoji": "👁️", "label": "viewed", "detail": f"{title}"}
        return None

    def _derive_searches_from_detail(self, detail: dict) -> None:
        """Generate related search terms from a media detail view."""
        title = detail.get("title") or detail.get("name") or ""
        genres = detail.get("genres") or []

        # Related people (directors, actors, artists)
        for field in ("directors", "actors", "creators", "artists", "author"):
            people = detail.get(field) or []
            if isinstance(people, list):
                for p in people[:2]:
                    name = p.get("name") if isinstance(p, dict) else str(p)
                    if name and name.lower() not in self._seen_titles:
                        self._seen_titles.add(name.lower())
                        self._search_queue.append(name)

        # Genre combos
        genre_names = []
        for g in genres[:3]:
            if isinstance(g, dict):
                genre_names.append(g.get("name", ""))
            else:
                genre_names.append(str(g))

        if len(genre_names) >= 2 and random.random() < 0.4:
            g1, g2 = random.sample(genre_names, 2)
            term = f"{g1} {g2}"
            if term.lower() not in self._seen_titles:
                self._seen_titles.add(term.lower())
                self._search_queue.append(term)

    async def _do_interact(self) -> dict | None:
        await self._ensure_media_ids()
        if not self._known_media_ids:
            return None
        media_id = random.choice(self._known_media_ids)

        if self.personality.likes_everything:
            itype = random.choice(["liked", "watchlisted", "watched", "played", "listened"])
        elif self.personality.selective_liker:
            itype = random.choice(["watchlisted", "watched", "played", "started"])
        else:
            itype = random.choice(INTERACTION_TYPES)

        r = await self.client.set_interaction(self.username, media_id, itype)
        if r:
            emoji_map = {"liked": "❤️", "watchlisted": "📌", "watched": "✅", "played": "🎮", "started": "▶️", "listened": "🎧"}
            return {"emoji": emoji_map.get(itype, "📎"), "label": itype, "detail": f"media={media_id[:12]}..."}
        return None

    async def _do_review(self) -> dict | None:
        await self._ensure_media_ids()
        if not self._known_media_ids:
            return None

        media_id = random.choice(self._known_media_ids)

        # Fetch detail for contextual review text
        detail = await self.client.media_detail(self.username, media_id)
        title = ""
        media_genres: list[str] = []
        if detail:
            title = detail.get("title") or detail.get("name") or ""
            genres = detail.get("genres") or []
            for g in genres:
                if isinstance(g, dict):
                    media_genres.append(g.get("name", ""))
                else:
                    media_genres.append(str(g))
            self._harvest_media(detail)

        score_tmpl, content = random.choice(REVIEW_TEMPLATES)

        if self.personality.harsh_critic:
            score = max(self.personality.min_score,
                       min(score_tmpl - random.randint(0, 2), self.personality.max_score))
        elif self.personality.generous:
            score = max(self.personality.min_score,
                       min(score_tmpl + random.randint(0, 1), self.personality.max_score))
        else:
            score = max(self.personality.min_score,
                       min(score_tmpl + random.randint(-1, 1), self.personality.max_score))

        # Contextual review: insert title and genre
        if title and random.random() < 0.6:
            if "{genre1}" in content and (media_genres or self.pref_genres):
                g = random.choice(media_genres or self.pref_genres)
                content = content.format(genre1=g)
            # Prepend title reference for realism
            prefixes = [
                f"'{title}' — {content[0].lower() + content[1:] if content else ''}",
                f"Watched '{title}'. {content}",
                f"Just finished '{title}'. {content}",
            ]
            if "{genre1}" not in content:
                content = random.choice(prefixes)
        elif "{genre1}" in content:
            content = content.format(genre1=random.choice(self.pref_genres))

        if random.random() < 0.3:
            content = None

        r = await self.client.put_review(self.username, media_id, score=score, content=content)
        if r:
            detail_str = f"{score}/10"
            if content:
                short = content[:40] + ("..." if len(content) > 40 else "")
                detail_str += f" \"{short}\""
            return {"emoji": "⭐", "label": "rated", "detail": detail_str}
        return None

    async def _do_view_user(self) -> dict | None:
        await self._ensure_usernames()
        # Prefer users with similar taste
        target = self._pick_user_by_taste() if self._known_usernames else self.username
        if not target:
            target = self.username

        profile = await self.client.user_profile(self.username, target)
        if profile:
            uname = profile.get("username", target)
            uid = profile.get("id", "")
            if uid:
                self._known_user_ids.append(uid)
            # Cache taste profile
            self._cache_taste_profile(uname, profile)
            if random.random() < 0.5:
                reviews = await self.client.user_reviews(self.username, target)
                if reviews:
                    self._harvest_media(reviews)
            overlap = self._taste_overlap(uname)
            detail = uname
            if overlap > 0.5:
                detail = f"{uname} (taste match {overlap:.0%})"
            return {"emoji": "👤", "label": "viewed user", "detail": detail}
        return None

    # ── taste-based social ────────────────────────────────

    def _cache_taste_profile(self, username: str, profile: dict) -> None:
        """Extract and cache a user's taste profile from their API response."""
        if username in self._taste_profiles:
            return
        genres = profile.get("preferred_genres") or []
        media_types = profile.get("preferred_media_types") or []
        self._taste_profiles[username] = {
            "genres": list(genres),
            "media_types": list(media_types),
        }

    def _taste_overlap(self, username: str) -> float:
        """Calculate genre+media-type overlap score between bot and another user."""
        if username not in self._taste_profiles:
            return 0.0
        tp = self._taste_profiles[username]
        their_genres = set(tp.get("genres", []))
        their_mt = set(tp.get("media_types", []))

        genre_overlap = len(set(self.pref_genres) & their_genres) / max(
            len(set(self.pref_genres) | their_genres), 1
        )
        mt_overlap = len(set(self.preferred_media_types) & their_mt) / max(
            len(set(self.preferred_media_types) | their_mt), 1
        )
        return 0.6 * genre_overlap + 0.4 * mt_overlap

    def _pick_user_by_taste(self) -> str | None:
        """Pick a known user, biased toward those with higher taste overlap."""
        if not self._known_usernames:
            return None
        # Score all known usernames
        scored = []
        for u in self._known_usernames:
            overlap = self._taste_overlap(u)
            # Boost: unknown users get average chance
            weight = 0.3 + overlap * 1.5  # range ~0.3 to 1.8
            scored.append((u, weight))
        usernames = [s[0] for s in scored]
        weights = [s[1] for s in scored]
        return random.choices(usernames, weights=weights, k=1)[0]

    async def _do_follow_toggle(self) -> dict | None:
        await self._ensure_usernames()
        if self._known_usernames:
            target_username = self._pick_user_by_taste()
            if not target_username:
                target_username = random.choice(self._known_usernames)

            overlap = self._taste_overlap(target_username)
            # High overlap → more likely to follow; low overlap → more likely to unfollow
            if overlap > 0.4:
                follow_prob = 0.85
            elif overlap > 0.2:
                follow_prob = 0.6
            else:
                follow_prob = 0.35

            # Personality modifiers
            if self.personality.fickle:
                follow_prob = 0.5
            if self.personality.name == "social_butterfly":
                follow_prob = 0.9

            if random.random() < follow_prob:
                ok = await self.client.follow(self.username, target_username)
                if ok:
                    return {"emoji": "➕", "label": "followed", "detail": f"{target_username} (taste {overlap:.0%})"}
            else:
                ok = await self.client.unfollow(self.username, target_username)
                if ok:
                    return {"emoji": "➖", "label": "unfollowed", "detail": target_username}
        else:
            followers = await self.client.followers(self.username)
            if followers:
                for u in followers:
                    uname = u.get("username")
                    if uname:
                        self._known_usernames.append(uname)
                        self._cache_taste_profile(uname, u)
                if self._known_usernames:
                    target = self._pick_user_by_taste() or random.choice(self._known_usernames)
                    ok = await self.client.follow(self.username, target)
                    if ok:
                        return {"emoji": "➕", "label": "followed", "detail": target}
        return None

    async def _do_view_person(self) -> dict | None:
        if not self._known_person_ids:
            data = await self.client.people_list(self.username, page=random.randint(1, 3))
            if data and "items" in data:
                for p in data["items"]:
                    pid = p.get("id")
                    if pid:
                        self._known_person_ids.append(pid)
        if self._known_person_ids:
            person_id = random.choice(self._known_person_ids)
            detail = await self.client.person_detail(self.username, person_id)
            if detail:
                name = detail.get("name") or person_id[:20]
                return {"emoji": "🎭", "label": "viewed person", "detail": name}
        return None

    async def _do_browse_library(self) -> dict | None:
        tab = random.choice(["overview"] + self.preferred_media_types)
        data = await self.client.library(self.username, tab=tab, page=random.randint(1, 2))
        if data:
            self._harvest_media(data)
            return {"emoji": "📚", "label": "library", "detail": f"tab={tab}"}
        return None

    # ── list actions ───────────────────────────────────────

    async def _do_browse_lists(self) -> dict | None:
        lists = await self.client.lists_all(self.username)
        if lists:
            for lst in lists:
                lid = lst.get("id")
                if lid and lid not in self._known_list_ids:
                    self._known_list_ids.append(lid)
            if lists:
                return {"emoji": "📑", "label": "browsed lists", "detail": f"{len(lists)} found"}
        return None

    async def _do_view_list(self) -> dict | None:
        await self._ensure_list_ids()
        if self._known_list_ids:
            lid = random.choice(self._known_list_ids)
            detail = await self.client.list_get(self.username, lid)
            if detail:
                name = detail.get("name", lid[:20])
                items = detail.get("items", [])
                self._harvest_media({"items": items})
                return {"emoji": "📜", "label": "viewed list", "detail": name}
        return None

    async def _do_create_list(self) -> dict | None:
        name = random.choice(LIST_NAMES)
        description = random.choice(LIST_DESCRIPTIONS)
        lst = await self.client.list_create(self.username, name=name, description=description)
        if lst:
            lid = lst.get("id")
            if lid:
                self._my_list_ids.append(lid)
                self._known_list_ids.append(lid)
            await self._ensure_media_ids()
            items_to_add = min(random.randint(1, 3), len(self._known_media_ids))
            for mid in random.sample(self._known_media_ids, items_to_add):
                await self.client.list_add_item(self.username, lid, mid)
            return {"emoji": "📝", "label": "created list", "detail": name}
        return None

    async def _do_add_to_list(self) -> dict | None:
        await self._ensure_list_ids()
        await self._ensure_media_ids()
        if self._known_list_ids and self._known_media_ids:
            lid = random.choice(self._known_list_ids)
            mid = random.choice(self._known_media_ids[:20])
            ok = await self.client.list_add_item(self.username, lid, mid)
            if ok:
                return {"emoji": "📥", "label": "added to list", "detail": mid[:12]}
        return None

    async def _do_like_list(self) -> dict | None:
        await self._ensure_list_ids()
        if self._known_list_ids:
            lid = random.choice(self._known_list_ids)
            if random.random() < 0.7:
                result = await self.client.list_like(self.username, lid)
                emoji = "❤️"
                label = "liked list"
            else:
                result = await self.client.list_unlike(self.username, lid)
                emoji = "💔"
                label = "unliked list"
            if result:
                detail = result.get("like_count", "")
                return {"emoji": emoji, "label": label, "detail": f"likes={detail}"}
        return None

    async def _do_invite_collaborator(self) -> dict | None:
        await self._ensure_user_ids()
        if self._my_list_ids and self._known_user_ids:
            lid = random.choice(self._my_list_ids)
            # Prefer users with high taste overlap as collaborators
            if self._known_usernames:
                best = max(self._known_usernames, key=lambda u: self._taste_overlap(u))
                idx = self._known_usernames.index(best) if best in self._known_usernames else 0
            else:
                idx = random.randrange(min(len(self._known_user_ids), 10))
            collaborator_id = self._known_user_ids[idx]
            collaborator_name = self._known_usernames[idx] if idx < len(self._known_usernames) else collaborator_id[:12]
            perm = random.choice(["VIEW", "EDIT"])
            result = await self.client.list_add_collaborator(
                self.username, lid, collaborator_id, permission=perm
            )
            if result:
                return {"emoji": "🤝", "label": "invited collaborator", "detail": f"{collaborator_name} ({perm})"}
        return None

    # ── helpers ───────────────────────────────────────────

    async def _ensure_media_ids(self) -> None:
        if self._known_media_ids:
            return
        mt = random.choice(self.preferred_media_types)
        data = await self.client.media_browse(
            self.username, media_type=mt, page=1,
            sort_by=random.choice(["popularity", "rating", "release_date"]),
        )
        if data:
            self._harvest_media(data)

    async def _ensure_usernames(self) -> None:
        if self._known_usernames:
            return
        f = await self.client.followers(self.username)
        if f:
            for u in f:
                uname = u.get("username")
                if uname:
                    self._known_usernames.append(uname)
                    self._cache_taste_profile(uname, u)
        f2 = await self.client.following(self.username)
        if f2:
            for u in f2:
                uname = u.get("username")
                if uname:
                    self._known_usernames.append(uname)
                    self._cache_taste_profile(uname, u)

    async def _ensure_user_ids(self) -> None:
        if self._known_user_ids:
            return
        for fetch in (self.client.followers, self.client.following):
            result = await fetch(self.username)
            if result:
                for u in result:
                    uid = u.get("id") or u.get("user_id")
                    if uid:
                        self._known_user_ids.append(uid)
                    uname = u.get("username")
                    if uname:
                        self._known_usernames.append(uname)
                        self._cache_taste_profile(uname, u)

    async def _ensure_list_ids(self) -> None:
        if self._known_list_ids:
            return
        lists = await self.client.lists_all(self.username)
        if lists:
            for lst in lists:
                lid = lst.get("id")
                if lid:
                    self._known_list_ids.append(lid)
        mine = await self.client.lists_mine(self.username)
        if mine:
            for lst in mine:
                lid = lst.get("id")
                if lid and lid not in self._known_list_ids:
                    self._known_list_ids.append(lid)
                    self._my_list_ids.append(lid)

    def _harvest_media(self, data: dict | list) -> None:
        """Extract media IDs and usernames from API responses."""
        items: list[dict] = []
        if isinstance(data, dict):
            items = data.get("items") or data.get("results") or []
            if not items and "id" in data:
                items = [data]
        elif isinstance(data, list):
            items = data

        for item in items:
            mid = item.get("id")
            if mid and mid not in self._known_media_ids:
                self._known_media_ids.append(mid)
            for key in ("user", "owner", "author", "reviewer"):
                u = item.get(key)
                if isinstance(u, dict):
                    uname = u.get("username")
                    uid = u.get("id")
                    if uname and uname not in self._known_usernames:
                        self._known_usernames.append(uname)
                        self._cache_taste_profile(uname, u)
                    if uid and uid not in self._known_user_ids:
                        self._known_user_ids.append(uid)
