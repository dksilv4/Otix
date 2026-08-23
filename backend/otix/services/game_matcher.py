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
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import structlog
from redis.asyncio import Redis
from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from otix.domain.base import gen_otix_id
from otix.domain.company import InvolvedCompany
from otix.domain.media import ExternalID, Game, MatchSkip, MediaItem
from otix.providers.asset_pipeline import AssetPipeline, RawAsset
from otix.providers.igdb.client import GAME_FIELDS, IGDBProvider
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
    clean = re.sub(r"[,\.;!\?\(\)\[\]\{\}]", "", clean)
    # Collapse whitespace
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def _title_words(title: str) -> set[str]:
    """Return lowercase, normalized title words for loose matching."""
    norm = _normalize_title(title).lower()
    return set(norm.split())


# ── Cross-source title comparison (universal matching) ──────────────────────
#
# Store titles (Epic) and catalog/IGDB titles follow different conventions:
# trademark symbols, edition suffixes, roman-vs-arabic numerals, "40K"-style
# abbreviations, and hyphen-vs-colon subtitles. These helpers collapse those
# differences so a raw store title matches the canonical entry without a
# per-game curated alias list.


def _strip_edition_markers(raw: str) -> str:
    """Strip trailing edition/re-release markers from a title.

    "Batman: Arkham Asylum Game of the Year Edition" → "Batman: Arkham Asylum"
    "Control Ultimate Edition" → "Control"
    "The Witcher 3: Wild Hunt" → "The Witcher 3: Wild Hunt" (unchanged)
    "Trackmania Starter Access" → "Trackmania"
    """
    edition_phrase = (
        r"(?:(?:Game of the Year|GOTY|Complete|Enhanced|Deluxe|Definitive|Ultimate|"
        r"Collector'?s|Anniversary|Special|Standard|Gold|Celebration|Day One|"
        r"Digital Deluxe|Remastered)(?:\s+Edition)(?:\s+Pack)?)"
    )
    t = re.sub(
        r"\s*(?:[-–—:]?\s*)?(?:The\s+)?" + edition_phrase + r"\s*$",
        "",
        raw,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r"\s*(?:[-–—:]?\s*)?(?:The Final Cut|Legacy Mode|Re-Elected|Afterlife|Starter Access)\s*$",
        "",
        t,
        flags=re.IGNORECASE,
    )
    return t.strip()


_ROMAN_NUMERALS: dict[str, int] = {
    "i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7,
    "viii": 8, "ix": 9, "x": 10, "xi": 11, "xii": 12, "xiii": 13, "xiv": 14,
    "xv": 15, "xvi": 16, "xvii": 17, "xviii": 18, "xix": 19, "xx": 20,
}


def _canonical_numeral_token(token: str) -> str | None:
    """Return a canonical marker for a numeral token, else None.

    "3" → "N3", "III" → "N3", "40K" → "N40000", "40,000" → "N40000"
    """
    low = token.lower().replace(",", "")
    if not low:
        return None
    if low.endswith("k") and low[:-1].isdigit():
        return "N" + str(int(low[:-1]) * 1000)
    if low.isdigit():
        return "N" + str(int(low))
    if low in _ROMAN_NUMERALS:
        return "N" + str(_ROMAN_NUMERALS[low])
    return None


_NUM_RANGE_RE = re.compile(r"^(.*)\s*[-–—]\s*(.*)$")


