"""Game matching service — multi-phase pipeline returning ranked candidates.

Matching pipeline:

    1. Direct external-ID resolution (external_ids table) — confidence 1.0
    2. Otix catalog search (exact title → ILIKE → trigram) — 0.4–0.95
    3. IGDB provider search (cross-ref → title search) — 0.7–0.9
    4. Candidate assembly + auto-match decision

Phase 4 applies auto-match rules and returns either a single confirmed
match (``auto_match``) or a ranked list of ``candidates`` for the user
to pick from.  No game is imported into the catalog during matching —
imports only happen via the confirmation endpoint.

"""

from __future__ import annotations

import asyncio
import re
import time
import unicodedata
from collections.abc import AsyncGenerator
from datetime import datetime
from typing import TYPE_CHECKING

import structlog
from redis.asyncio import Redis
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import ExternalID, MatchSkip, MediaItem
from otix.providers.igdb.client import IGDBProvider
from otix.schemas.media import (
    GameMatchCandidate,
    GameMatchRequest,
    GameMatchResponse,
    MatchType,
    StreamCompleteEvent,
    StreamMatchEvent,
)
from otix.services.external_id_service import ExternalIDService

if TYPE_CHECKING:
    from otix.lib.types import JSONValue

logger = structlog.get_logger()

# ── Platform name normalization ────────────────────────────────────────────
# Maps IGDB / provider display names to Otix platform slugs.

PLATFORM_NORMALIZATION: dict[str, str] = {
    "PC (Microsoft Windows)": "windows",
    "Mac": "macos",
    "Linux": "linux",
    "Windows": "windows",
    "MacOS": "macos",
    "Win32": "windows",
    "PC": "windows",
    "PlayStation 5": "playstation-5",
    "PlayStation 4": "playstation-4",
    "Xbox Series X|S": "xbox-series-x-s",
    "Xbox One": "xbox-one",
    "Nintendo Switch": "nintendo-switch",
    "Android": "android",
    "iOS": "ios",
    "Web browser": "web",
    "VR": "vr",
    "Stadia": "stadia",
}

# ── Simple title normalization (unicode-aware, no regex kitchen sink) ──────


