"""Sync port of the legacy IGDB ``GameMatcher`` multi-phase pipeline.

Mirrors ``backend/otix/services/game_matcher.py`` (sync, ORM): a store
free-game / library reference is resolved to an Otix :class:`MediaItem` in four
phases, each only processing references the previous phase left unmatched:

1. **Direct** — an ``ExternalID`` row (provider+external_id) already maps the
   reference to a catalog item (confidence 0.90–1.0 by ``confirmed_by`` count).
2. **Otix catalog** — exact normalized-title key match (0.95+) then an OR'd
   ILIKE substring pass (0.75–0.88). Trigram similarity is deferred (no
   pgvector extension requirement here).
3. **IGDB** — external-id cross-reference (Steam/Epic → IGDB ``external_games``,
   seeding new titles) then IGDB relevance/name title search for stragglers.
4. **Assemble** — dedupe by media item, rank by confidence, decide auto-match.

Auto-match rules (legacy verbatim): DIRECT always; ``needs_import`` only at
confidence ≥ 0.90 for an exact IGDB title hit; confidence ≥ 0.95; confidence ≥
0.85 with a single candidate or a ≥ 0.10 gap to second place.

SteamGridDB artwork, Redis rate limiting, match proposals and celery-backed
full hydration stay deferred (see increment-25/26 notes in ARCHITECTURE.md).
"""

from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from django.utils import timezone as dj_timezone
from django.utils.text import slugify

from apps.media.models import ExternalID, Game, MediaAsset, MediaItem
from apps.media.services.catalog import attach_media_urls
from apps.media.services.igdb import (
    _PLATFORM_NORMALIZATION as PLATFORM_NORMALIZATION,
)
from apps.media.services.igdb import (
    IGDBProvider,
    configured,
    cover_url,
    release_year_from_ts,
)

logger = logging.getLogger(__name__)

_MATCH_DIRECT = "direct"
_MATCH_EXACT_TITLE = "exact_title"
_MATCH_ILIKE = "ilike"
_MATCH_IGDB_CROSSREF = "igdb_crossref"
_MATCH_IGDB_SEARCH = "igdb_search"
_MATCH_IGDB_FUZZY = "igdb_fuzzy"

# Rich search shape the matcher asks IGDB for (adds involved companies so the
# developer-overlap scorer can run; not the deferred full GAME_FIELDS fetch).
IGDB_SEARCH_FIELDS = (
    "id,name,slug,cover.image_id,first_release_date,platforms.name,"
    "involved_companies.company.name"
)
IGDB_SEARCH_LIMIT = 20


# ── Request / candidate model (datalasses, not ORM) ────────────────────────


@dataclass
class ExternalIDRef:
    """A provider-assigned id on a match request (source mirrors the store)."""

    source: str
    id: str


@dataclass
class MatchRequest:
    """A single game to resolve (title + optional store external ids)."""

    title: str
    external_ids: list[ExternalIDRef] | None = None
    query_id: str = ""
    developer: str | None = None
    platforms: list[str] | None = None
    release_year: int | None = None
    media_type: str = "game"


@dataclass
class MatchCandidate:
    """A single match candidate for a game request."""

    title: str
    confidence: float
    match_type: str
    media_item_id: int | None = None
    poster_url: str | None = None
    backdrop_url: str | None = None
    release_year: int | None = None
    platforms: list[str] | None = None
    needs_import: bool = False
    provider_id: str | None = None
    provider: str | None = None


@dataclass
class MatchResult:
    """Per-request outcome: ranked candidates + optional auto-match."""

    query_id: str
    query_title: str
    candidates: list[MatchCandidate] = field(default_factory=list)
    auto_match: MatchCandidate | None = None


# ── Pure title-comparison helpers (ported verbatim from legacy) ────────────


def _normalize_title(raw: str) -> str:
    """Normalize a game title for comparison.

    - Strip ™®© BEFORE NFKD decomposition (NFKD splits ™→TM)
    - Decompose unicode (accents → base) and strip combining marks
    - Remove punctuation so "Batman: Arkham" matches "Batman Arkham"
    - Collapse whitespace
    """
    clean = re.sub(r"[™®©]", "", raw)
    clean = unicodedata.normalize("NFKD", clean)
    clean = "".join(ch for ch in clean if unicodedata.category(ch) != "Mn")
    clean = re.sub(r"[,\.;!\?\(\)\[\]\{\}]", "", clean)
    return re.sub(r"\s+", " ", clean).strip()