def _canonical_numeral_seq(token: str) -> str | None:
    """Canonicalize a numeral, numeral-list, or numeral-range token.

    "III" → "N3", "1-3" → "N1 N2 N3", "I-III" → "N1 N2 N3",
    "I•II•III" → "N1 N2 N3", "40K" → "N40000".
    Returns None for non-numeric tokens so they pass through untouched.
    """
    low = token.lower().strip()
    if not low:
        return None
    parts = [p for p in re.split(r"[•·*]", low) if p]
    out: list[str] = []
    for part in parts:
        m = _NUM_RANGE_RE.match(part)
        if m:
            a, b = m.group(1).strip(), m.group(2).strip()
            av = _canonical_numeral_token(a)
            bv = _canonical_numeral_token(b)
            if av is not None and bv is not None:
                start, end = int(av[1:]), int(bv[1:])
                step = 1 if end >= start else -1
                out.extend(f"N{i}" for i in range(start, end + step, step))
                continue
        cv = _canonical_numeral_token(part)
        if cv is not None:
            out.append(cv)
        else:
            return None
    return " ".join(out) if out else None


def _canonical_numerals(raw: str) -> str:
    """Replace numeral tokens so arabic, roman, range, and K-abbreviation forms collide.

    "Shenmue 3" == "Shenmue III"                  → both "shenmue N3"
    "Tomb Raider I-III" == "Tomb Raider I•II•III" → both "tomb raider N1 N2 N3"
    "Warhammer 40K Speed Freeks" == "Warhammer 40,000: Speed Freeks"
    """
    out: list[str] = []
    for word in raw.split():
        stripped = word.strip(":;,.!?()[]{}'\"")
        marker = _canonical_numeral_seq(stripped)
        out.append(marker if marker is not None else word)
    return " ".join(out)


def _comparison_key(raw: str) -> str:
    """Aggressive cross-source title key for comparing titles.

    Extends _normalize_title with:
    - Edition/re-release markers stripped ("Game of the Year Edition", "Starter Access")
    - Numeral canonicalization ("Shenmue 3" == "Shenmue III", "40K" == "40,000")
    - Hyphen separators collapsed ("Brothers - A Tale" ~ "Brothers: A Tale of Two Sons")
    """
    t = _strip_edition_markers(raw)
    # Descriptive subtitle clauses IGDB omits ("Tomb Raider I-III Remastered
    # Starring Lara Croft") — drop so both sides compare on the base title.
    t = re.sub(r"\s+(?:Starring|Featuring)\s+.*$", "", t, flags=re.IGNORECASE)
    t = _canonical_numerals(t)
    t = _normalize_title(t)
    # Bullet/star separators ("I•II•III") delimit words where other stores use
    # hyphens/commas; collapse them the same way as separator hyphens below.
    t = re.sub(r"[•·*]", " ", t)
    # Separator hyphens ("Brothers - A Tale") delimit subtitle words where other
    # stores use ":". Collapsing them is symmetric on both sides of a comparison.
    t = re.sub(r"\s*[-–—]\s*", " ", t)
    # Colons delimit subtitles across stores; strip for key equality.
    t = t.replace(":", "")
    return re.sub(r"\s+", " ", t).strip().lower()