def _normalize_title(raw: str) -> str:
    """Normalize a game title for comparison.

    - Decompose unicode (accents → base)
    - Strip ™®© and similar symbols
    - Collapse whitespace
    """
    clean = unicodedata.normalize("NFKD", raw)
    # Strip common special chars but keep letters, digits, spaces, hyphens, colons
    clean = re.sub(r"[™®©]", "", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def _title_words(title: str) -> set[str]:
    """Return lowercase, normalized title words for loose matching."""
    norm = _normalize_title(title).lower()
    return set(norm.split())


# ── IGDB helpers ───────────────────────────────────────────────────────────


def _igdb_cover_url(cover: object) -> str | None:
    """Build an IGDB cover URL from a cover dict / image_id."""
    if isinstance(cover, dict):
        image_id = cover.get("image_id")
    elif isinstance(cover, str):
        image_id = cover
    else:
        return None
    if not image_id:
        return None
    return f"https://images.igdb.com/igdb/image/upload/t_cover_big/{image_id}.jpg"


def _igdb_platforms(raw: list[JSONValue]) -> list[str]:
    """Extract normalized platform slugs from IGDB platforms list."""
    out: list[str] = []
    for p in raw:
        if not isinstance(p, dict):
            continue
        name = p.get("name", "")
        if isinstance(name, str) and name:
            slug = PLATFORM_NORMALIZATION.get(name, name.lower())
            if slug not in out:
                out.append(slug)
    return out


# ── Service class ──────────────────────────────────────────────────────────


class GameMatcher:
    """Multi-phase game matching service.

    Phases run sequentially; each phase only processes games that remain
    unmatched after the previous phase.

    1. **Direct** (external_ids table) — confidence 1.0
    2. **Otix catalog** (exact → ILIKE → trigram) — 0.4–0.95
    3. **IGDB provider** (cross-ref → title search) — 0.7–0.9
    4. **Assemble** — merge, rank, auto-match decision

    Auto-match rules:
        - match_type "direct" → always auto-match
        - confidence ≥ 0.95 → auto-match
        - confidence ≥ 0.85 AND gap to 2nd ≥ 0.20 → auto-match
        - otherwise → return candidates for user selection
    """

    # IGDB search concurrency
    IGDB_CHUNK_SIZE = 50
    IGDB_SEARCH_LIMIT = 20
    IGDB_SEARCH_FIELDS = "id,name,slug,cover.image_id,first_release_date,platforms.name,involved_companies.company.name"

    def __init__(self, session: AsyncSession, redis: Redis) -> None:
        self._session = session
        self._redis = redis
        self._eid_svc = ExternalIDService(session)

    # ── Public API ─────────────────────────────────────────────────────────

    async def match_single(self, request: GameMatchRequest) -> GameMatchResponse:
        """Match a single game through all four phases."""
        results = await self.match_batch([request])
        return results[0]

    async def match_batch(
        self,
        requests: list[GameMatchRequest],
    ) -> list[GameMatchResponse]:
        """Match multiple games through all four phases.

        Returns one ``GameMatchResponse`` per input request, each
        containing ranked ``candidates`` and an optional ``auto_match``.
        """
        n = len(requests)
        # Per-request candidate accumulator
        all_candidates: list[list[GameMatchCandidate]] = [[] for _ in range(n)]
        # Track which request indices still need processing
        unmatched: list[int] = list(range(n))

        # ── Phase 1: Direct external-ID resolution ─────────────────────────
        unmatched = await self._phase1_direct(requests, unmatched, all_candidates)

        # ── Phase 2: Otix catalog search ────────────────────────────────────
        if unmatched:
            unmatched = await self._phase2_otix(requests, unmatched, all_candidates)

        # ── Phase 3: IGDB provider search ───────────────────────────────────
        if unmatched:
            await self._phase3_igdb(requests, unmatched, all_candidates)

        # ── Phase 4: Assemble, rank, auto-match ─────────────────────────────
        return self._phase4_assemble(requests, all_candidates)

    # ── SSE batch stream ────────────────────────────────────────────────────

    async def match_batch_stream(
        self,
        requests: list[GameMatchRequest],
    ) -> AsyncGenerator[str, None]:
        """Async generator yielding SSE-formatted per-game match progress.

        Yields an ``event: game-progress`` frame for each game as it is
        processed, followed by a final ``event: complete`` frame with
        aggregate statistics.

        The caller (typically a FastAPI endpoint) wraps this generator in a
        ``StreamingResponse(..., media_type="text/event-stream")``.
        """
        start = time.monotonic()
        n = len(requests)
        matched_count = 0
        unmatched_count = 0
        errored_count = 0

        for i, req in enumerate(requests):
            try:
                response = await self.match_single(req)
                has_match = response.auto_match is not None or bool(response.candidates)
                status = "matched" if has_match else "unmatched"

                if has_match:
                    matched_count += 1
                else:
                    unmatched_count += 1

                yield (
                    f"event: game-progress\n"
                    f"data: {
                        StreamMatchEvent(
                            game_index=i,
                            total_games=n,
                            query_id=req.query_id,
                            query_title=req.title,
                            status=status,
                            candidates_count=len(response.candidates),
                            auto_match=response.auto_match is not None,
                            match=response.auto_match,
                            candidates=response.candidates if response.candidates else None,
                        ).model_dump_json()
                    }\n\n"
                )
            except Exception as exc:
                errored_count += 1
                logger.exception("match_batch_stream error", title=req.title)
                yield (
                    f"event: game-progress\n"
                    f"data: {
                        StreamMatchEvent(
                            game_index=i,
                            total_games=n,
                            query_id=req.query_id,
                            query_title=req.title,
                            status='error',
                            error=str(exc),
                        ).model_dump_json()
                    }\n\n"
                )

        duration_ms = int((time.monotonic() - start) * 1000)
        yield (
            f"event: complete\n"
            f"data: {
                StreamCompleteEvent(
                    total_games=n,
                    matched_count=matched_count,
                    unmatched_count=unmatched_count,
                    errored_count=errored_count,
                    duration_ms=duration_ms,
                ).model_dump_json()
            }\n\n"
        )

    # ── Phase 1: Direct external-ID resolution ──────────────────────────────

    async def _phase1_direct(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        all_candidates: list[list[GameMatchCandidate]],
    ) -> list[int]:
        """Look up external IDs in local DB. Also check match_skips.

        For each game with external IDs, queries the external_ids table
        and the match_skips table.  Matched games get a candidate with
        confidence 1.0, match_type DIRECT.  Skipped games are excluded
        from further processing.
        """
        # Collect {source: {external_id: request_index}}
        source_ids: dict[str, dict[str, list[int]]] = {}
        for idx in indices:
            req = requests[idx]
            if not req.external_ids:
                continue
            for ref in req.external_ids:
                entry = source_ids.setdefault(ref.source, {})
                entry.setdefault(ref.id, []).append(idx)

        if not source_ids:
            return list(indices)

        skip_ids: set[tuple[str, str]] = set()

        for source, id_map in source_ids.items():
            ext_ids = list(id_map.keys())

            # Check match_skips in parallel with main lookup
            skip_rows = await self._session.execute(
                select(MatchSkip.external_id).where(
                    MatchSkip.provider == source,
                    MatchSkip.external_id.in_(ext_ids),
                )
            )
            for row in skip_rows.scalars().all():
                skip_ids.add((source, row))

            try:
                entity_map = await self._eid_svc.batch_find_with_metadata(source, ext_ids)
            except Exception:
                logger.exception("external ID batch lookup failed", source=source)
                continue

            entity_ids_to_fetch = list(
                {meta["entity_id"] for meta in entity_map.values() if meta and meta.get("entity_id")}
            )
            media_items = await self._fetch_media_items(entity_ids_to_fetch)

            for ext_id, meta in entity_map.items():
                if not meta or not meta.get("entity_id"):
                    continue
                if (source, ext_id) in skip_ids:
                    continue

                entity_id = meta["entity_id"]
                confirmed = meta.get("confirmed_count", 0) or 0
                if confirmed >= 3:
                    confidence = 1.0
                elif confirmed >= 1:
                    confidence = 0.98
                else:
                    confidence = 0.90

                for req_idx in id_map.get(ext_id, []):
                    mi = media_items.get(entity_id)
                    all_candidates[req_idx].append(
                        GameMatchCandidate(
                            media_item_id=entity_id,
                            title=mi.title if mi else requests[req_idx].title,
                            poster_url=mi.poster_url if mi else None,
                            backdrop_url=mi.backdrop_url if mi else None,
                            release_year=_release_year_from_date(mi.release_date if mi else None),
                            confidence=confidence,
                            match_type=MatchType.DIRECT,
                        )
                    )

        # Return indices that still have no direct match AND aren't skipped
        return [
            idx
            for idx in indices
            if not any(c.match_type == MatchType.DIRECT for c in all_candidates[idx])
            and not any((ref.source, ref.id) in skip_ids for ref in (requests[idx].external_ids or []))
        ]

    # ── Phase 2: Otix catalog search ────────────────────────────────────────

    async def _phase2_otix(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        all_candidates: list[list[GameMatchCandidate]],
    ) -> list[int]:
        """Search Otix's own catalog in three sub-stages.

        2a. Exact title match (confidence 0.95)
        2b. ILIKE pattern match (confidence 0.75–0.85)
        2c. Trigram similarity (confidence 0.3–0.6)

        Each sub-stage only processes indices unmatched by the previous.
        """
        unmatched = list(indices)

        # 2a: Exact title match
        if unmatched:
            unmatched = await self._phase2a_exact(requests, unmatched, all_candidates)

        # 2b: ILIKE pattern match
        if unmatched:
            unmatched = await self._phase2b_ilike(requests, unmatched, all_candidates)

        # 2c: Trigram similarity
        if unmatched:
            unmatched = await self._phase2c_trigram(requests, unmatched, all_candidates)

        return unmatched

    async def _phase2a_exact(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        all_candidates: list[list[GameMatchCandidate]],
    ) -> list[int]:
        """Exact case-insensitive title match against media_items."""
        titles = {requests[i].title.strip().lower(): i for i in indices}
        if not titles:
            return list(indices)

        rows = await self._session.execute(
            select(MediaItem).where(
                MediaItem.media_type == "game",
                MediaItem.title.in_(
                    select(MediaItem.title).where(
                        MediaItem.media_type == "game",
                    )
                ),
            )
        )
        # More efficient: use func.lower
        from sqlalchemy import func

        rows = await self._session.execute(
            select(MediaItem).where(
                MediaItem.media_type == "game",
                func.lower(MediaItem.title).in_(list(titles)),
            )
        )
        media_map: dict[str, list[MediaItem]] = {}
        for mi in rows.scalars().all():
            key = mi.title.strip().lower()
            if key in titles:
                media_map.setdefault(key, []).append(mi)

        matched: set[int] = set()
        for title_lower, idx in titles.items():
            items = media_map.get(title_lower, [])
            for mi in items:
                dev_match = _developer_overlap(requests[idx].developer, mi)
                confidence = 0.95 + (0.02 if dev_match else 0.0)
                all_candidates[idx].append(
                    GameMatchCandidate(
                        media_item_id=mi.id,
                        title=mi.title,
                        poster_url=mi.poster_url,
                        backdrop_url=mi.backdrop_url,
                        release_year=_release_year_from_date(mi.release_date),
                        confidence=min(confidence, 1.0),
                        match_type=MatchType.EXACT_TITLE,
                    )
                )
                matched.add(idx)

        return [i for i in indices if i not in matched]

    async def _phase2b_ilike(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        all_candidates: list[list[GameMatchCandidate]],
    ) -> list[int]:
        """ILIKE pattern match -- batched into one DB round trip.

        Collects all normalized titles, issues a single query with OR'd
        ILIKE conditions, then distributes results back per-request.
        """
        from sqlalchemy import or_

        idx_to_norm: dict[int, str] = {}
        unmatched: list[int] = []

        for i in indices:
            norm = _normalize_title(requests[i].title)
            if not norm or len(norm) < 2:
                unmatched.append(i)
                continue
            idx_to_norm[i] = norm

        if not idx_to_norm:
            return unmatched

        # Build one big OR query: title ILIKE %norm% for each normalized title
        conditions = []
        for norm in idx_to_norm.values():
            pattern = f"%{norm}%"
            conditions.append(MediaItem.title.ilike(pattern))

        rows = await self._session.execute(
            select(MediaItem)
            .where(
                MediaItem.media_type == "game",
                or_(*conditions),
            )
            .limit(500)  # safety limit
        )
        catalog_items = list(rows.scalars().all())

        # Match each catalog item to the request(s) whose normalized title
        # is contained in (or contains) the catalog title
        matched: set[int] = set()
        for mi in catalog_items:
            mi_lower = mi.title.lower()
            for i, norm in idx_to_norm.items():
                if i in matched:
                    continue
                norm_lower = norm.lower()
                if norm_lower in mi_lower or mi_lower in norm_lower:
                    confidence = 0.85 if _developer_overlap(requests[i].developer, mi) else 0.75
                    all_candidates[i].append(
                        GameMatchCandidate(
                            media_item_id=mi.id,
                            title=mi.title,
                            poster_url=mi.poster_url,
                            backdrop_url=mi.backdrop_url,
                            release_year=_release_year_from_date(mi.release_date),
                            confidence=confidence,
                            match_type=MatchType.ILIKE,
                        )
                    )
                    matched.add(i)
                    break  # one match per catalog item per request

        return [i for i in indices if i not in matched]

    async def _phase2c_trigram(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        all_candidates: list[list[GameMatchCandidate]],
    ) -> list[int]:
        """PostgreSQL trigram similarity fallback."""
        title_to_idx: dict[str, int] = {}
        clean_list: list[str] = []

        for i in indices:
            clean = _normalize_title(requests[i].title)
            if clean and clean not in title_to_idx:
                title_to_idx[clean] = i
                clean_list.append(clean)

        if not clean_list:
            return list(indices)

        sql = text("""
            SELECT DISTINCT ON (input.clean_title)
                input.clean_title,
                mi.id,
                mi.title,
                mi.poster_url,
                mi.backdrop_url,
                mi.release_date,
                similarity(mi.title, input.clean_title) AS sim
            FROM unnest(CAST(:titles AS text[])) AS input(clean_title)
            JOIN media_items mi ON mi.media_type = 'game'
                AND mi.title % input.clean_title
            ORDER BY input.clean_title, sim DESC
        """)

        try:
            rows = await self._session.execute(sql, {"titles": clean_list})
        except Exception:
            logger.exception("trigram match query failed")
            return list(indices)

        matched: set[int] = set()
        for row in rows.mappings():
            clean_title = row["clean_title"]
            idx = title_to_idx.get(clean_title)
            if idx is None or idx in matched:
                continue

            sim = float(row["sim"])
            confidence = min(0.6, max(0.3, sim))
            _developer_overlap(
                requests[idx].developer,
                None,  # no MediaItem object, just use raw row
            )

            all_candidates[idx].append(
                GameMatchCandidate(
                    media_item_id=row["id"],
                    title=row["title"],
                    poster_url=row.get("poster_url"),
                    backdrop_url=row.get("backdrop_url"),
                    release_year=_release_year_from_date(row.get("release_date")),
                    confidence=confidence,
                    match_type=MatchType.TRIGRAM,
                )
            )
            matched.add(idx)

        return [i for i in indices if i not in matched]

    # ── Phase 3: IGDB provider search ───────────────────────────────────────

    async def _phase3_igdb(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        all_candidates: list[list[GameMatchCandidate]],
    ) -> None:
        """Search IGDB for unmatched games. Two sub-stages:

        3a. External ID cross-reference (Epic + Steam)
        3b. IGDB title search
        """
        provider = IGDBProvider(self._redis)

        unmatched = list(indices)

        # 3a: Cross-reference by external IDs
        if unmatched:
            unmatched = await self._phase3a_igdb_crossref(requests, unmatched, all_candidates, provider)

        # 3b: IGDB title search
        if unmatched:
            await self._phase3b_igdb_search(requests, unmatched, all_candidates, provider)

    async def _phase3a_igdb_crossref(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        all_candidates: list[list[GameMatchCandidate]],
        provider: IGDBProvider,
    ) -> list[int]:
        """Cross-reference Epic and Steam IDs via IGDB's external_games API.

        Returns indices that remain unmatched AFTER cross-reference.
        """
        # Collect IDs by category
        epic_ids: list[tuple[str, int]] = []  # (epic_id, req_idx)
        steam_ids: list[tuple[int, int]] = []  # (steam_id, req_idx)

        for idx in indices:
            req = requests[idx]
            if not req.external_ids:
                continue
            for ref in req.external_ids:
                if ref.source == "epic" and ref.id:
                    epic_ids.append((ref.id, idx))
                    break  # first Epic ID per request wins
                elif ref.source == "steam" and ref.id:
                    try:
                        steam_ids.append((int(ref.id), idx))
                        break
                    except (ValueError, TypeError):
                        pass

        matched: set[int] = set()

        # Epic cross-ref (category 26)
        if epic_ids:
            id_map: dict[str, int] = dict(epic_ids)
            try:
                epic_to_igdb = await provider.lookup_epic_ids(list(id_map.keys()))
            except Exception:
                logger.exception("IGDB Epic cross-ref failed")
                epic_to_igdb = {}

            for epic_id, igdb_id in epic_to_igdb.items():
                req_idx = id_map.get(epic_id)
                if req_idx is None or req_idx in matched:
                    continue
                await self._resolve_igdb_candidate(requests[req_idx], igdb_id, all_candidates, req_idx, provider)
                matched.add(req_idx)

        # Steam cross-ref (category 1)
        if steam_ids:
            id_map: dict[int, int] = dict(steam_ids)
            try:
                steam_to_igdb = await provider.lookup_steam_app_ids(list(id_map.keys()))
            except Exception:
                logger.exception("IGDB Steam cross-ref failed")
                steam_to_igdb = {}

            for steam_id, igdb_id in steam_to_igdb.items():
                req_idx = id_map.get(steam_id)
                if req_idx is None or req_idx in matched:
                    continue
                await self._resolve_igdb_candidate(requests[req_idx], igdb_id, all_candidates, req_idx, provider)
                matched.add(req_idx)

        return [i for i in indices if i not in matched]

    async def _resolve_igdb_candidate(
        self,
        request: GameMatchRequest,
        igdb_id: int,
        all_candidates: list[list[GameMatchCandidate]],
        idx: int,
        provider: IGDBProvider,
    ) -> None:
        """Check if an IGDB game is already in Otix. If not, build a
        needs_import candidate with the IGDB cover URL."""
        igdb_id_str = str(igdb_id)

        # Is this IGDB game already in our catalog?
        existing_ext = await self._session.scalar(
            select(ExternalID).where(
                ExternalID.provider == "igdb",
                ExternalID.external_id == igdb_id_str,
            ),
        )

        if existing_ext:
            entity_id = existing_ext.entity_id or existing_ext.media_item_id
            if entity_id:
                mi = await self._fetch_media_item(entity_id)
                if mi:
                    all_candidates[idx].append(
                        GameMatchCandidate(
                            media_item_id=entity_id,
                            title=mi.title,
                            poster_url=mi.poster_url,
                            backdrop_url=mi.backdrop_url,
                            release_year=_release_year_from_date(mi.release_date),
                            confidence=0.90,
                            match_type=MatchType.IGDB_CROSSREF,
                        )
                    )
                    return

        # Game not in catalog — fetch minimal IGDB data for a needs_import candidate
        try:
            raw = await provider.get_game(igdb_id, self.IGDB_SEARCH_FIELDS)
        except Exception:
            logger.exception("IGDB get_game failed", igdb_id=igdb_id)
            return

        if not raw:
            return

        title = raw.get("name") or request.title
        poster = _igdb_cover_url(raw.get("cover"))
        release_year = _parse_igdb_year(raw.get("first_release_date"))
        platforms = _igdb_platforms(raw.get("platforms") or [])

        all_candidates[idx].append(
            GameMatchCandidate(
                media_item_id=None,
                title=title,
                poster_url=poster,
                release_year=release_year,
                platforms=platforms,
                confidence=0.85,
                match_type=MatchType.IGDB_CROSSREF,
                needs_import=True,
                provider_id=igdb_id_str,
                provider="igdb",
            )
        )

    async def _phase3b_igdb_search(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        all_candidates: list[list[GameMatchCandidate]],
        provider: IGDBProvider,
    ) -> None:
        """Search IGDB by title for remaining unmatched games.

        Uses the existing scored heuristics (_pick_best_igdb_match).
        Processes in chunks for controlled concurrency.
        """
        chunk_size = self.IGDB_CHUNK_SIZE
        chunks = [indices[i : i + chunk_size] for i in range(0, len(indices), chunk_size)]

        for chunk in chunks:
            tasks = [self._search_igdb_one(provider, requests[idx], idx, all_candidates) for idx in chunk]
            await asyncio.gather(*tasks)

    async def _search_igdb_one(
        self,
        provider: IGDBProvider,
        request: GameMatchRequest,
        idx: int,
        all_candidates: list[list[GameMatchCandidate]],
    ) -> None:
        """Search IGDB for one game; add candidates if found."""
        try:
            candidates = await provider.search_games(
                request.title,
                limit=self.IGDB_SEARCH_LIMIT,
                fields=self.IGDB_SEARCH_FIELDS,
            )
            if not candidates:
                if ":" in request.title:
                    short = request.title.split(":")[0].strip()
                    candidates = await provider.search_games(
                        short,
                        limit=self.IGDB_SEARCH_LIMIT,
                        fields=self.IGDB_SEARCH_FIELDS,
                    )
                if not candidates:
                    return

            best = self._pick_best_igdb_match(candidates, request)
            if best is None:
                return

            igdb_id = best["id"]
            igdb_id_str = str(igdb_id)
            is_exact = self._is_exact_title_match(best, request)

            # Check if already in catalog
            existing_ext = await self._session.scalar(
                select(ExternalID).where(
                    ExternalID.provider == "igdb",
                    ExternalID.external_id == igdb_id_str,
                ),
            )

            poster = _igdb_cover_url(best.get("cover"))
            platforms = _igdb_platforms(best.get("platforms") or [])
            release_year = _parse_igdb_year(best.get("first_release_date"))

            title = best.get("name") or request.title

            if existing_ext:
                entity_id = existing_ext.entity_id or existing_ext.media_item_id
                if entity_id:
                    mi = await self._fetch_media_item(entity_id)
                    all_candidates[idx].append(
                        GameMatchCandidate(
                            media_item_id=entity_id,
                            title=mi.title if mi else title,
                            poster_url=mi.poster_url if mi else poster,
                            backdrop_url=mi.backdrop_url if mi else None,
                            release_year=_release_year_from_date(mi.release_date if mi else None) or release_year,
                            platforms=platforms,
                            confidence=0.80 if is_exact else 0.70,
                            match_type=MatchType.IGDB_SEARCH if is_exact else MatchType.IGDB_FUZZY,
                        )
                    )
            else:
                # Not in catalog — needs import
                all_candidates[idx].append(
                    GameMatchCandidate(
                        media_item_id=None,
                        title=title,
                        poster_url=poster,
                        release_year=release_year,
                        platforms=platforms,
                        confidence=0.80 if is_exact else 0.70,
                        match_type=MatchType.IGDB_SEARCH if is_exact else MatchType.IGDB_FUZZY,
                        needs_import=True,
                        provider_id=igdb_id_str,
                        provider="igdb",
                    )
                )
        except Exception:
            logger.exception("IGDB search failed", title=request.title)

    # ── Phase 4: Assemble, rank, auto-match ─────────────────────────────────

    def _phase4_assemble(
        self,
        requests: list[GameMatchRequest],
        all_candidates: list[list[GameMatchCandidate]],
    ) -> list[GameMatchResponse]:
        """Merge candidates, dedupe by media_item_id, rank by confidence,
        and decide auto-match."""
        results: list[GameMatchResponse] = []

        for i, req in enumerate(requests):
            raw = all_candidates[i]

            if not raw:
                results.append(
                    GameMatchResponse(
                        query_id=req.query_id,
                        query_title=req.title,
                        candidates=[],
                        auto_match=None,
                    )
                )
                continue

            # Dedupe: keep highest-confidence entry per media_item_id
            seen: dict[str, GameMatchCandidate] = {}
            for c in raw:
                key = c.media_item_id or f"__import_{c.provider}_{c.provider_id}"
                if key in seen:
                    if c.confidence > seen[key].confidence:
                        seen[key] = c
                else:
                    seen[key] = c

            candidates = sorted(seen.values(), key=lambda c: c.confidence, reverse=True)

            auto_match = self._decide_auto_match(candidates)

            results.append(
                GameMatchResponse(
                    query_id=req.query_id,
                    query_title=req.title,
                    candidates=candidates,
                    auto_match=auto_match,
                )
            )

        return results

    @staticmethod
    def _decide_auto_match(
        candidates: list[GameMatchCandidate],
    ) -> GameMatchCandidate | None:
        """Apply auto-match rules.

        - DIRECT match_type → always auto-match
        - confidence ≥ 0.95 → auto-match
        - confidence ≥ 0.85 AND gap to 2nd ≥ 0.20 → auto-match
        - candidate with needs_import=True → never auto-match
        """
        if not candidates:
            return None

        best = candidates[0]

        # Never auto-match a needs_import candidate
        if best.needs_import:
            return None

        # Direct external_id match is always auto
        if best.match_type == MatchType.DIRECT:
            return best

        # Very high confidence
        if best.confidence >= 0.95:
            return best

        # High confidence with clear gap to 2nd place
        if best.confidence >= 0.85:
            if len(candidates) == 1:
                return best
            second = candidates[1]
            if best.confidence - second.confidence >= 0.20:
                return best

        return None

    # ── Matching heuristics (unchanged from original) ───────────────────────

    @staticmethod
    def _is_exact_title_match(candidate: dict, request: GameMatchRequest) -> bool:
        name = (candidate.get("name") or "").strip().lower()
        target = request.title.strip().lower()
        return name == target

    @staticmethod
    def _pick_best_igdb_match(
        candidates: list[dict],
        request: GameMatchRequest,
    ) -> dict | None:
        """Score and select the best IGDB match.

        Scoring rubric (threshold: 60):
            - Exact title match            +100
            - Slug match                   +90
            - Contains / is contained by   +70
            - Developer matches            +20 (exact) / +10 (partial)
            - Platform overlap             +15 per matching platform
            - Release year within ±1       +10
        """
        THRESHOLD = 60
        target_lower = request.title.strip().lower()
        target_platforms = {PLATFORM_NORMALIZATION.get(p, p.lower()) for p in (request.platforms or [])}
        target_developer = (request.developer or "").lower().strip()

        best_score = 0
        best_candidate: dict | None = None

        for c in candidates:
            score = 0
            name = (c.get("name") or "").strip()
            name_lower = name.lower()

            # Title scoring
            if name_lower == target_lower:
                score += 100
            else:
                slug = (c.get("slug") or "").replace("-", " ").lower().strip()
                if slug == target_lower:
                    score += 90
                elif target_lower in name_lower or name_lower in target_lower:
                    score += 70

            # Developer / publisher match
            if target_developer:
                companies: list[JSONValue] = c.get("involved_companies") or []
                for ic in companies:
                    if not isinstance(ic, dict):
                        continue
                    company = ic.get("company") or {}
                    if not isinstance(company, dict):
                        continue
                    cname = (company.get("name") or "").lower().strip()
                    if cname == target_developer:
                        score += 20
                        break
                    if target_developer in cname or cname in target_developer:
                        score += 10
                        break

            # Platform overlap
            if target_platforms:
                raw_platforms: list[JSONValue] = c.get("platforms") or []
                candidate_platforms: set[str] = set()
                for p in raw_platforms:
                    pname = (p.get("name") or "") if isinstance(p, dict) else str(p)
                    candidate_platforms.add(
                        PLATFORM_NORMALIZATION.get(pname, pname.lower()),
                    )
                overlap = target_platforms & candidate_platforms
                if overlap:
                    score += 15 * len(overlap)

            # Release year proximity
            if request.release_year is not None:
                ts = c.get("first_release_date")
                if isinstance(ts, int | float):
                    try:
                        release_year = datetime.fromtimestamp(float(ts)).year
                        if abs(release_year - request.release_year) <= 1:
                            score += 10
                    except (ValueError, OSError):
                        pass

            if score > best_score:
                best_score = score
                best_candidate = c

        if best_candidate is not None and best_score >= THRESHOLD:
            return best_candidate
        return None

    # ── DB helpers ─────────────────────────────────────────────────────────

    async def _fetch_media_item(self, entity_id: str) -> MediaItem | None:
        if not entity_id:
            return None
        return await self._session.get(MediaItem, entity_id)

    async def _fetch_media_items(self, entity_ids: list[str]) -> dict[str, MediaItem]:
        if not entity_ids:
            return {}
        rows = await self._session.execute(
            select(MediaItem).where(MediaItem.id.in_(entity_ids)),
        )
        return {mi.id: mi for mi in rows.scalars().all()}


# ── Module-level helpers ────────────────────────────────────────────────────


def _release_year_from_date(d: datetime | None) -> int | None:
    """Extract year from a datetime or date object."""
    if d is None:
        return None
    if hasattr(d, "year"):
        return d.year
    return None


def _parse_igdb_year(ts: object) -> int | None:
    """Parse release year from an IGDB timestamp."""
    if isinstance(ts, int | float):
        try:
            return datetime.fromtimestamp(float(ts)).year
        except (ValueError, OSError):
            pass
    return None


def _developer_overlap(
    request_dev: str | None,
    media_item: MediaItem | None,
) -> bool:
    """Check if the request developer loosely matches the catalog item."""
    if not request_dev:
        return False
    # For simplicity: we don't have developer stored on MediaItem directly
    # Catalog game developer is in involved_companies via Game relationships
    # This is a lightweight check — more thorough matching happens in IGDB phase
    return False