def _strip_edition_markers(raw: str) -> str:
    """Strip trailing edition/re-release markers from a title.

    "Control Ultimate Edition" → "Control"; "Trackmania Starter Access" → "Trackmania".
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

    "3" → "N3", "III" → "N3", "40K" → "N40000", "40,000" → "N40000".
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

    "III" → "N3", "1-3" → "N1 N2 N3", "I•II•III" → "N1 N2 N3".
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
    """Replace numeral tokens so arabic, roman, range, and K-abbreviation collide.

    "Shenmue 3" == "Shenmue III" → both "shenmue N3".
    """
    out: list[str] = []
    for word in raw.split():
        stripped = word.strip(":;,.!?()[]{}'\"")
        marker = _canonical_numeral_seq(stripped)
        out.append(marker if marker is not None else word)
    return " ".join(out)


def _comparison_key(raw: str) -> str:
    """Aggressive cross-source title key for comparing titles."""
    t = _strip_edition_markers(raw)
    # Descriptive subtitle clauses IGDB omits from canonical titles.
    t = re.sub(r"\s+(?:Starring|Featuring)\s+.*$", "", t, flags=re.IGNORECASE)
    t = _canonical_numerals(t)
    t = _normalize_title(t)
    t = re.sub(r"[•·*]", " ", t)
    t = re.sub(r"\s*[-–—]\s*", " ", t)
    t = t.replace(":", "")
    return re.sub(r"\s+", " ", t).strip().lower()


def _igdb_search_query(raw: str) -> str:
    """Build an IGDB-friendly search string from a raw store title."""
    t = re.sub(r"[™®©]", "", raw)
    t = _strip_edition_markers(t)
    t = re.sub(r"\s*\([^)]*\)\s*$", "", t).strip()
    t = re.sub(r"\s+(?:Starring|Featuring)\s+.*$", "", t, flags=re.IGNORECASE).strip()
    return t or raw


def _ts_to_date(ts: Any) -> date | None:
    """Convert an IGDB unix-seconds timestamp to a UTC ``date``."""
    if isinstance(ts, (int, float)):
        try:
            return datetime.fromtimestamp(float(ts), tz=UTC).date()
        except (ValueError, OSError, OverflowError):
            return None
    return None


def _release_year_from_date(d: Any) -> int | None:
    if d is None:
        return None
    if hasattr(d, "year"):
        return d.year
    return None


def _extract_numbers(title: str) -> list[int]:
    """Extract integer numbers and roman numerals (I–XX) from a title, in order."""
    words = title.lower().split()
    numbers: list[int] = []
    for w in words:
        stripped = w.strip(":;,.!?()[]{}'\"")
        if stripped in _ROMAN_NUMERALS:
            numbers.append(_ROMAN_NUMERALS[stripped])
            continue
        try:
            numbers.append(int(stripped))
        except ValueError:
            continue
    return numbers


def _different_franchise_entry(req_title: str, candidate_title: str) -> bool:
    """Two titles share a base name but carry DIFFERENT entry numbers."""
    req_nums = _extract_numbers(req_title)
    cand_nums = _extract_numbers(candidate_title)
    if not req_nums or not cand_nums:
        return False
    return req_nums[0] != cand_nums[0]


_EDITION_WORDS = {
    "edition", "deluxe", "goty", "ultimate", "complete", "definitive", "enhanced",
    "remastered", "collector", "pack", "bundle", "season", "pass", "dlc",
    "expansion", "director", "cut", "hd", "redux", "anniversary", "special",
    "gold", "platinum",
}


def _titles_compatible(req_title: str, candidate_title: str) -> bool:
    """Reject fuzzy matches with differing first words or extreme length gaps."""
    req_words = req_title.lower().split()
    cand_words = candidate_title.lower().split()
    if not req_words or not cand_words:
        return False
    req_first, cand_first = req_words[0], cand_words[0]

    single = len(req_words) == 1 or len(cand_words) == 1
    if single:
        one, other = (cand_words, req_words) if len(req_words) == 1 else (req_words, cand_words)
        if len(one) == 1 and len(other) > 1 and not set(other[1:]).issubset(_EDITION_WORDS):
            return False

    both_single = len(req_words) == 1 and len(cand_words) == 1
    if both_single:
        if req_first != cand_first:
            return False
    elif req_first != cand_first:
        if req_first in ("the", "a") and len(req_words) > 1 and req_words[1] == cand_first:
            pass
        elif cand_first in ("the", "a") and len(cand_words) > 1 and cand_words[1] == req_first:
            pass
        else:
            return False

    if _different_franchise_entry(req_title, candidate_title):
        return False

    len_ratio = max(len(req_words), len(cand_words)) / min(len(req_words), len(cand_words))
    if len_ratio > 3.0:
        return False
    if len_ratio > 2.0:
        longer = " ".join(req_words if len(req_words) > len(cand_words) else cand_words)
        markers = (
            "edition", "deluxe", "goty", "game of the year", "remastered", "complete",
            "definitive", "enhanced", "ultimate", "collector", "season pass", "dlc",
            "expansion", "pack", "bundle",
        )
        if not any(marker in longer for marker in markers):
            return False
    return True


def _year_proximity_bonus(request_year: int | None, media_item: Any) -> float:
    """0.0–0.03 bonus: ±1y = 0.03, ±2y = 0.02, ±3y = 0.01."""
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


def _igdb_platform_slugs(raw: list[Any]) -> set[str]:
    """Normalized platform slugs for a raw IGDB ``platforms`` list."""
    out: set[str] = set()
    for p in raw or []:
        if not isinstance(p, dict):
            continue
        name = p.get("name")
        if isinstance(name, str) and name:
            out.add(PLATFORM_NORMALIZATION.get(name, name.lower()))
    return out


def _media_content_type() -> ContentType:
    return ContentType.objects.get_for_model(MediaItem)


def _upsert_external(
    content_type, object_id: int, provider: str, external_id: str, media_type: str
) -> None:
    """Create-or-update one ``ExternalID`` row keyed by its natural key."""
    row, created = ExternalID.objects.get_or_create(
        content_type=content_type,
        provider=provider,
        external_id=external_id,
        media_type=media_type,
        defaults={"object_id": object_id},
    )
    if not created and row.object_id != object_id:
        row.object_id = object_id
        row.save(update_fields=("object_id", "updated_at"))


def _upsert_poster_asset(media: MediaItem, url: str) -> None:
    """Store the IGDB cover as the best-scoring poster asset for ``media``."""
    MediaAsset.objects.get_or_create(
        media_item=media,
        asset_type="poster",
        url=url,
        defaults={"label": "official", "provider": "igdb", "score": 100},
    )


# ── Matcher ────────────────────────────────────────────────────────────────


class GameMatcher:
    """Multi-phase game matcher (sync port). See module docstring for phases."""

    def __init__(self) -> None:
        self._provider: IGDBProvider | None = None

    def _igdb(self) -> IGDBProvider:
        if self._provider is None:
            self._provider = IGDBProvider()
        return self._provider

    # ── Public API ─────────────────────────────────────────────────────────

    def match_single(self, request: MatchRequest) -> MatchResult:
        return self.match_batch([request])[0]

    def match_batch(self, requests: list[MatchRequest]) -> list[MatchResult]:
        """Run all four phases; return one ``MatchResult`` per request."""
        n = len(requests)
        all_candidates: list[list[MatchCandidate]] = [[] for _ in range(n)]
        unmatched = self._phase1_direct(requests, list(range(n)), all_candidates)
        if unmatched:
            unmatched = self._phase2_otix(requests, unmatched, all_candidates)
        if unmatched:
            self._phase3_igdb(requests, unmatched, all_candidates)
        return self._phase4_assemble(requests, all_candidates)

    # ── Phase 1: Direct external-ID resolution ─────────────────────────────

    def _phase1_direct(
        self,
        requests: list[MatchRequest],
        indices: list[int],
        all_candidates: list[list[MatchCandidate]],
    ) -> list[int]:
        source_ids: dict[str, dict[str, list[int]]] = {}
        for idx in indices:
            for ref in requests[idx].external_ids or []:
                source_ids.setdefault(ref.source, {}).setdefault(ref.id, []).append(idx)
        if not source_ids:
            return list(indices)

        content_type = _media_content_type()
        for source, id_map in source_ids.items():
            rows = list(
                ExternalID.objects.filter(
                    content_type=content_type,
                    provider=source,
                    external_id__in=list(id_map),
                )
            )
            media_ids = {row.object_id for row in rows if row.object_id}
            items = {mi.id: mi for mi in MediaItem.objects.filter(id__in=media_ids)}
            attach_media_urls(list(items.values()))
            for ext_id, row_map in id_map.items():
                row = next((r for r in rows if r.external_id == ext_id and r.object_id), None)
                if row is None:
                    continue
                confirmed = len(row.confirmed_by or [])
                confidence = 1.0 if confirmed >= 3 else (0.98 if confirmed >= 1 else 0.90)
                media = items.get(row.object_id)
                for req_idx in row_map:
                    all_candidates[req_idx].append(
                        MatchCandidate(
                            media_item_id=row.object_id,
                            title=media.title if media else requests[req_idx].title,
                            poster_url=getattr(media, "poster_url", None),
                            backdrop_url=getattr(media, "backdrop_url", None),
                            release_year=(
                                _release_year_from_date(media.release_date) if media else None
                            ),
                            confidence=confidence,
                            match_type=_MATCH_DIRECT,
                        )
                    )

        return [
            idx
            for idx in indices
            if not any(c.match_type == _MATCH_DIRECT for c in all_candidates[idx])
        ]

    # ── Phase 2: Otix catalog search ───────────────────────────────────────

    def _phase2_otix(
        self,
        requests: list[MatchRequest],
        indices: list[int],
        all_candidates: list[list[MatchCandidate]],
    ) -> list[int]:
        unmatched = self._phase2a_exact(requests, indices, all_candidates)
        if unmatched:
            unmatched = self._phase2b_ilike(requests, unmatched, all_candidates)
        return unmatched

    def _phase2a_exact(
        self,
        requests: list[MatchRequest],
        indices: list[int],
        all_candidates: list[list[MatchCandidate]],
    ) -> list[int]:
        """Exact normalized-title key match against catalog games (0.95+)."""
        titles = {_comparison_key(requests[i].title): i for i in indices}
        if not titles:
            return list(indices)

        key_to_items: dict[str, list[MediaItem]] = {}
        for media in MediaItem.objects.filter(media_type="game").only(
            "id", "title", "release_date"
        ):
            key = _comparison_key(media.title)
            if key in titles:
                key_to_items.setdefault(key, []).append(media)

        matched_rows = [media for items in key_to_items.values() for media in items]
        attach_media_urls(matched_rows)
        matched: set[int] = set()
        for key, idx in titles.items():
            for media in key_to_items.get(key, []):
                year_bonus = _year_proximity_bonus(requests[idx].release_year, media)
                confidence = min(1.0, 0.95 + year_bonus)
                all_candidates[idx].append(
                    MatchCandidate(
                        media_item_id=media.id,
                        title=media.title,
                        poster_url=getattr(media, "poster_url", None),
                        backdrop_url=getattr(media, "backdrop_url", None),
                        release_year=_release_year_from_date(media.release_date),
                        confidence=confidence,
                        match_type=_MATCH_EXACT_TITLE,
                    )
                )
                matched.add(idx)
        return [i for i in indices if i not in matched]

    def _phase2b_ilike(
        self,
        requests: list[MatchRequest],
        indices: list[int],
        all_candidates: list[list[MatchCandidate]],
    ) -> list[int]:
        """OR'd ILIKE substring pass; 0.75–0.88 confidence."""
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

        clause = Q()
        for norm in idx_to_norm.values():
            clause |= Q(title__icontains=norm)
        catalog_items = list(MediaItem.objects.filter(media_type="game").filter(clause)[:500])
        attach_media_urls(catalog_items)

        # Pair each catalog item to the request it best overlaps (word-jaccard).
        item_matches: list[tuple[int, MediaItem, float]] = []
        for media in catalog_items:
            media_lower = media.title.lower()
            media_words = set(media_lower.split())
            for i, norm in idx_to_norm.items():
                norm_lower = norm.lower()
                if norm_lower not in media_lower and media_lower not in norm_lower:
                    continue
                req_words = set(norm_lower.split())
                shared = req_words & media_words
                union = req_words | media_words
                overlap = len(shared) / max(len(union), 1)
                if overlap < 0.4:
                    continue
                if not _titles_compatible(norm, media.title):
                    continue
                item_matches.append((i, media, overlap))

        item_matches.sort(key=lambda x: x[2], reverse=True)
        assigned: set[int] = set()
        best: dict[int, float] = {}
        for req_idx, media, _score in item_matches:
            if media.id in assigned:
                continue
            year_bonus = _year_proximity_bonus(requests[req_idx].release_year, media)
            confidence = min(0.88, 0.75 + year_bonus)
            if _different_franchise_entry(requests[req_idx].title, media.title):
                confidence = min(confidence, 0.70)
            all_candidates[req_idx].append(
                MatchCandidate(
                    media_item_id=media.id,
                    title=media.title,
                    poster_url=getattr(media, "poster_url", None),
                    release_year=_release_year_from_date(media.release_date),
                    confidence=confidence,
                    match_type=_MATCH_ILIKE,
                )
            )
            best[req_idx] = max(best.get(req_idx, 0.0), confidence)
            assigned.add(media.id)
        return [i for i in indices if best.get(i, 0.0) < 0.85]

    # ── Phase 3: IGDB provider search ──────────────────────────────────────

    def _phase3_igdb(
        self,
        requests: list[MatchRequest],
        indices: list[int],
        all_candidates: list[list[MatchCandidate]],
    ) -> None:
        if not configured():
            return
        provider = self._igdb()

        # 3a: external-id cross-reference (Epic + Steam).
        still = self._phase3a_igdb_crossref(requests, indices, all_candidates, provider)
        # 3b: title search for whatever 3a left unmatched.
        if still:
            self._phase3b_igdb_search(requests, still, all_candidates, provider)

    def _phase3a_igdb_crossref(
        self,
        requests: list[MatchRequest],
        indices: list[int],
        all_candidates: list[list[MatchCandidate]],
        provider: IGDBProvider,
    ) -> list[int]:
        epic_id_map: dict[str, int] = {}
        steam_id_map: dict[int, int] = {}
        for idx in indices:
            for ref in requests[idx].external_ids or []:
                if ref.source in ("epic", "epic_free") and ref.id:
                    epic_id_map[ref.id] = idx
                elif ref.source == "steam":
                    try:
                        steam_id_map[int(ref.id)] = idx
                    except (ValueError, TypeError):
                        pass

        matched: set[int] = set()
        if epic_id_map:
            try:
                epic_to_igdb = provider.lookup_epic_ids(list(epic_id_map))
            except Exception:
                logger.exception("IGDB Epic cross-ref failed")
                epic_to_igdb = {}
            for epic_id, igdb_id in epic_to_igdb.items():
                req_idx = epic_id_map.get(epic_id)
                if req_idx is None or req_idx in matched:
                    continue
                self._resolve_igdb_candidate(
                    requests[req_idx], igdb_id, all_candidates, req_idx, provider
                )
                matched.add(req_idx)

        if steam_id_map:
            try:
                steam_to_igdb = provider.lookup_steam_app_ids(list(steam_id_map))
            except Exception:
                logger.exception("IGDB Steam cross-ref failed")
                steam_to_igdb = {}
            for steam_id, igdb_id in steam_to_igdb.items():
                req_idx = steam_id_map.get(steam_id)
                if req_idx is None or req_idx in matched:
                    continue
                self._resolve_igdb_candidate(
                    requests[req_idx], igdb_id, all_candidates, req_idx, provider
                )
                matched.add(req_idx)

        return [i for i in indices if i not in matched]

    def _resolve_igdb_candidate(
        self,
        request: MatchRequest,
        igdb_id: int,
        all_candidates: list[list[MatchCandidate]],
        idx: int,
        provider: IGDBProvider,
    ) -> None:
        """If the IGDB game is already catalogued, reuse it; else seed a stub."""
        content_type = _media_content_type()
        igdb_id_str = str(igdb_id)
        existing = ExternalID.objects.filter(
            content_type=content_type, provider="igdb", external_id=igdb_id_str
        ).first()
        if existing is not None and existing.object_id:
            media = MediaItem.objects.filter(pk=existing.object_id).first()
            all_candidates[idx].append(
                MatchCandidate(
                    media_item_id=existing.object_id,
                    title=media.title if media else request.title,
                    poster_url=getattr(media, "poster_url", None),
                    backdrop_url=getattr(media, "backdrop_url", None),
                    release_year=_release_year_from_date(media.release_date) if media else None,
                    confidence=0.90,
                    match_type=_MATCH_IGDB_CROSSREF,
                )
            )
            return

        try:
            raw = provider.get_game(igdb_id, IGDB_SEARCH_FIELDS)
        except Exception:
            logger.exception("IGDB get_game failed", extra={"igdb_id": igdb_id})
            return
        if not raw:
            return

        media_id = self._seed_game_from_igdb(
            raw, igdb_id, request_external_ids=request.external_ids
        )
        all_candidates[idx].append(
            MatchCandidate(
                media_item_id=media_id,
                title=raw.get("name") or request.title,
                poster_url=cover_url(raw.get("cover")),
                release_year=release_year_from_ts(raw.get("first_release_date")),
                platforms=sorted(_igdb_platform_slugs(raw.get("platforms"))),
                confidence=0.90,
                match_type=_MATCH_IGDB_CROSSREF,
                provider="igdb",
                provider_id=igdb_id_str,
            )
        )

    def _phase3b_igdb_search(
        self,
        requests: list[MatchRequest],
        indices: list[int],
        all_candidates: list[list[MatchCandidate]],
        provider: IGDBProvider,
    ) -> None:
        """Title search for stragglers: exact-key hits seed, fuzzy hits linger."""
        results: dict[int, dict[str, Any]] = {}
        for idx in indices:
            result = self._igdb_search_result(provider, requests[idx])
            if result is not None:
                results[idx] = result
        if not results:
            return

        content_type = _media_content_type()
        id_to_indices: dict[str, list[int]] = {}
        for idx, result in results.items():
            id_to_indices.setdefault(result["igdb_id_str"], []).append(idx)
        ext_by_id = {
            str(row.external_id): row
            for row in ExternalID.objects.filter(
                content_type=content_type, provider="igdb", external_id__in=list(id_to_indices)
            )
        }

        for idx, result in results.items():
            igdb_id = result["igdb_id"]
            igdb_id_str = result["igdb_id_str"]
            is_exact = result["is_exact"]
            raw = result["best"]
            existing = ext_by_id.get(igdb_id_str)
            if existing is not None and existing.object_id:
                media = MediaItem.objects.filter(pk=existing.object_id).first()
                all_candidates[idx].append(
                    MatchCandidate(
                        media_item_id=existing.object_id,
                        title=media.title if media else result["title"],
                        poster_url=(
                            result["poster"]
                            if media is None
                            else getattr(media, "poster_url", None)
                        ),
                        release_year=result["release_year"],
                        platforms=result["platforms"],
                        confidence=0.90 if is_exact else 0.70,
                        match_type=_MATCH_IGDB_SEARCH if is_exact else _MATCH_IGDB_FUZZY,
                    )
                )
                continue
            media_id = self._seed_game_from_igdb(
                raw, igdb_id, request_external_ids=requests[idx].external_ids
            )
            all_candidates[idx].append(
                MatchCandidate(
                    media_item_id=media_id,
                    title=result["title"],
                    poster_url=result["poster"],
                    release_year=result["release_year"],
                    platforms=result["platforms"],
                    confidence=0.90 if is_exact else 0.70,
                    match_type=_MATCH_IGDB_SEARCH if is_exact else _MATCH_IGDB_FUZZY,
                    provider="igdb",
                    provider_id=igdb_id_str,
                )
            )

    def _igdb_search_result(
        self, provider: IGDBProvider, request: MatchRequest
    ) -> dict[str, Any] | None:
        """Best IGDB result for one title, or None; network-only."""
        query = _igdb_search_query(request.title)
        candidates = provider.search_games(
            query, limit=IGDB_SEARCH_LIMIT, fields=IGDB_SEARCH_FIELDS
        )
        if not candidates and ":" in query:
            short = query.split(":")[0].strip()
            if short and short != query:
                candidates = provider.search_games(
                    short, limit=IGDB_SEARCH_LIMIT, fields=IGDB_SEARCH_FIELDS
                )
        if not candidates:
            return None

        best = self._pick_best_igdb_match(candidates, request)
        if best is None and query:
            try:
                by_name = provider.search_games_by_name(
                    query, limit=IGDB_SEARCH_LIMIT, fields=IGDB_SEARCH_FIELDS
                )
                best = self._pick_best_igdb_match(by_name, request)
            except Exception:
                logger.exception("IGDB name search fallback failed")
        if best is None:
            return None

        return {
            "igdb_id": int(best["id"]),
            "igdb_id_str": str(best["id"]),
            "is_exact": self._is_exact_title_match(best, request),
            "best": best,
            "poster": cover_url(best.get("cover")),
            "platforms": sorted(_igdb_platform_slugs(best.get("platforms"))),
            "release_year": release_year_from_ts(best.get("first_release_date")),
            "title": best.get("name") or request.title,
        }

    @staticmethod
    def _is_exact_title_match(candidate: dict[str, Any], request: MatchRequest) -> bool:
        return _comparison_key(candidate.get("name") or "") == _comparison_key(request.title)

    @staticmethod
    def _pick_best_igdb_match(
        candidates: list[dict[str, Any]], request: MatchRequest
    ) -> dict[str, Any] | None:
        """Score + select the best IGDB candidate (rubric threshold: 60)."""
        threshold = 60
        target_lower = _comparison_key(request.title)
        target_platforms = set()
        for p in request.platforms or []:
            target_platforms.add(PLATFORM_NORMALIZATION.get(p, p.lower()))
        target_developer = (request.developer or "").lower().strip()

        best_score = 0
        best: dict[str, Any] | None = None
        for candidate in candidates:
            score = 0
            raw_name = (candidate.get("name") or "").strip()
            name_lower = _comparison_key(raw_name)
            if name_lower == target_lower:
                score += 100
            else:
                slug = _comparison_key(candidate.get("slug") or "")
                if slug == target_lower:
                    score += 90
                elif target_lower in name_lower or name_lower in target_lower:
                    score += 70

            if target_developer:
                for ic in candidate.get("involved_companies") or []:
                    if not isinstance(ic, dict):
                        continue
                    company = ic.get("company")
                    if not isinstance(company, dict):
                        continue
                    cname = (company.get("name") or "").lower().strip()
                    if cname == target_developer:
                        score += 20
                    elif target_developer in cname or cname in target_developer:
                        score += 10
                    break

            if target_platforms:
                overlap = target_platforms & _igdb_platform_slugs(candidate.get("platforms"))
                if overlap:
                    score += 15 * len(overlap)

            if request.release_year is not None:
                ts = candidate.get("first_release_date")
                if isinstance(ts, (int, float)):
                    year = release_year_from_ts(ts)
                    if year is not None and abs(year - request.release_year) <= 1:
                        score += 10

            if score > best_score or (
                score == best_score
                and best is not None
                and len(raw_name) < len((best.get("name") or "").strip())
            ):
                best_score = score
                best = candidate

        return best if best is not None and best_score >= threshold else None

    # ── Phase 4: Assemble, rank, auto-match ────────────────────────────────

    def _phase4_assemble(
        self,
        requests: list[MatchRequest],
        all_candidates: list[list[MatchCandidate]],
    ) -> list[MatchResult]:
        results: list[MatchResult] = []
        for i, req in enumerate(requests):
            raw = all_candidates[i]
            if not raw:
                results.append(MatchResult(query_id=req.query_id, query_title=req.title))
                continue

            # Dedupe by media item (keep the highest-confidence entry).
            seen: dict[str, MatchCandidate] = {}
            for candidate in raw:
                key = candidate.media_item_id or (
                    f"__import_{candidate.provider}_{candidate.provider_id}"
                )
                if key in seen:
                    if candidate.confidence > seen[key].confidence:
                        seen[key] = candidate
                else:
                    seen[key] = candidate

            eligible = [c for c in seen.values() if c.confidence >= 0.70]
            candidates = sorted(eligible, key=lambda c: c.confidence, reverse=True)
            results.append(
                MatchResult(
                    query_id=req.query_id,
                    query_title=req.title,
                    candidates=candidates,
                    auto_match=self._decide_auto_match(candidates),
                )
            )
        return results

    @staticmethod
    def _decide_auto_match(candidates: list[MatchCandidate]) -> MatchCandidate | None:
        if not candidates:
            return None
        best = candidates[0]
        if best.needs_import:
            if best.confidence >= 0.90 and best.match_type == _MATCH_IGDB_SEARCH:
                return best
            return None
        if best.match_type == _MATCH_DIRECT:
            return best
        if best.confidence >= 0.95:
            return best
        if best.confidence >= 0.85:
            if len(candidates) == 1:
                return best
            if best.confidence - candidates[1].confidence >= 0.10:
                return best
        return None

    # ── IGDB seeding / free-game hydration ─────────────────────────────────

    def _seed_game_from_igdb(
        self,
        raw: dict[str, Any],
        igdb_id: int,
        *,
        media_type: str = "game",
        request_external_ids: list[ExternalIDRef] | None = None,
    ) -> int:
        """Create a minimal MediaItem + Game + ExternalIDs (+ poster asset).

        Returns the media_item id; reuses an existing row when the IGDB id is
        already mapped or a same-slug catalog title exists (cross-provider dedup).
        """
        content_type = _media_content_type()
        igdb_id_str = str(igdb_id)
        existing_ext = ExternalID.objects.filter(
            content_type=content_type, provider="igdb", external_id=igdb_id_str
        ).first()
        if existing_ext is not None and existing_ext.object_id:
            return existing_ext.object_id

        title = (raw.get("name") or "Unknown Game").strip() or "Unknown Game"
        overview = raw.get("storyline") or raw.get("summary")
        poster_url = cover_url(raw.get("cover"))
        raw_slug = (raw.get("slug") or "").strip()
        base_slug = raw_slug if raw_slug else slugify(title)
        slug = re.sub(r"[^a-z0-9]+", "-", base_slug.lower()).strip("-")[:200] or slugify("game")
        release_date = _ts_to_date(raw.get("first_release_date"))

        media = MediaItem.objects.filter(media_type=media_type, slug=slug).first()
        if media is not None:
            media_id = media.pk
            if media.overview is None and overview:
                media.overview = overview
                media.save(update_fields=("overview", "updated_at"))
            Game.objects.get_or_create(media_item_id=media_id)
            if poster_url:
                _upsert_poster_asset(media, poster_url)
        else:
            media = MediaItem.objects.create(
                media_type=media_type,
                title=title,
                slug=slug,
                overview=overview,
                release_date=release_date,
                completeness_score=0.15,
                next_sync_at=dj_timezone.now(),
            )
            media_id = media.pk
            Game.objects.create(media_item_id=media_id)
            if poster_url:
                _upsert_poster_asset(media, poster_url)

        _upsert_external(content_type, media_id, "igdb", igdb_id_str, media_type)
        for ref in request_external_ids or []:
            src = getattr(ref, "source", None) or (ref["source"] if isinstance(ref, dict) else None)
            ext_value = getattr(ref, "id", None) or (ref["id"] if isinstance(ref, dict) else None)
            if src and ext_value is not None:
                _upsert_external(content_type, media_id, str(src), str(ext_value), media_type)
        logger.info(
            "seeded game from IGDB igdb_id=%s otix_id=%s title=%s", igdb_id, media_id, title
        )
        return media_id

    def hydrate_free_game(
        self,
        title: str,
        store: str,
        external_id: str,
        namespace: str | None = None,
    ) -> int | None:
        """Resolve a store free-game ref to a MediaItem, seeding from IGDB.

        Only exact matches are used — never fuzzy. Returns the media_item id,
        or None when IGDB is unconfigured / nothing exact matches.
        """
        if not configured():
            return None

        # Desktop aggregators send "namespace:offerId"; seeds store the bare
        # offerId — normalize before cross-referencing.
        offer_id = external_id
        if store == "epic" and ":" in external_id:
            _namespace, offer_id = external_id.split(":", 1)
            namespace = namespace or _namespace

        provider = self._igdb()
        igdb_id: int | None = None
        raw: dict[str, Any] | None = None

        if store == "epic" and offer_id:
            try:
                epic_to_igdb = provider.lookup_epic_ids([offer_id])
                igdb_id = epic_to_igdb.get(offer_id)
                if igdb_id is not None:
                    raw = provider.get_game(igdb_id, IGDB_SEARCH_FIELDS)
            except Exception:
                logger.exception("free game epic cross-ref failed", extra={"offer_id": offer_id})

        if igdb_id is None:
            try:
                candidates = provider.search_games_by_name(
                    _igdb_search_query(title), limit=IGDB_SEARCH_LIMIT, fields=IGDB_SEARCH_FIELDS
                )
            except Exception:
                logger.exception("free game igdb title search failed", extra={"title": title})
                candidates = []
            target = _comparison_key(title)
            for candidate in candidates:
                if _comparison_key(candidate.get("name") or "") == target:
                    igdb_id = candidate.get("id")
                    raw = candidate
                    break

        if igdb_id is None or raw is None:
            return None

        refs: list[ExternalIDRef] = [ExternalIDRef(source=store, id=external_id)]
        if store == "epic" and offer_id:
            refs.append(ExternalIDRef(source="epic", id=offer_id))
        if namespace:
            refs.append(ExternalIDRef(source="epic_namespace", id=namespace))
        return self._seed_game_from_igdb(raw, igdb_id, request_external_ids=refs)