def _igdb_search_query(raw: str) -> str:
    """Build an IGDB-friendly search string from a raw store title.

    IGDB's search endpoint tokenizes the query itself, so only the markers that
    cause zero results are stripped: trademark symbols, edition suffixes, and
    trailing parentheticals ("Never Alone (Kisima Ingitchuna)"). Numeral and
    abbreviation variants ("III", "40,000") are left intact — IGDB resolves them.
    """
    t = re.sub(r"[™®©]", "", raw)
    t = _strip_edition_markers(t)
    t = re.sub(r"\s*\([^)]*\)\s*$", "", t).strip()
    # Trim descriptive subtitle clauses IGDB omits from canonical titles:
    # "Tomb Raider I-III Remastered Starring Lara Croft" → base title.
    t = re.sub(r"\s+(?:Starring|Featuring)\s+.*$", "", t, flags=re.IGNORECASE).strip()
    return t or raw


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

    # Search concurrency — the provider rate limiters (IGDB 4 RPS, SteamGrid
    # 2 RPS) serialize actual HTTP calls, so a small in-flight bound saturates
    # the quota while keeping the rate-limiter wait queue far under its 30s
    # timeout. The async session stays single-connection (no concurrent SQL).
    IGDB_SEARCH_CONCURRENCY = 8
    STEAMGRID_SEARCH_CONCURRENCY = 4
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
                            poster_url=mi.poster_url if mi and isinstance(getattr(mi, "poster_url", None), str) else None,
                            backdrop_url=mi.backdrop_url if mi and isinstance(getattr(mi, "backdrop_url", None), str) else None,
                            textless_poster_url=mi.textless_poster_url if mi and isinstance(getattr(mi, "textless_poster_url", None), str) else None,
                            logo_url=mi.logo_url if mi and isinstance(getattr(mi, "logo_url", None), str) else None,
                            icon_url=mi.icon_url if mi and isinstance(getattr(mi, "icon_url", None), str) else None,
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
                if not hasattr(proposal, "status") or not isinstance(getattr(proposal, "payload", None), dict):
                    continue
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
        titles = {_comparison_key(requests[i].title): i for i in indices}
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
                key = _comparison_key(mi.title)
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
        # Collect IDs by category mapping to request index
        epic_id_map: dict[str, int] = {}
        steam_id_map: dict[int, int] = {}

        for idx in indices:
            req = requests[idx]
            if not req.external_ids:
                continue
            for ref in req.external_ids:
                if ref.source in ("epic", "epic_free") and ref.id:
                    epic_id_map[ref.id] = idx
                elif ref.source == "steam" and ref.id:
                    try:
                        steam_id_map[int(ref.id)] = idx
                    except (ValueError, TypeError):
                        pass

        matched: set[int] = set()

        # Epic cross-ref (category 26)
        if epic_id_map:
            try:
                epic_to_igdb = await provider.lookup_epic_ids(list(epic_id_map.keys()))
            except Exception:
                logger.exception("IGDB Epic cross-ref failed")
                epic_to_igdb = {}

            for epic_id, igdb_id in epic_to_igdb.items():
                req_idx = epic_id_map.get(epic_id)
                if req_idx is None or req_idx in matched:
                    continue
                await self._resolve_igdb_candidate(requests[req_idx], igdb_id, all_candidates, req_idx, provider)
                matched.add(req_idx)

        # Steam cross-ref (category 1)
        if steam_id_map:
            try:
                steam_to_igdb = await provider.lookup_steam_app_ids(list(steam_id_map.keys()))
            except Exception:
                logger.exception("IGDB Steam cross-ref failed")
                steam_to_igdb = {}

            for steam_id, igdb_id in steam_to_igdb.items():
                req_idx = steam_id_map.get(steam_id)
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
        new_media_id = await self._seed_game_from_igdb(raw, igdb_id, request_external_ids=request.external_ids)

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

        Split into two stages so the network-bound searches run concurrently
        under the rate limiter, while every DB access stays on the single
        async session (which can't run concurrent queries):
          1. Concurrent IGDB searches → per-game best candidate (network only).
          2. Serial resolution: batched ExternalID lookup, then candidate
             assembly or seeding per game.
        """
        if not indices:
            return

        # Stage 1: concurrent network searches. The provider's Redis-backed
        # rate limiter serializes actual IGDB calls, so a small in-flight
        # bound saturates the 4 RPS quota while keeping waiters far under the
        # limiter's 30s timeout.
        sem = asyncio.Semaphore(self.IGDB_SEARCH_CONCURRENCY)

        async def search_one(idx: int) -> tuple[int, dict | None]:
            async with sem:
                try:
                    return idx, await self._igdb_search_result(provider, requests[idx])
                except Exception:
                    logger.exception("IGDB search failed", title=requests[idx].title)
                    return idx, None

        outcomes = await asyncio.gather(*(search_one(idx) for idx in indices))
        results = {idx: res for idx, res in outcomes if res}
        if not results:
            return

        try:
            # Stage 2: batched ExternalID lookup, then serial candidate
            # resolution. Guarded so a DB failure degrades to "no phase-3b
            # candidates" instead of aborting the whole batch.
            id_to_indices: dict[str, list[int]] = {}
            for idx, r in results.items():
                id_to_indices.setdefault(r["igdb_id_str"], []).append(idx)

            ext_rows = await self._session.execute(
                select(ExternalID).where(
                    ExternalID.provider == "igdb",
                    ExternalID.external_id.in_(list(id_to_indices)),
                )
            )
            ext_by_id: dict[str, ExternalID] = {}
            for row in ext_rows.scalars().all():
                ext_by_id.setdefault(str(row.external_id), row)
        except Exception:
            logger.exception("IGDB phase 3b ExternalID lookup failed")
            return

        for idx in indices:
            r = results.get(idx)
            if not r:
                continue
            try:
                igdb_id = r["igdb_id"]
                igdb_id_str = r["igdb_id_str"]
                is_exact = r["is_exact"]
                existing_ext = ext_by_id.get(igdb_id_str)
                if existing_ext:
                    entity_id = existing_ext.entity_id or existing_ext.media_item_id
                    if entity_id:
                        mi = await self._fetch_media_item(entity_id)
                        all_candidates[idx].append(
                            GameMatchCandidate(
                                media_item_id=entity_id,
                                title=mi.title if mi else r["title"],
                                poster_url=mi.poster_url if mi else r["poster"],
                                backdrop_url=mi.backdrop_url if mi else None,
                                release_year=_release_year_from_date(mi.release_date if mi else None) or r["release_year"],
                                platforms=r["platforms"],
                                confidence=0.90 if is_exact else 0.70,
                                match_type=MatchType.IGDB_SEARCH if is_exact else MatchType.IGDB_FUZZY,
                            )
                        )
                else:
                    # Not in catalog — seed from IGDB data
                    new_media_id = await self._seed_game_from_igdb(
                        r["best"], igdb_id, request_external_ids=requests[idx].external_ids
                    )
                    all_candidates[idx].append(
                        GameMatchCandidate(
                            media_item_id=new_media_id,
                            title=r["title"],
                            poster_url=r["poster"],
                            release_year=r["release_year"],
                            platforms=r["platforms"],
                            confidence=0.90 if is_exact else 0.70,
                            match_type=MatchType.IGDB_SEARCH if is_exact else MatchType.IGDB_FUZZY,
                            needs_import=False,
                            provider_id=igdb_id_str,
                            provider="igdb",
                        )
                    )
            except Exception:
                logger.exception("IGDB candidate resolve failed", title=requests[idx].title)

    async def _igdb_search_result(
        self,
        provider: IGDBProvider,
        request: GameMatchRequest,
    ) -> dict | None:
        """Search IGDB for one game; return best candidate + derived data.

        Network-only (no DB) so callers can run it concurrently. The caller
        owns the ExternalID lookup and candidate assembly (stage 2).
        """
        search_query = _igdb_search_query(request.title)
        candidates = await provider.search_games(
            search_query,
            limit=self.IGDB_SEARCH_LIMIT,
            fields=self.IGDB_SEARCH_FIELDS,
        )
        if not candidates:
            if ":" in search_query:
                short = search_query.split(":")[0].strip()
                if short and short != search_query:
                    candidates = await provider.search_games(
                        short,
                        limit=self.IGDB_SEARCH_LIMIT,
                        fields=self.IGDB_SEARCH_FIELDS,
                    )
            if not candidates:
                return None

        best = self._pick_best_igdb_match(candidates, request)

        # IGDB's relevance search can omit the exact-title game entirely
        # (common words like "for"/"the" get down-weighted — "For The King"
        # is absent from its top-50). Fall back to a name-substring filter,
        # which reliably returns the exact-title entry.
        if best is None and search_query:
            try:
                by_name = await provider.search_games_by_name(
                    search_query,
                    limit=self.IGDB_SEARCH_LIMIT,
                    fields=self.IGDB_SEARCH_FIELDS,
                )
                best = self._pick_best_igdb_match(by_name, request)
            except Exception:
                logger.exception("IGDB name search fallback failed")

        if best is None:
            return None

        igdb_id = best["id"]
        return {
            "igdb_id": igdb_id,
            "igdb_id_str": str(igdb_id),
            "is_exact": self._is_exact_title_match(best, request),
            "best": best,
            "poster": _igdb_cover_url(best.get("cover")),
            "platforms": _igdb_platforms(best.get("platforms") or []),
            "release_year": _parse_igdb_year(best.get("first_release_date")),
            "title": best.get("name") or request.title,
        }

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
        name = _comparison_key(candidate.get("name") or "")
        target = _comparison_key(request.title)
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
        target_lower = _comparison_key(request.title)
        target_platforms = {PLATFORM_NORMALIZATION.get(p, p.lower()) for p in (request.platforms or [])}
        target_developer = (request.developer or "").lower().strip()

        best_score = 0
        best_candidate: dict | None = None

        for c in candidates:
            score = 0
            raw_name = (c.get("name") or "").strip()
            name_lower = _comparison_key(raw_name)

            # Title scoring
            if name_lower == target_lower:
                score += 100
            else:
                slug = _comparison_key(c.get("slug") or "")
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

            if score > best_score or (
                # Tie-break toward the base title: edition/bundle variants
                # normalize to the same key as the base game, and the base is
                # always the shorter name.
                score == best_score
                and best_candidate is not None
                and len(raw_name) < len((best_candidate.get("name") or "").strip())
            ):
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

        Runs in two stages like phase 3b: the network work (search + artwork
        fetch) is concurrent under the rate limiter; candidate enrichment /
        seeding is serial so the async session never runs concurrent queries.
        """
        if not self._steamgrid:
            return list(indices)

        # Stage 1: concurrent SteamGrid network work (search + artwork fetch).
        sem = asyncio.Semaphore(self.STEAMGRID_SEARCH_CONCURRENCY)

        async def fetch_one(idx: int) -> tuple[int, dict | None]:
            req = requests[idx]
            async with sem:
                try:
                    return idx, await self._steamgrid_fetch_result(req)
                except Exception:
                    logger.exception("steamgrid_phase_failed", title=req.title)
                    return idx, None

        outcomes = await asyncio.gather(*(fetch_one(idx) for idx in indices))
        fetched = {idx: res for idx, res in outcomes if res}

        # Stage 2: serial enrichment / seeding (async session is single-connection).
        still_unmatched: list[int] = []
        for idx in indices:
            r = fetched.get(idx)
            if not r:
                still_unmatched.append(idx)
                continue
            try:
                sg_name = r["name"]
                sg_id = r["id"]
                poster_url = r["poster_url"]
                hero_url = r["hero_url"]

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
                    # No IGDB candidate found — surface a SteamGrid candidate for
                    # manual import instead of seeding a bare catalog stub. Seeding
                    # title-only MediaItems here left bare items (no Game row, no
                    # overview, no IGDB/Steam external id) that got title-matched
                    # on later scans and showed up as "matched but no data". With no
                    # media_item_id and needs_import=True it is never auto-matched
                    # or linked, and the catalog stays clean until a real import.
                    all_candidates[idx].append(
                        GameMatchCandidate(
                            media_item_id=None,
                            title=sg_name,
                            poster_url=poster_url,
                            backdrop_url=hero_url,
                            confidence=0.70,
                            match_type=MatchType.IGDB_SEARCH,
                            needs_import=True,
                            provider_id=str(sg_id) if sg_id else None,
                            provider="steamgrid",
                        )
                    )
                else:
                    still_unmatched.append(idx)
            except Exception:
                logger.exception("steamgrid_phase_failed", title=requests[idx].title)
                still_unmatched.append(idx)

        return still_unmatched

    async def _steamgrid_fetch_result(self, req: GameMatchRequest) -> dict | None:
        """Search SteamGrid for one game; fetch its artwork (network only).

        Returns the matched name/id plus poster/hero URLs, or None. Callers
        own the DB work (candidate enrichment / seeding).
        """
        results = await self._steamgrid.search_games(_igdb_search_query(req.title))
        if not results:
            return None

        title_lower = _comparison_key(req.title)
        best = None
        for r in results:
            r_name = _comparison_key(r.get("name") or "")
            if title_lower == r_name:
                best = r
                break
        if not best:
            for r in results:
                r_name = _comparison_key(r.get("name") or "")
                if title_lower in r_name or r_name in title_lower:
                    best = r
                    break
        if not best:
            best = results[0]

        sg_name = best.get("name") or req.title
        sg_id = best.get("id")

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

        return {"name": sg_name, "id": sg_id, "poster_url": poster_url, "hero_url": hero_url}

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
                # Link source external ID if available
                if source and source_game_id and auto_match.media_item_id:
                    try:
                        from otix.services.external_id_service import ExternalIDService

                        eid_svc = ExternalIDService(proposal_session)
                        await eid_svc.upsert(source, source_game_id, "media_item", auto_match.media_item_id)
                    except Exception as eid_err:
                        logger.warning("match_proposal_external_id_upsert_failed", error=str(eid_err))

                # Fire background full hydration across providers
                try:
                    from otix.infrastructure.celery import app as celery_app

                    if auto_match.provider == "igdb" and auto_match.provider_id:
                        celery_app.send_task("sync.igdb.game", args=[int(auto_match.provider_id)], kwargs={"force": True})
                    celery_app.send_task("sync.steamgrid.game_by_name", args=[auto_match.media_item_id], priority=5)
                except Exception:
                    pass

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

    async def _seed_game_from_igdb(
        self,
        raw: dict,
        igdb_id: int,
        media_type: str = "game",
        request_external_ids: list[object] | None = None,
    ) -> str:
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

        # Fetch the full IGDB record so the seeded item is complete (overview,
        # game_type, status, ...) instead of a bare stub that only fills in via
        # async background hydration. Falls back to the search result on failure.
        full = raw
        try:
            provider = IGDBProvider(self._redis)
            fetched = await provider.get_game(igdb_id, GAME_FIELDS)
            if fetched:
                full = fetched
        except Exception:
            logger.warning("igdb_seed_full_fetch_failed", igdb_id=igdb_id)

        from otix.providers.igdb.transformer import to_game

        game = to_game(full)
        item = game.media_item
        title = item.title or raw.get("name") or "Unknown Game"
        if not item.title:
            item.title = title
        if item.overview is None:
            item.overview = raw.get("storyline") or raw.get("summary")
        poster_url = _igdb_cover_url(full.get("cover"))

        new_id = gen_otix_id()
        now = datetime.now(UTC)
        slug = (item.slug or title.lower().strip())
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
            # The dedup hit may be a bare stub (e.g. a prior SteamGrid-only
            # seed with no Game row / overview). Fill in the missing overview
            # so it stops showing up as "matched but no data".
            if item.overview:
                bare = await self._session.get(MediaItem, new_id)
                if bare is not None and bare.overview is None:
                    bare.overview = item.overview
                    bare.updated_at = now
        else:
            item.id = new_id
            item.slug = slug
            item.media_type = media_type
            item.created_at = now
            item.updated_at = now
            self._session.add(item)
            # Seed the IGDB cover as a media_assets row; best-asset selection
            # is resolved at query time (asset_selection).
            if poster_url:
                await AssetPipeline(self._session).store(
                    new_id,
                    [RawAsset(asset_type="poster", url=poster_url, label="official", provider="igdb")],
                )

        # Ensure a Game row exists — legacy seeds created only a MediaItem, so
        # matched games had no game metadata until background hydration ran.
        existing_game = await self._session.get(Game, new_id)
        if existing_game is None:
            game.media_item = None  # media_item_id is set explicitly below
            game.media_item_id = new_id
            self._session.add(game)
        await self._session.flush()

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
            .on_conflict_do_nothing()
        )

        # Also map request external IDs (epic, epic_namespace, epic_free, steam, etc.)
        if request_external_ids:
            for ref in request_external_ids:
                src = getattr(ref, "source", None) or (ref.get("source") if isinstance(ref, dict) else None)
                ext_id_val = getattr(ref, "id", None) or (ref.get("id") if isinstance(ref, dict) else None)
                if src and ext_id_val:
                    await self._session.execute(
                        pg_insert(ExternalID)
                        .values(
                            provider=str(src),
                            external_id=str(ext_id_val),
                            entity_id=new_id,
                            media_item_id=new_id,
                            entity_type="media_item",
                        )
                        .on_conflict_do_nothing()
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

        # Enqueue full background hydration from IGDB & SteamGridDB
        try:
            from otix.infrastructure.celery import app as celery_app

            celery_app.send_task("sync.igdb.game", args=[igdb_id], kwargs={"force": True})
            celery_app.send_task("sync.steamgrid.game_by_name", args=[new_id], priority=5)
        except Exception:
            pass

        logger.info("seeded_game_from_igdb", igdb_id=igdb_id, otix_id=new_id, title=title)
        return new_id

    # ── Free game hydration ────────────────────────────────────────────────

    async def hydrate_free_game(
        self,
        title: str,
        store: str,
        external_id: str,
        namespace: str | None = None,
    ) -> str | None:
        """Resolve a store free-game ref to an Otix MediaItem, seeding it from
        IGDB when absent. Returns the media_item_id, or None if unresolvable.

        Only exact matches are used — never fuzzy. Resolution order:
          1. IGDB Epic external-ID cross-ref (category 26)
          2. Exact normalized-title match against IGDB
        """
        # The desktop aggregator sends "namespace:offerId" for Epic, but seeds
        # store the bare offerId — normalize before cross-referencing.
        offer_id = external_id
        if store == "epic" and ":" in external_id:
            _ns, offer_id = external_id.split(":", 1)
            namespace = namespace or _ns

        provider = IGDBProvider(self._redis)
        igdb_id: int | None = None
        raw: dict | None = None

        # 1) Epic external-ID cross-ref (authoritative when present).
        if store == "epic" and offer_id:
            try:
                epic_to_igdb = await provider.lookup_epic_ids([offer_id])
                igdb_id = epic_to_igdb.get(offer_id)
                if igdb_id is not None:
                    raw = await provider.get_game(igdb_id, self.IGDB_SEARCH_FIELDS)
            except Exception:
                logger.exception("hydrate_free_game epic cross-ref failed", offer_id=offer_id)

        # 2) Exact normalized-title match (never fuzzy).
        if igdb_id is None:
            try:
                candidates = await provider.search_games_by_name(
                    _igdb_search_query(title),
                    limit=self.IGDB_SEARCH_LIMIT,
                    fields=self.IGDB_SEARCH_FIELDS,
                )
            except Exception:
                logger.exception("hydrate_free_game igdb title search failed", title=title)
                candidates = []
            target = _comparison_key(title)
            for cand in candidates:
                if _comparison_key(cand.get("name") or "") == target:
                    igdb_id = cand.get("id")
                    raw = cand
                    break

        if igdb_id is None or raw is None:
            return None

        # Map the aggregated "namespace:offerId" AND the bare offerId so future
        # free-games/match lookups resolve directly.
        request_external_ids: list[dict[str, str]] = []
        if store:
            request_external_ids.append({"source": store, "id": external_id})
        if store == "epic" and offer_id:
            request_external_ids.append({"source": "epic", "id": offer_id})
        if namespace:
            request_external_ids.append({"source": "epic_namespace", "id": namespace})

        return await self._seed_game_from_igdb(raw, igdb_id, request_external_ids=request_external_ids)

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
