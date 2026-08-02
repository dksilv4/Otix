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

import re
import time
import unicodedata
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import structlog
from redis.asyncio import Redis
from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from otix.domain.base import gen_otix_id
from otix.domain.company import InvolvedCompany
from otix.domain.media import ExternalID, MatchSkip, MediaItem
from otix.providers.asset_pipeline import AssetPipeline, RawAsset
from otix.providers.igdb.client import IGDBProvider
from otix.providers.steamgrid.client import SteamGridDBProvider
from otix.schemas.media import (
    GameMatchCandidate,
    GameMatchRequest,
    GameMatchResponse,
    MatchType,
    StreamCompleteEvent,
    StreamMatchEvent,
)
from otix.services.asset_selection import enrich_items_with_assets
from otix.services.external_id_service import ExternalIDService

if TYPE_CHECKING:
    from otix.lib.types import JSONValue

logger = structlog.get_logger()

# SteamGridDB grid styles → asset variant label
_GRID_LABELS = {
    "no_logo": "textless",
    "material": "material",
    "alternate": "alternate",
    "blurred": "blurred",
    "white": "white",
}

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

    - Strip ™®© BEFORE NFKD decomposition (NFKD splits ™→TM)
    - Decompose unicode (accents → base) and strip combining marks
    - Remove punctuation so "Batman: Arkham" matches "Batman Arkham"
    - Collapse whitespace
    """
    # Strip trademark/copyright symbols BEFORE NFKD (which decomposes ™→TM)
    clean = re.sub(r"[™®©]", "", raw)
    # NFKD: decompose accented chars (é → e + combining acute)
    clean = unicodedata.normalize("NFKD", clean)
    # Strip combining diacritical marks (Unicode category Mn)
    clean = "".join(ch for ch in clean if unicodedata.category(ch) != "Mn")
    # Remove punctuation except hyphens and apostrophes (game titles use these)
    # "Batman: Arkham" → "Batman Arkham", "Widget Inc." → "Widget Inc"
    clean = re.sub(r"[:,\.;!\?\(\)\[\]\{\}]", "", clean)
    # Collapse whitespace
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
    return f"https://images.igdb.com/igdb/image/upload/t_1080p/{image_id}.jpg"


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

    def __init__(self, session: AsyncSession, redis: Redis, steamgrid: SteamGridDBProvider | None = None) -> None:
        self._session = session
        self._redis = redis
        self._eid_svc = ExternalIDService(session)
        self._steamgrid = steamgrid

    # ── Public API ─────────────────────────────────────────────────────────

    async def match_single(self, request: GameMatchRequest) -> GameMatchResponse:
        """Match a single game through all four phases."""
        results = await self.match_batch([request], media_type=request.media_type)
        return results[0]

    async def match_batch(
        self,
        requests: list[GameMatchRequest],
        media_type: str = "game",
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
            unmatched = await self._phase2_otix(requests, unmatched, all_candidates, media_type)

        # ── Phase 3: IGDB provider search (game only) ───────────────────────
        if unmatched and media_type == "game":
            await self._phase3_igdb(requests, unmatched, all_candidates)

        # ── Phase 3c: SteamGrid search (game only) ──────────────────────────
        if unmatched and media_type == "game" and self._steamgrid:
            await self._phase3c_steamgrid(requests, unmatched, all_candidates)

        # ── Phase 4: Assemble, rank, auto-match ─────────────────────────────
        return self._phase4_assemble(requests, all_candidates, media_type)

    # ── SSE batch stream ────────────────────────────────────────────────────

    async def match_batch_stream(
        self,
        requests: list[GameMatchRequest],
        media_type: str = "game",
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

                # Create match proposal for auto-matches (backend handles approval inline)
                proposal_status = None
                has_auto = response.auto_match is not None
                has_media_id = has_auto and bool(response.auto_match.media_item_id)
                logger.info("match_proposal_check", title=req.title, has_auto=has_auto, has_media_id=has_media_id)
                if has_media_id:
                    proposal_status = await self._create_match_proposal(
                        req,
                        response.auto_match,
                    )

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
                            proposal_status=proposal_status,
                        ).model_dump_json()
                    }\n\n"
                )
            except Exception as exc:
                errored_count += 1
                logger.exception("match_batch_stream error", title=req.title)
                # Roll back poisoned session so subsequent games can continue
                try:
                    await self._session.rollback()
                except Exception:
                    pass
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

        # Check unified proposals for existing match proposals
        # This prevents re-processing games that already have a match decision
        from sqlalchemy import String, cast

        from otix.domain.proposal import Proposal as MatchProp

        for source, id_map in source_ids.items():
            ext_ids = list(id_map.keys())
            # query proposals where payload contains this source + source_game_id
            proposal_rows = await self._session.execute(
                select(MatchProp).where(
                    MatchProp.proposal_type == "match",
                    MatchProp.status.in_(["approved", "pending"]),
                    cast(MatchProp.payload["source"], String) == source,
                    cast(MatchProp.payload["source_game_id"], String).in_(ext_ids),
                )
            )
            for proposal in proposal_rows.scalars().all():
                if proposal.status == "approved":
                    confidence = 0.98  # approved = 1 user confirmation
                else:
                    confidence = 0.90  # pending = match found but not yet reviewed
                pl = proposal.payload
                sgi = pl.get("source_game_id")
                for req_idx in id_map.get(sgi, []):
                    # Avoid duplicates with direct match
                    if any(c.match_type == MatchType.DIRECT for c in all_candidates[req_idx]):
                        continue
                    mi = await self._fetch_media_item(pl.get("otix_media_id", ""))
                    all_candidates[req_idx].append(
                        GameMatchCandidate(
                            media_item_id=pl.get("otix_media_id", ""),
                            title=pl.get("otix_title", ""),
                            poster_url=mi.poster_url if mi else pl.get("poster_url"),
                            release_year=pl.get("release_year"),
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
        media_type: str = "game",
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
            unmatched = await self._phase2a_exact(requests, unmatched, all_candidates, media_type)

        # 2b: ILIKE pattern match
        if unmatched:
            unmatched = await self._phase2b_ilike(requests, unmatched, all_candidates, media_type)

        # 2c: Trigram similarity
        if unmatched:
            unmatched = await self._phase2c_trigram(requests, unmatched, all_candidates, media_type)

        return unmatched

    async def _phase2a_exact(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        all_candidates: list[list[GameMatchCandidate]],
        media_type: str = "game",
    ) -> list[int]:
        """Exact case-insensitive title match against media_items."""
        titles = {_normalize_title(requests[i].title).lower(): i for i in indices}
        if not titles:
            return list(indices)

        # Paginate to avoid unbounded memory from loading all media_items at once
        page_size = 10000
        offset = 0
        media_map: dict[str, list[MediaItem]] = {}
        while True:
            batch = await self._session.execute(
                select(MediaItem)
                .where(MediaItem.media_type == media_type)
                .limit(page_size)
                .offset(offset)
            )
            items = batch.scalars().all()
            if not items:
                break
            for mi in items:
                key = _normalize_title(mi.title).lower()
                if key in titles:
                    media_map.setdefault(key, []).append(mi)
            offset += page_size

        # Batch-fetch developers for all matched media items
        all_mi_ids = [mi.id for items in media_map.values() for mi in items]
        dev_map = await self._batch_fetch_developers(all_mi_ids)

        # Resolve asset URLs for the matched subset (bounded by request count)
        await enrich_items_with_assets(
            self._session, [mi for items in media_map.values() for mi in items], redis=self._redis
        )

        matched: set[int] = set()
        for title_lower, idx in titles.items():
            items = media_map.get(title_lower, [])
            for mi in items:
                dev_match = _developer_overlap(requests[idx].developer, dev_map.get(mi.id))
                year_bonus = _year_proximity_bonus(requests[idx].release_year, mi)
                confidence = min(1.0, 0.95 + (0.02 if dev_match else 0.0) + year_bonus)
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
        media_type: str = "game",
    ) -> list[int]:
        """ILIKE pattern match -- batched into one DB round trip.

        Collects all normalized titles, issues a single query with OR'd
        ILIKE conditions, then distributes results back per-request.
        """

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
                MediaItem.media_type == media_type,
                or_(*conditions),
            )
            .limit(500)  # safety limit
        )
        catalog_items = list(rows.scalars().all())
        await enrich_items_with_assets(self._session, catalog_items, redis=self._redis)

        # Batch-fetch developers for matched catalog items
        all_mi_ids = [mi.id for mi in catalog_items]
        dev_map = await self._batch_fetch_developers(all_mi_ids)

        # Match each catalog item to its best-matching request.
        # Collect all (request_idx, catalog_item, score) then assign
        # each catalog item to the request with the highest score.
        item_matches: list[tuple[int, object, float]] = []  # (req_idx, mi, score)
        for mi in catalog_items:
            mi_lower = mi.title.lower()
            mi_words = set(mi_lower.split())
            for i, norm in idx_to_norm.items():
                norm_lower = norm.lower()
                if norm_lower in mi_lower or mi_lower in norm_lower:
                    # Word-overlap quality check (Fix 3a)
                    req_words = set(norm_lower.split())
                    shared = req_words & mi_words
                    union = req_words | mi_words
                    overlap_ratio = len(shared) / max(len(union), 1)
                    if overlap_ratio < 0.4:
                        continue  # too dissimilar, skip
                    # Prevent "Alien Isolation" matching "Isolation" — first word must match
                    if not _titles_compatible(norm, mi.title):
                        continue
                    # Score = overlap ratio + developer bonus
                    dev_match = _developer_overlap(requests[i].developer, dev_map.get(mi.id))
                    score = overlap_ratio + (0.15 if dev_match else 0.0)
                    item_matches.append((i, mi, score))

        # Sort by score descending, assign each catalog item to best request (Fix 3b)
        item_matches.sort(key=lambda x: x[2], reverse=True)
        assigned_items: set[str] = set()  # mi.id already assigned
        for req_idx, mi, _score in item_matches:
            if mi.id in assigned_items:
                continue
            dev_match = _developer_overlap(requests[req_idx].developer, dev_map.get(mi.id))
            year_bonus = _year_proximity_bonus(requests[req_idx].release_year, mi)
            confidence = min(0.88, (0.85 if dev_match else 0.75) + year_bonus)

            # Franchise entry penalty: different numbers → cap below auto-match
            if _different_franchise_entry(requests[req_idx].title, mi.title):
                confidence = min(confidence, 0.70)

            all_candidates[req_idx].append(
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
            assigned_items.add(mi.id)

        # Return indices that received no ILIKE candidate, or only low-confidence ones.
        # Low-confidence ILIKE matches stay eligible for Phase 3 IGDB search.
        best_iliKE: dict[int, float] = {}
        for req_idx, _, _score in item_matches:
            # Get confidence from the candidate we just added for this index
            added = all_candidates[req_idx]
            if added:
                best_iliKE[req_idx] = max(best_iliKE.get(req_idx, 0), added[-1].confidence)
        return [i for i in indices if best_iliKE.get(i, 0) < 0.85]

    async def _phase2c_trigram(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        all_candidates: list[list[GameMatchCandidate]],
        media_type: str = "game",
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
                mi.release_date,
                similarity(mi.title, input.clean_title) AS sim
            FROM unnest(CAST(:titles AS text[])) AS input(clean_title)
            JOIN media_items mi ON mi.media_type = :media_type
                AND mi.title % input.clean_title
            ORDER BY input.clean_title, sim DESC
        """)

        try:
            rows = await self._session.execute(sql, {"titles": clean_list, "media_type": media_type})
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
            confidence = min(0.78, 0.70 + sim * 0.2)

            # Prevent fuzzy matches with wrong first word (e.g. "Alien Isolation" ≠ "Isolation")
            if not _titles_compatible(requests[idx].title, row["title"]):
                continue

            # Franchise entry penalty: different numbers → cap below auto-match
            if _different_franchise_entry(requests[idx].title, row["title"]):
                confidence = min(confidence, 0.70)

            mi = await self._fetch_media_item(row["id"])
            all_candidates[idx].append(
                GameMatchCandidate(
                    media_item_id=row["id"],
                    title=row["title"],
                    poster_url=mi.poster_url if mi else None,
                    backdrop_url=mi.backdrop_url if mi else None,
                    release_year=_release_year_from_date(row.get("release_date")),
                    confidence=confidence,
                    match_type=MatchType.TRIGRAM,
                )
            )
            matched.add(idx)

        # Only remove high-confidence trigram matches (>= 0.85). Lower-confidence
        # matches stay eligible for Phase 3 IGDB search.
        best_trigram: dict[int, float] = {}
        for idx in matched:
            added = all_candidates[idx]
            if added:
                best_trigram[idx] = max(best_trigram.get(idx, 0), added[-1].confidence)
        return [i for i in indices if best_trigram.get(i, 0) < 0.85]

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
        ext_result = await self._session.execute(
            select(ExternalID).where(
                ExternalID.provider == "igdb",
                ExternalID.external_id == igdb_id_str,
            ),
        )
        existing_ext = ext_result.scalars().first()

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

        # Game not in catalog — fetch IGDB data and seed into DB
        try:
            raw = await provider.get_game(igdb_id, self.IGDB_SEARCH_FIELDS)
        except Exception:
            logger.exception("IGDB get_game failed", igdb_id=igdb_id)
            return

        if not raw:
            return

        # Seed into catalog: creates MediaItem + ExternalID mapping
        new_media_id = await self._seed_game_from_igdb(raw, igdb_id)

        title = raw.get("name") or request.title
        poster = _igdb_cover_url(raw.get("cover"))
        release_year = _parse_igdb_year(raw.get("first_release_date"))
        platforms = _igdb_platforms(raw.get("platforms") or [])

        all_candidates[idx].append(
            GameMatchCandidate(
                media_item_id=new_media_id,
                title=title,
                poster_url=poster,
                release_year=release_year,
                platforms=platforms,
                confidence=0.90,
                match_type=MatchType.IGDB_CROSSREF,
                needs_import=False,
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
            # Serialize DB access — async session doesn't support concurrent queries
            for idx in chunk:
                await self._search_igdb_one(provider, requests[idx], idx, all_candidates)

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

            # Check if already in catalog — use execute + first() to ensure cursor closure
            ext_result = await self._session.execute(
                select(ExternalID).where(
                    ExternalID.provider == "igdb",
                    ExternalID.external_id == igdb_id_str,
                ),
            )
            existing_ext = ext_result.scalars().first()

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
                            confidence=0.90 if is_exact else 0.70,
                            match_type=MatchType.IGDB_SEARCH if is_exact else MatchType.IGDB_FUZZY,
                        )
                    )
            else:
                # Not in catalog — seed from IGDB data
                new_media_id = await self._seed_game_from_igdb(best, igdb_id)
                all_candidates[idx].append(
                    GameMatchCandidate(
                        media_item_id=new_media_id,
                        title=title,
                        poster_url=poster,
                        release_year=release_year,
                        platforms=platforms,
                        confidence=0.90 if is_exact else 0.70,
                        match_type=MatchType.IGDB_SEARCH if is_exact else MatchType.IGDB_FUZZY,
                        needs_import=False,
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
        media_type: str = "game",
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

            # Filter out low-confidence candidates (below 70%)
            eligible = [c for c in seen.values() if c.confidence >= 0.70]
            candidates = sorted(eligible, key=lambda c: c.confidence, reverse=True)

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

        # Auto-match needs_import only when confidence ≥ 0.90 (exact IGDB title match)
        if best.needs_import:
            if best.confidence >= 0.90 and best.match_type == MatchType.IGDB_SEARCH:
                return best
            return None

        # Direct external_id match is always auto
        if best.match_type == MatchType.DIRECT:
            return best

        # Very high confidence
        if best.confidence >= 0.95:
            return best

        # High confidence with clear gap to 2nd place (or only candidate)
        if best.confidence >= 0.85:
            if len(candidates) == 1:
                return best
            second = candidates[1]
            if best.confidence - second.confidence >= 0.10:
                return best

        return None

    # ── Matching heuristics (unchanged from original) ───────────────────────

    @staticmethod
    def _is_exact_title_match(candidate: dict, request: GameMatchRequest) -> bool:
        name = _normalize_title(candidate.get("name") or "").lower()
        target = _normalize_title(request.title).lower()
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

    # ── Phase 3c: SteamGrid search ──────────────────────────────────────────

    async def _phase3c_steamgrid(
        self,
        requests: list[GameMatchRequest],
        indices: list[int],
        all_candidates: list[list[GameMatchCandidate]],
    ) -> list[int]:
        """Search SteamGrid for ALL unmatched games (parallel with IGDB).

        Two purposes:
        1. Enrich existing IGDB candidates with SteamGrid artwork
        2. Create new candidates for games IGDB didn't find

        Runs per-index so it can enrich candidates from earlier phases.
        """
        if not self._steamgrid:
            return list(indices)

        still_unmatched: list[int] = []
        for idx in indices:
            req = requests[idx]
            try:
                results = await self._steamgrid.search_games(req.title)
                if not results:
                    still_unmatched.append(idx)
                    continue

                # Pick best match
                title_lower = req.title.lower()
                best = None
                for r in results:
                    r_name = (r.get("name") or "").lower()
                    if title_lower == r_name:
                        best = r
                        break
                if not best:
                    for r in results:
                        r_name = (r.get("name") or "").lower()
                        if title_lower in r_name or r_name in title_lower:
                            best = r
                            break
                if not best:
                    best = results[0]

                sg_name = best.get("name") or req.title
                sg_id = best.get("id")

                # Fetch rich artwork
                poster_url = None
                hero_url = None
                if sg_id:
                    try:
                        grids = await self._steamgrid.get_grids(int(sg_id), styles="alternate")
                        poster_url = grids[0].get("url") if grids else None
                        heroes = await self._steamgrid.get_heroes(int(sg_id))
                        hero_url = heroes[0].get("url") if heroes else None
                        logos = await self._steamgrid.get_logos(int(sg_id), styles="official")
                        logos[0].get("url") if logos else None
                    except Exception:
                        pass

                # Check if we already have an IGDB candidate for this game
                # Enrich existing candidates with SteamGrid artwork
                existing = all_candidates[idx]
                enriched = False
                for c in existing:
                    if c.poster_url or c.match_type == MatchType.IGDB_CROSSREF or c.match_type == MatchType.IGDB_SEARCH:
                        if not c.poster_url and poster_url:
                            c.poster_url = poster_url
                            enriched = True
                        if not c.backdrop_url and hero_url:
                            c.backdrop_url = hero_url
                            enriched = True

                if enriched:
                    # SteamGrid enriched existing candidate, no need for new one
                    still_unmatched.append(idx)
                    continue

                if not existing:
                    # No IGDB candidate found — seed from SteamGrid
                    new_id = gen_otix_id()
                    now = datetime.now(UTC)
                    sg_slug = sg_name.lower().strip()
                    sg_slug = re.sub(r"[^a-z0-9]+", "-", sg_slug).strip("-")[:200]
                    mi = MediaItem(
                        id=new_id,
                        title=sg_name,
                        slug=sg_slug,
                        media_type="game",
                        poster_url=poster_url,
                        backdrop_url=hero_url,
                        created_at=now,
                        updated_at=now,
                    )
                    self._session.add(mi)
                    from sqlalchemy.dialects.postgresql import insert as pg_insert

                    await self._session.execute(
                        pg_insert(ExternalID)
                        .values(
                            provider="steamgrid",
                            external_id=str(sg_id) if sg_id else new_id,
                            entity_id=new_id,
                            media_item_id=new_id,
                            entity_type="media_item",
                        )
                        .on_conflict_do_nothing(constraint="uq_external_id_provider_ext")
                    )
                    await self._session.flush()

                    all_candidates[idx].append(
                        GameMatchCandidate(
                            media_item_id=new_id,
                            title=sg_name,
                            poster_url=poster_url,
                            backdrop_url=hero_url,
                            confidence=0.70,
                            match_type=MatchType.IGDB_SEARCH,
                            needs_import=False,
                            provider_id=str(sg_id) if sg_id else None,
                            provider="steamgrid",
                        )
                    )
                else:
                    still_unmatched.append(idx)

            except Exception:
                logger.exception("steamgrid_phase_failed", title=req.title)
                still_unmatched.append(idx)

        return still_unmatched

    # ── Match proposals ────────────────────────────────────────────────────

    async def _create_match_proposal(
        self,
        req: GameMatchRequest,
        auto_match: GameMatchCandidate,
    ) -> str | None:
        """Create/upsert a match proposal. Returns 'approved' or 'pending'.

        Uses a separate session so the proposal survives any outer session
        rollback (e.g. from SteamGridDB UniqueViolationError poisoning).
        """
        from otix.infrastructure.database import get_session
        from otix.services.proposals_service import ProposalsService

        parts = req.query_id.split(":", 1)
        source = parts[0] if parts else "unknown"
        source_game_id = parts[1] if len(parts) > 1 else req.query_id

        confidence = auto_match.confidence
        match_type = (
            auto_match.match_type.value if hasattr(auto_match.match_type, "value") else str(auto_match.match_type)
        )

        payload = {
            "source": source,
            "source_game_id": source_game_id,
            "source_title": req.title,
            "developer": req.developer,
            "release_year": req.release_year,
            "poster_url": req.poster_url,
            "otix_media_id": auto_match.media_item_id,
            "otix_title": auto_match.title,
            "otix_poster_url": auto_match.poster_url,
            "otix_backdrop_url": auto_match.backdrop_url,
            "otix_release_year": auto_match.release_year,
            "otix_confidence": confidence,
            "match_type": match_type,
        }

        # Use a separate session so proposal + ExternalID creation commits
        # independently, surviving any rollback of the matcher's session.
        try:
            async for proposal_session in get_session():
                svc = ProposalsService(proposal_session)
                proposal = await svc.create(
                    proposal_type="match",
                    target_type="media_item",
                    target_id=auto_match.media_item_id,
                    payload=payload,
                    proposer=None,
                )
                logger.info(
                    "match_proposal_created",
                    title=req.title,
                    proposal_id=proposal.id,
                    status=proposal.status,
                )
                return proposal.status
        except Exception as e:
            logger.warning(
                "match_proposal_create_failed",
                title=req.title,
                error=str(e),
            )

        return None

    # ── IGDB seeding ───────────────────────────────────────────────────────

    async def _seed_game_from_igdb(self, raw: dict, igdb_id: int, media_type: str = "game") -> str:
        """Create a minimal MediaItem + ExternalID from IGDB data.

        Returns the new media_item_id so the candidate can reference it.
        If the IGDB ID is already mapped, returns the existing entity_id.
        """
        igdb_id_str = str(igdb_id)
        # Check for existing mapping (with entity_type filter)
        ext_result = await self._session.execute(
            select(ExternalID).where(
                ExternalID.provider == "igdb",
                ExternalID.external_id == igdb_id_str,
                ExternalID.entity_type == "media_item",
            )
        )
        existing = ext_result.scalars().first()
        if existing:
            eid = existing.entity_id or existing.media_item_id
            if eid:
                return eid

        title = raw.get("name") or "Unknown Game"
        poster_url = _igdb_cover_url(raw.get("cover"))
        release_date = None
        ts = raw.get("first_release_date")
        if isinstance(ts, int | float):
            try:
                from datetime import datetime as dt

                release_date = dt.fromtimestamp(float(ts))
            except (ValueError, OSError):
                pass

        new_id = gen_otix_id()
        now = datetime.now(UTC)
        slug = title.lower().strip()
        slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")[:200]

        # Cross-provider dedup: check if a game with this slug already
        # exists (e.g. imported from Steam / TMDB / other provider).
        existing_id = await self._session.scalar(
            select(MediaItem.id).where(
                MediaItem.slug == slug,
                MediaItem.media_type == media_type,
            ).limit(1)
        )
        if existing_id is not None:
            new_id = existing_id
        else:
            # Create minimal MediaItem
            mi = MediaItem(
                id=new_id,
                title=title,
                slug=slug,
                media_type=media_type,
                release_date=release_date,
                created_at=now,
                updated_at=now,
            )
            self._session.add(mi)
            # Seed the IGDB cover as a media_assets row; best-asset selection
            # is resolved at query time (asset_selection).
            if poster_url:
                await AssetPipeline(self._session).store(
                    new_id,
                    [RawAsset(asset_type="poster", url=poster_url, label="official", provider="igdb")],
                )

        # Create ExternalID mapping (igdb → media_item)
        # Use ON CONFLICT DO NOTHING — simulation or previous scan may have seeded already
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        await self._session.execute(
            pg_insert(ExternalID)
            .values(
                provider="igdb",
                external_id=igdb_id_str,
                entity_id=new_id,
                media_item_id=new_id,
                entity_type="media_item",
            )
            .on_conflict_do_nothing(constraint="uq_external_id_provider_ext")
        )

        # Fetch SteamGrid assets for rich hydration (posters, logos, heroes)
        if self._steamgrid:
            try:
                # Try lookup by platform ID first if raw has external IDs
                sg_game = None
                # Try Epic/Steam IDs from raw data
                if raw.get("external_games"):
                    for eg in raw["external_games"]:
                        if isinstance(eg, dict) and eg.get("category") == 1:  # Steam
                            sg_game = await self._steamgrid.get_game_by_platform_id("steam", str(eg["uid"]))
                            if sg_game:
                                break

                # Fallback: search by name
                if not sg_game:
                    sg_results = await self._steamgrid.search_games(title)
                    if sg_results:
                        # Pick best match by name similarity
                        title_lower = title.lower()
                        for r in sg_results:
                            r_name = (r.get("name") or "").lower()
                            if title_lower == r_name or title_lower in r_name:
                                sg_game = r
                                break
                        if not sg_game:
                            sg_game = sg_results[0]

                if sg_game:
                    sg_id = sg_game.get("id")
                    if sg_id:
                        # Store SteamGrid assets as media_assets rows; best-asset
                        # selection is resolved at query time (asset_selection).
                        assets: list[RawAsset] = []

                        # Grids (posters) — alternate + no_logo for clean look
                        grids = await self._steamgrid.get_grids(int(sg_id), styles="alternate,no_logo")
                        for grid in grids[:4]:
                            grid_url = grid.get("url")
                            if grid_url:
                                assets.append(RawAsset(
                                    asset_type="poster",
                                    url=str(grid_url),
                                    label=_GRID_LABELS.get(grid.get("style")),
                                    provider="steamgrid",
                                ))

                        # Logos — official style
                        logos = await self._steamgrid.get_logos(int(sg_id), styles="official")
                        for logo in logos[:4]:
                            logo_url = logo.get("url")
                            if logo_url:
                                assets.append(RawAsset(
                                    asset_type="logo",
                                    url=str(logo_url),
                                    label="multicolor",
                                    provider="steamgrid",
                                ))

                        # Heroes (backdrops)
                        heroes = await self._steamgrid.get_heroes(int(sg_id))
                        for hero in heroes[:4]:
                            hero_url = hero.get("url")
                            if hero_url:
                                assets.append(RawAsset(
                                    asset_type="backdrop",
                                    url=str(hero_url),
                                    label="material",
                                    provider="steamgrid",
                                ))

                        if assets:
                            await AssetPipeline(self._session).store(new_id, assets)
            except Exception:
                logger.warning("steamgrid_asset_fetch_failed", title=title)

        logger.info("seeded_game_from_igdb", igdb_id=igdb_id, otix_id=new_id, title=title)
        return new_id

    # ── DB helpers ─────────────────────────────────────────────────────────

    async def _batch_fetch_developers(self, media_item_ids: list[str]) -> dict[str, list[str]]:
        """Return {media_item_id: [dev_or_publisher_name, ...]}."""
        if not media_item_ids:
            return {}
        rows = await self._session.execute(
            select(MediaItem)
            .options(selectinload(MediaItem.involved_companies).joinedload(InvolvedCompany.company))
            .where(MediaItem.id.in_(media_item_ids))
        )
        result: dict[str, list[str]] = {}
        for mi in rows.unique().scalars().all():
            names: list[str] = []
            for ic in mi.involved_companies:
                if ic.developer or ic.publisher:
                    names.append(ic.company.name.lower())
            if names:
                result[mi.id] = names
        return result

    async def _fetch_media_item(self, entity_id: str) -> MediaItem | None:
        if not entity_id:
            return None
        mi = await self._session.get(MediaItem, entity_id)
        if mi is not None:
            await enrich_items_with_assets(self._session, [mi], redis=self._redis)
        return mi

    async def _fetch_media_items(self, entity_ids: list[str]) -> dict[str, MediaItem]:
        if not entity_ids:
            return {}
        rows = await self._session.execute(
            select(MediaItem).where(MediaItem.id.in_(entity_ids)),
        )
        items = list(rows.scalars().all())
        await enrich_items_with_assets(self._session, items, redis=self._redis)
        return {mi.id: mi for mi in items}


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


def _extract_numbers(title: str) -> list[int]:
    """Extract all integer numbers and roman numerals from a title.

    Returns numbers in title order (not sorted).
    Roman numerals I-XIV are converted to integers.
    """
    words = title.lower().split()
    numbers: list[int] = []
    roman_map = {
        "i": 1,
        "ii": 2,
        "iii": 3,
        "iv": 4,
        "v": 5,
        "vi": 6,
        "vii": 7,
        "viii": 8,
        "ix": 9,
        "x": 10,
        "xi": 11,
        "xii": 12,
        "xiii": 13,
        "xiv": 14,
    }
    for w in words:
        # Strip trailing punctuation (colons, periods, etc.)
        stripped = w.strip(":;,.!?()[]{}'\"")
        if stripped in roman_map:
            numbers.append(roman_map[stripped])
            continue
        # Try parsing as integer
        try:
            numbers.append(int(stripped))
        except ValueError:
            continue
    return numbers


def _different_franchise_entry(req_title: str, candidate_title: str) -> bool:
    """Detect when two titles share a base name but have DIFFERENT numbers.

    This means they're different entries in the same franchise (sequels),
    NOT editions/variants of the same game.

    Examples:
        "Borderlands 3" vs "Borderlands 2" → True (different entry)
        "Far Cry 5" vs "Far Cry 4" → True
        "Civilization VI" vs "Civilization V" → True
        "Borderlands 3" vs "Borderlands 3" → False (same number)
        "The Witcher 3" vs "The Witcher 3: Wild Hunt" → False (same number)
        "Control" vs "Control Ultimate Edition" → False (only one has number)
    """
    req_nums = _extract_numbers(req_title)
    cand_nums = _extract_numbers(candidate_title)

    # If neither has numbers, not a franchise conflict
    if not req_nums and not cand_nums:
        return False

    # If only one has numbers, not a franchise conflict (could be edition)
    if not req_nums or not cand_nums:
        return False

    # Compare the FIRST number in each title (usually the entry number)
    # If they differ, these are different franchise entries
    if req_nums[0] != cand_nums[0]:
        return True

    # Same first number — could be same game (editions, subtitles)
    return False


def _titles_compatible(req_title: str, candidate_title: str) -> bool:
    """Reject matches where the first word differs, or the length ratio is extreme.

    - Both titles must share the first word (prevents "Alien Isolation" matching "Isolation")
    - Exception: edition/DLC suffixes allowed if titles share the first word
    - Length ratio must not exceed 2.5x unless one is an edition
    - Reject franchise entries with different numbers (Borderlands 3 ≠ Borderlands 2)
    """
    req_words = req_title.lower().split()
    cand_words = candidate_title.lower().split()
    if not req_words or not cand_words:
        return False

    # First word must match
    req_first = req_words[0]
    cand_first = cand_words[0]
    # ── Single-word title guards ──
    if len(req_words) == 1:
        # Query is a single word → candidate must match exactly OR only add edition markers
        if len(cand_words) > 1:
            # "Control" matching "Control Resonant" — extra words must be edition markers
            extra_words = set(cand_words[1:])
            edition_words = {
                "edition",
                "deluxe",
                "goty",
                "ultimate",
                "complete",
                "definitive",
                "enhanced",
                "remastered",
                "collector",
                "pack",
                "bundle",
                "season",
                "pass",
                "dlc",
                "expansion",
                "director",
                "cut",
                "hd",
                "redux",
                "anniversary",
                "special",
                "gold",
                "platinum",
            }
            if not extra_words.issubset(edition_words):
                return False
    elif len(cand_words) == 1:
        # Candidate is single word, query has more — same check reversed
        extra_words = set(req_words[1:])
        edition_words = {
            "edition",
            "deluxe",
            "goty",
            "ultimate",
            "complete",
            "definitive",
            "enhanced",
            "remastered",
            "collector",
            "pack",
            "bundle",
            "season",
            "pass",
            "dlc",
            "expansion",
            "director",
            "cut",
            "hd",
            "redux",
            "anniversary",
            "special",
            "gold",
            "platinum",
        }
        if not extra_words.issubset(edition_words):
            return False

    both_single = len(req_words) == 1 and len(cand_words) == 1
    if both_single:
        # Single-word titles: require exact match, no substring (doom ≠ doomsday)
        if req_first != cand_first:
            return False
    elif req_first != cand_first:
        # Multi-word: allow first-word containment only for "The"/"A" prefixes
        if req_first in ("the", "a") and len(req_words) > 1 and req_words[1] == cand_first:
            pass
        elif cand_first in ("the", "a") and len(cand_words) > 1 and cand_words[1] == req_first:
            pass
        else:
            return False

    # ── Franchise entry check: different numbers = different games ──
    if _different_franchise_entry(req_title, candidate_title):
        return False

    # Length ratio check: allow up to 3x for editions, 2x otherwise
    len_ratio = max(len(req_words), len(cand_words)) / min(len(req_words), len(cand_words))
    if len_ratio > 3.0:
        return False
    if len_ratio > 2.0:
        # Only allow large length differences if edition/DLC keywords present
        longer_title = " ".join(req_words if len(req_words) > len(cand_words) else cand_words).lower()
        edition_markers = (
            "edition",
            "deluxe",
            "goty",
            "game of the year",
            "remastered",
            "complete",
            "definitive",
            "enhanced",
            "ultimate",
            "collector",
            "season pass",
            "dlc",
            "expansion",
            "pack",
            "bundle",
        )
        if not any(marker in longer_title for marker in edition_markers):
            return False

    return True


def _year_proximity_bonus(request_year: int | None, media_item: object) -> float:
    """Return 0.0–0.03 bonus based on release year proximity (±1 year = 0.03, ±2 = 0.02, ±3 = 0.01)."""
    if request_year is None:
        return 0.0
    mi_year = _release_year_from_date(getattr(media_item, "release_date", None))
    if mi_year is None:
        return 0.0
    diff = abs(request_year - mi_year)
    if diff <= 1:
        return 0.03
    if diff <= 2:
        return 0.02
    if diff <= 3:
        return 0.01
    return 0.0


def _developer_overlap(
    request_dev: str | None,
    company_names: list[str] | None,
) -> bool:
    """Check if the request developer matches any company name from the media item."""
    if not request_dev or not company_names:
        return False
    dev_lower = request_dev.lower().strip()
    for name in company_names:
        if dev_lower == name or dev_lower in name or name in dev_lower:
            return True
    return False
