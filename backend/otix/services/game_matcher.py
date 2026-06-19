"""Game matching service — multi-stage pipeline for matching games to the catalog.

Matching pipeline stages:

    1. External ID match (local database lookup)
    2. IGDB cross-reference (via ``external_games`` API)
    3. IGDB title search (scored heuristics)
    4. PostgreSQL trigram similarity (fallback)

Each stage only processes games that remain unmatched after the previous
stage, ensuring the most reliable signals are used first.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime
from typing import TYPE_CHECKING

import structlog
from redis.asyncio import Redis
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import ExternalID, MediaItem
from otix.providers.igdb.client import IGDBProvider
from otix.schemas.media import GameMatchRequest, GameMatchResult
from otix.services.external_id_service import ExternalIDService

if TYPE_CHECKING:
    from otix.lib.types import JSONValue

logger = structlog.get_logger()

# ── Platform name normalization ────────────────────────────────────────────
# Maps IGDB / Epic platform display names to Otix platform slugs.

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

# ── Title normalisation regexes (matches media_service.py) ──────────────────

_RE_SCENE_GROUPS = re.compile(
    r"[-.\s](?:RUNE|CODEX|FLT|PLAZA|HOODLUM|SKIDROW|TENOKE|DODI|"
    r"ElAmigos|Razor1911|FAIRLIGHT|GOLDBERG|P2P|EMPRESS|FCKDRM|"
    r"STEAMPUNKS|CPY|RELOADED|PROPHET|TiNYiSO|BAT|ALI213|3DM|GOG|FCK)",
    re.IGNORECASE,
)
_RE_VERSION = re.compile(r"[\[\(]?\s*v?\d+(?:\.\d+)+(?:\w\d*)?\s*[\]\)]?")
_RE_EDITION = re.compile(
    r"(?:\b(?:goty|game of the year|definitive|enhanced|remastered|"
    r"ultimate|complete|deluxe|collectors|special|legendary|"
    r"anniversary|vr|directors? cut)\s*edition\b)",
    re.IGNORECASE,
)
_RE_EDITION_WORDS = re.compile(
    r"\b(?:goty|remastered|definitive|enhanced|complete|deluxe|"
    r"legendary|anniversary|repack|multilingual)\b",
    re.IGNORECASE,
)


def _normalize_title(raw: str) -> str:
    """Normalize a game title for fuzzy matching.

    Strips scene-group tags, version numbers, edition suffixes,
    dots, underscores, and collapses whitespace.

    This exact logic is duplicated from
    ``media_service._match_local_games_by_trigram`` to keep the
    matcher self-contained.
    """
    clean = raw
    clean = _RE_SCENE_GROUPS.sub("", clean)
    clean = _RE_VERSION.sub("", clean)
    clean = _RE_EDITION.sub("", clean)
    clean = _RE_EDITION_WORDS.sub("", clean)
    clean = clean.replace(".", " ").replace("_", " ")
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


# ── Service class ──────────────────────────────────────────────────────────


class GameMatcher:
    """Multi-stage game matching service.

    Stages are run sequentially; each stage only processes games that
    remain unmatched after the previous one.  This ensures the most
    reliable signals are used first:

    1. **External ID** (local ``external_ids`` table)  — confidence 1.0
    2. **IGDB cross-reference** (``/external_games`` API)  — 0.85 / 0.9
    3. **IGDB title search** (scored heuristics)  — 0.7 / 0.8
    4. **Trigram similarity** (PostgreSQL ``pg_trgm``)  — 0.3–0.6
    """

    def __init__(self, session: AsyncSession, redis: Redis) -> None:
        self._session = session
        self._redis = redis
        self._eid_svc = ExternalIDService(session)

    # ── Public API ─────────────────────────────────────────────────────────

    async def match_single(self, request: GameMatchRequest) -> GameMatchResult:
        """Match a single game through all four stages.

        Returns a ``GameMatchResult``. If no stage finds a match,
        ``confidence`` is 0.0 and ``match_type`` is ``"none"``.
        """
        results: list[GameMatchResult | None] = [None]
        idxs = await self._stage1_external_ids([request], [0], results)
        if idxs:
            idxs = await self._stage2_igdb_crossref([request], idxs, results)
        if idxs:
            idxs = await self._stage3_igdb_search([request], idxs, results)
        if idxs:
            await self._stage4_trigram([request], idxs, results)
        return results[0] or GameMatchResult(
            title=request.title,
            confidence=0.0,
            match_type="none",
        )

    async def match_batch(
        self,
        requests: list[GameMatchRequest],
    ) -> list[GameMatchResult]:
        """Match multiple games through all four stages.

        External-ID lookups are batched by provider for efficiency.
        Unmatched games fall through each successive stage.
        """
        results: list[GameMatchResult | None] = [None] * len(requests)
        idxs = list(range(len(requests)))
        idxs = await self._stage1_external_ids(requests, idxs, results)
        if idxs:
            idxs = await self._stage2_igdb_crossref(requests, idxs, results)
        if idxs:
            idxs = await self._stage3_igdb_search(requests, idxs, results)
        if idxs:
            await self._stage4_trigram(requests, idxs, results)
        return [
            r
            or GameMatchResult(
                title=requests[i].title,
                confidence=0.0,
                match_type="none",
            )
            for i, r in enumerate(results)
        ]

    # ── Stage 1: External-ID lookup (local database) ───────────────────────

    async def _stage1_external_ids(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        results: list[GameMatchResult | None],
    ) -> list[int]:
        """Match games by their known external IDs (Steam, Epic, GOG, etc.).

        Groups external IDs by provider, then issues one
        ``batch_find_entity_ids`` call per provider.  Matched games are
        written into ``results`` with confidence 1.0.
        """
        # Collect {source: {external_id: request_index}} for unmatched items
        source_ids: dict[str, dict[str, int]] = {}
        for idx in indices:
            req = requests[idx]
            if not req.external_ids:
                continue
            for ref in req.external_ids:
                source_ids.setdefault(ref.source, {})[ref.id] = idx

        if not source_ids:
            return list(indices)

        # Batch-lookup each source
        for source, id_map in source_ids.items():
            ext_ids = list(id_map.keys())
            try:
                entity_map = await self._eid_svc.batch_find_entity_ids(source, ext_ids)
            except Exception:
                logger.exception("external ID batch lookup failed", source=source)
                continue

            # Fetch all matching MediaItems in one go
            entity_ids_to_fetch = list(
                {eid for eid in entity_map.values() if eid is not None}
            )
            media_items = await self._fetch_media_items(entity_ids_to_fetch)

            for ext_id, entity_id in entity_map.items():
                if not entity_id:
                    continue
                req_idx = id_map.get(ext_id)
                if req_idx is None or results[req_idx] is not None:
                    continue

                mi = media_items.get(entity_id)
                results[req_idx] = GameMatchResult(
                    media_item_id=entity_id,
                    title=requests[req_idx].title,
                    poster_url=mi.poster_url if mi else None,
                    confidence=1.0,
                    match_type="external_id",
                )

        return [idx for idx in indices if results[idx] is None]

    # ── Stage 2: IGDB cross-reference ──────────────────────────────────────

    async def _stage2_igdb_crossref(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        results: list[GameMatchResult | None],
    ) -> list[int]:
        """Cross-reference Steam / Epic IDs via IGDB's ``external_games`` API.

        For each still-unmatched game that carries a Steam or Epic
        external ID:

        1. Ask IGDB for the matching ``igdb_game_id``.
        2. If that IGDB game is *already* in our catalog → link with
           confidence 0.9.
        3. If not → auto-import via ``_sync_igdb_game`` and link with
           confidence 0.85 (``is_new=True``).
        """
        provider = IGDBProvider(self._redis)

        # Collect IDs by source (first ID per request wins)
        steam_batch: dict[int, int] = {}
        epic_batch: dict[str, int] = {}
        for idx in indices:
            req = requests[idx]
            if not req.external_ids:
                continue
            for ref in req.external_ids:
                if ref.source == "steam" and idx not in steam_batch.values():
                    try:
                        steam_batch[int(ref.id)] = idx
                    except (ValueError, TypeError):
                        pass
                elif ref.source == "epic" and idx not in epic_batch.values():
                    epic_batch[ref.id] = idx

        # -- Steam cross-ref --
        if steam_batch:
            try:
                steam_to_igdb = await provider.lookup_steam_app_ids(
                    list(steam_batch.keys()),
                )
            except Exception:
                logger.exception("IGDB Steam cross-ref failed")
                steam_to_igdb = {}

            for steam_id, igdb_id in steam_to_igdb.items():
                req_idx = steam_batch.get(steam_id)
                if req_idx is None or results[req_idx] is not None:
                    continue
                await self._link_or_import_igdb(
                    requests[req_idx], igdb_id, results, req_idx,
                )

        # -- Epic cross-ref --
        if epic_batch:
            try:
                epic_to_igdb = await provider.lookup_epic_app_ids(
                    list(epic_batch.keys()),
                )
            except Exception:
                logger.exception("IGDB Epic cross-ref failed")
                epic_to_igdb = {}

            for epic_id, igdb_id in epic_to_igdb.items():
                req_idx = epic_batch.get(epic_id)
                if req_idx is None or results[req_idx] is not None:
                    continue
                await self._link_or_import_igdb(
                    requests[req_idx], igdb_id, results, req_idx,
                )

        return [idx for idx in indices if results[idx] is None]

    async def _link_or_import_igdb(
        self,
        request: GameMatchRequest,
        igdb_id: int,
        results: list[GameMatchResult | None],
        idx: int,
    ) -> None:
        """Link an existing IGDB game or auto-import it.

        Called from ``_stage2_igdb_crossref`` once the IGDB game ID
        is known.
        """
        existing_ext = await self._session.scalar(
            select(ExternalID).where(
                ExternalID.provider == "igdb",
                ExternalID.external_id == str(igdb_id),
            ),
        )
        if existing_ext:
            entity_id = existing_ext.entity_id or existing_ext.media_item_id
            if entity_id:
                mi = await self._fetch_media_item(entity_id)
                results[idx] = GameMatchResult(
                    media_item_id=entity_id,
                    title=request.title,
                    poster_url=mi.poster_url if mi else None,
                    confidence=0.9,
                    match_type="igdb_crossref",
                )
        else:
            new_id = await self._auto_import_igdb(igdb_id)
            if new_id:
                mi = await self._fetch_media_item(new_id)
                results[idx] = GameMatchResult(
                    media_item_id=new_id,
                    title=request.title,
                    poster_url=mi.poster_url if mi else None,
                    confidence=0.85,
                    match_type="igdb_crossref",
                    is_new=True,
                )

    # ── Stage 3: IGDB title search ─────────────────────────────────────────

    async def _stage3_igdb_search(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        results: list[GameMatchResult | None],
    ) -> list[int]:
        """Search IGDB by title for remaining unmatched games.

        Uses enhanced scoring: exact title (+100), slug (+90), contains
        (+70), developer match (+20), platform overlap (+15), release
        year within ±1 (+10).  Threshold is 60.

        Requests are processed in chunks of 50 for controlled
        concurrency.
        """
        provider = IGDBProvider(self._redis)

        chunk_size = 50
        chunks = [
            indices[i : i + chunk_size]
            for i in range(0, len(indices), chunk_size)
        ]

        for chunk in chunks:
            tasks = [
                self._search_and_match_one(provider, requests[idx], idx, results)
                for idx in chunk
            ]
            await asyncio.gather(*tasks)

        return [idx for idx in indices if results[idx] is None]

    async def _search_and_match_one(
        self,
        provider: IGDBProvider,
        request: GameMatchRequest,
        idx: int,
        results: list[GameMatchResult | None],
    ) -> None:
        """Search IGDB for a single game and record the result if found."""
        try:
            candidates = await provider.search_games(request.title, limit=20)
            if not candidates:
                if ":" in request.title:
                    short = request.title.split(":")[0].strip()
                    candidates = await provider.search_games(short, limit=20)
                if not candidates:
                    return

            candidate = self._pick_best_igdb_match(candidates, request)
            if candidate is None:
                return

            igdb_id = candidate["id"]
            is_exact = self._is_exact_title_match(candidate, request)

            existing_ext = await self._session.scalar(
                select(ExternalID).where(
                    ExternalID.provider == "igdb",
                    ExternalID.external_id == str(igdb_id),
                ),
            )
            if existing_ext:
                entity_id = existing_ext.entity_id or existing_ext.media_item_id
                if entity_id:
                    mi = await self._fetch_media_item(entity_id)
                    results[idx] = GameMatchResult(
                        media_item_id=entity_id,
                        title=request.title,
                        poster_url=mi.poster_url if mi else None,
                        confidence=0.8 if is_exact else 0.7,
                        match_type="igdb_search" if is_exact else "igdb_fuzzy",
                    )
            else:
                new_id = await self._auto_import_igdb(igdb_id)
                if new_id:
                    mi = await self._fetch_media_item(new_id)
                    results[idx] = GameMatchResult(
                        media_item_id=new_id,
                        title=request.title,
                        poster_url=mi.poster_url if mi else None,
                        confidence=0.8 if is_exact else 0.7,
                        match_type="igdb_search" if is_exact else "igdb_fuzzy",
                        is_new=True,
                    )
        except Exception:
            logger.exception("IGDB search failed", title=request.title)

    # ── Stage 4: Trigram similarity fallback ───────────────────────────────

    async def _stage4_trigram(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        results: list[GameMatchResult | None],
    ) -> None:
        """Fallback: match via PostgreSQL trigram similarity.

        Uses the same ``unnest`` + ``similarity()`` pattern as
        ``media_service._match_local_games_by_trigram``.  Confidence
        is clamped to the range [0.3, 0.6].
        """
        # Build clean-title index for the unmatched subset
        title_to_idx = {requests[i].title: i for i in indices}
        clean_to_raw: dict[str, str] = {}
        clean_list: list[str] = []

        for i in indices:
            raw = requests[i].title
            clean = _normalize_title(raw)
            if not clean or clean in clean_to_raw:
                continue
            clean_to_raw[clean] = raw
            clean_list.append(clean)

        if not clean_list:
            return

        sql = text("""
            SELECT DISTINCT ON (input.clean_title)
                input.clean_title,
                mi.id,
                mi.title,
                mi.poster_url,
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
            return

        for row in rows.mappings():
            clean_title = row["clean_title"]
            raw_title = clean_to_raw.get(clean_title)
            if raw_title is None:
                continue
            req_idx = title_to_idx.get(raw_title)
            if req_idx is None or results[req_idx] is not None:
                continue

            sim = float(row["sim"])
            confidence = min(0.6, max(0.3, sim))

            results[req_idx] = GameMatchResult(
                media_item_id=row["id"],
                title=raw_title,
                poster_url=row.get("poster_url"),
                confidence=confidence,
                match_type="trigram",
            )

    # ── Auto-import helper ─────────────────────────────────────────────────

    async def _auto_import_igdb(self, igdb_id: int) -> str | None:
        """Import an IGDB game into the catalog.

        Deduplicates concurrent imports via a Redis lock, calls
        ``_sync_igdb_game``, then re-queries the ``ExternalID`` table.

        Returns the new ``media_item_id``, or ``None`` on failure.
        """
        dedup_key = f"igdb:importing:{igdb_id}"
        locked = await self._redis.setnx(dedup_key, "1")
        if not locked:
            # Another worker is importing this ID — poll briefly
            for _ in range(10):
                await asyncio.sleep(0.5)
                ext = await self._session.scalar(
                    select(ExternalID).where(
                        ExternalID.provider == "igdb",
                        ExternalID.external_id == str(igdb_id),
                    ),
                )
                if ext:
                    return ext.entity_id or ext.media_item_id
            return None

        try:
            await self._redis.expire(dedup_key, 60)
            from otix.tasks.sync.igdb import _sync_igdb_game

            await _sync_igdb_game(igdb_id, force=False)

            ext = await self._session.scalar(
                select(ExternalID).where(
                    ExternalID.provider == "igdb",
                    ExternalID.external_id == str(igdb_id),
                ),
            )
            if ext:
                return ext.entity_id or ext.media_item_id

            logger.warning(
                "IGDB sync OK but ExternalID missing",
                igdb_id=igdb_id,
            )
            return None
        except Exception:
            logger.exception("IGDB auto-import failed", igdb_id=igdb_id)
            return None
        finally:
            await self._redis.delete(dedup_key)

    # ── Matching heuristics ────────────────────────────────────────────────

    @staticmethod
    def _is_exact_title_match(candidate: dict, request: GameMatchRequest) -> bool:
        """Return ``True`` when the candidate's name matches the request title exactly."""
        name = (candidate.get("name") or "").strip().lower()
        target = request.title.strip().lower()
        return name == target

    @staticmethod
    def _pick_best_igdb_match(
        candidates: list[dict],
        request: GameMatchRequest,
    ) -> dict | None:
        """Score and select the best IGDB match for a game request.

        Scoring rubric (threshold: **60**):

        - Exact title match            +100
        - Slug match                   +90
        - Contains / is contained by   +70
        - Developer matches            +20 (exact) / +10 (partial)
        - Platform overlap             +15 per matching platform
        - Release year within ±1       +10

        Returns the highest-scoring candidate, or ``None`` if no
        candidate reaches the threshold.
        """
        THRESHOLD = 60
        target_lower = request.title.strip().lower()
        target_platforms = {
            PLATFORM_NORMALIZATION.get(p, p.lower())
            for p in (request.platforms or [])
        }
        target_developer = (request.developer or "").lower().strip()

        best_score = 0
        best_candidate: dict | None = None

        for c in candidates:
            score = 0
            name = (c.get("name") or "").strip()
            name_lower = name.lower()

            # ── Title scoring ──────────────────────────────────────────────
            if name_lower == target_lower:
                score += 100
            else:
                slug = (c.get("slug") or "").replace("-", " ").lower().strip()
                if slug == target_lower:
                    score += 90
                elif target_lower in name_lower or name_lower in target_lower:
                    score += 70

            # ── Developer / publisher match ────────────────────────────────
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

            # ── Platform overlap ───────────────────────────────────────────
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

            # ── Release year proximity ─────────────────────────────────────
            if request.release_year is not None:
                ts = c.get("first_release_date")
                if isinstance(ts, (int, float)):
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
        """Fetch a single ``MediaItem`` by ID."""
        if not entity_id:
            return None
        return await self._session.get(MediaItem, entity_id)

    async def _fetch_media_items(self, entity_ids: list[str]) -> dict[str, MediaItem]:
        """Batch-fetch ``MediaItem`` records by ID.

        Returns ``{entity_id: MediaItem}`` — missing IDs are omitted.
        """
        if not entity_ids:
            return {}
        rows = await self._session.execute(
            select(MediaItem).where(MediaItem.id.in_(entity_ids)),
        )
        return {mi.id: mi for mi in rows.scalars().all()}
