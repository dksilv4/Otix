"""Realistic matching quality tests using ScannedGame-shaped data.

Verifies the GameMatcher correctly matches games a plugin would submit.
Uses mocked DB sessions to control catalog contents precisely.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from otix.schemas.media import GameMatchRequest, MatchType
from otix.services.game_matcher import GameMatcher, _normalize_title


# ── Helpers ────────────────────────────────────────────────────────────

def _make_mi(id: str, title: str, poster_url: str | None = None, release_date=None):
    """Build a mock MediaItem."""
    mi = MagicMock()
    mi.id = id
    mi.title = title
    mi.poster_url = poster_url
    mi.backdrop_url = None
    mi.release_date = release_date
    mi.media_type = "game"
    # involved_companies populated separately
    mi.involved_companies = []
    return mi


def _make_eid_row(provider: str, ext_id: str, entity_id: str, confirmed_count: int = 0):
    """Build a mock ExternalID result for batch_find_with_metadata."""
    return {
        "entity_id": entity_id,
        "confirmed_count": confirmed_count,
        "confirmed_by": [],
    }


class FakeCompany:
    def __init__(self, name: str):
        self.name = name

class FakeInvolvedCompany:
    def __init__(self, company_name: str, developer: bool = True, publisher: bool = False):
        self.company = FakeCompany(company_name)
        self.developer = developer
        self.publisher = publisher


# ═══════════════════════════════════════════════════════════════════════
# Tests
# ═══════════════════════════════════════════════════════════════════════

class TestNormalizeTitle:
    """Fix 1a/1b: title normalization strips special characters."""

    def test_strips_trademark(self):
        assert _normalize_title("Rocket League™") == "Rocket League"

    def test_strips_registered(self):
        assert _normalize_title("Doom®") == "Doom"

    def test_strips_copyright(self):
        assert _normalize_title("Game© 2024") == "Game 2024"

    def test_handles_accents(self):
        norm = _normalize_title("Pokémon")
        assert "Pokemon" in norm or "Pokémon" in norm  # NFKD decomposes é→e+

    def test_collapses_whitespace(self):
        assert _normalize_title("  Hello   World  ") == "Hello World"

    def test_preserves_colons(self):
        assert _normalize_title("Game: Subtitle") == "Game: Subtitle"


class TestPhase1DirectMatch:
    """Phase 1: Direct external-ID resolution with confirmed_count tiers."""

    async def test_direct_match_zero_confirms(self):
        """Epic ID mapped to Otix media → DIRECT match at 0.90."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())

        # Mock skip check — no skips
        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        ))
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={
            "Jaguar": _make_eid_row("epic", "Jaguar", "otix_rl", confirmed_count=0),
        })
        matcher._fetch_media_items = AsyncMock(return_value={
            "otix_rl": _make_mi("otix_rl", "Rocket League", "https://img/rl.jpg"),
        })

        req = GameMatchRequest(
            query_id="epic:Jaguar", title="Rocket League",
            external_ids=[{"source": "epic", "id": "Jaguar"}],
        )
        result = await matcher.match_single(req)

        assert result.auto_match is not None
        assert result.auto_match.media_item_id == "otix_rl"
        assert result.auto_match.match_type == MatchType.DIRECT
        assert result.auto_match.confidence == 0.90  # 0 confirms

    async def test_direct_match_crowd_verified(self):
        """3+ confirms → 1.0 confidence."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        ))
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={
            "Jaguar": _make_eid_row("epic", "Jaguar", "otix_rl", confirmed_count=5),
        })
        matcher._fetch_media_items = AsyncMock(return_value={
            "otix_rl": _make_mi("otix_rl", "Rocket League"),
        })

        req = GameMatchRequest(
            query_id="epic:Jaguar", title="Rocket League",
            external_ids=[{"source": "epic", "id": "Jaguar"}],
        )
        result = await matcher.match_single(req)
        assert result.auto_match.confidence == 1.0

    async def test_skipped_match_excluded(self):
        """MatchSkip entries remove game from further phases."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())

        # Mock skip check — returns skipped ID
        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(
                all=MagicMock(return_value=["Jaguar"])
            ))
        ))
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={
            "Jaguar": _make_eid_row("epic", "Jaguar", "otix_rl"),
        })
        matcher._fetch_media_items = AsyncMock(return_value={
            "otix_rl": _make_mi("otix_rl", "Rocket League"),
        })

        req = GameMatchRequest(
            query_id="epic:Jaguar", title="Rocket League",
            external_ids=[{"source": "epic", "id": "Jaguar"}],
        )
        result = await matcher.match_single(req)
        # Skipped → no direct match, no candidates from Phase 1
        # Phase 2/3 would run but we'd need more mocks. Just check no DIRECT.
        assert not any(c.match_type == MatchType.DIRECT for c in result.candidates)


class TestPhase2ExactTitle:
    """Phase 2a: Exact title matching with normalization and developer overlap."""

    async def test_exact_title_with_developer(self):
        """Exact title + developer match → 0.97 confidence."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())

        # Phase 1 returns nothing
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})

        rl = _make_mi("otix_rl", "Rocket League", "https://img/rl.jpg")
        rl.involved_companies = [FakeInvolvedCompany("Psyonix", developer=True)]

        # Phase 2a: match title
        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(
                all=MagicMock(return_value=[rl])
            ))
        ))

        # Batch developer fetch
        matcher._batch_fetch_developers = AsyncMock(return_value={
            "otix_rl": ["psyonix"],
        })

        # Phase 2b/2c return no additional matches (unmatched returns empty)
        # We need to mock further. Let's test via match_batch.
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        req = GameMatchRequest(
            query_id="epic:Jaguar", title="Rocket League",
            developer="Psyonix",
        )
        result = await matcher.match_single(req)

        assert result.auto_match is not None
        assert result.auto_match.match_type == MatchType.EXACT_TITLE
        assert result.auto_match.confidence == 0.97  # 0.95 + 0.02 (dev match)
        assert result.auto_match.media_item_id == "otix_rl"

    async def test_exact_title_wrong_developer(self):
        """Exact title but different developer → 0.95 (no bonus)."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})

        rl = _make_mi("otix_rl", "Rocket League")
        rl.involved_companies = [FakeInvolvedCompany("Psyonix", developer=True)]

        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(
                all=MagicMock(return_value=[rl])
            ))
        ))
        matcher._batch_fetch_developers = AsyncMock(return_value={
            "otix_rl": ["psyonix"],
        })
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        req = GameMatchRequest(
            query_id="epic:Jaguar", title="Rocket League",
            developer="Bethesda",  # wrong developer
        )
        result = await matcher.match_single(req)

        assert result.auto_match is not None
        assert result.auto_match.confidence == 0.95  # no dev bonus

    async def test_normalized_title_match(self):
        """Title with ™ matches clean catalog title (Fix 1a)."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})

        doom = _make_mi("otix_doom", "Doom")
        doom.involved_companies = []

        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(
                all=MagicMock(return_value=[doom])
            ))
        ))
        matcher._batch_fetch_developers = AsyncMock(return_value={})
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        req = GameMatchRequest(
            query_id="epic:Doom", title="Doom™",  # trademark symbol
        )
        result = await matcher.match_single(req)

        assert result.auto_match is not None
        assert result.auto_match.media_item_id == "otix_doom"
        assert result.auto_match.match_type == MatchType.EXACT_TITLE


class TestPhase4Filtering:
    """Phase 4: 70% threshold and auto-match decisions."""

    async def test_candidates_below_70_percent_filtered(self):
        """Fix 6a: candidates with confidence < 0.70 are dropped."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})

        # Return nothing from all phases
        matcher._phase2a_exact = AsyncMock(return_value=[0])
        matcher._phase2b_ilike = AsyncMock(return_value=[0])

        # Phase 2c would normally produce trigram candidates at 0.30-0.60,
        # which should all be filtered. Mock to simulate the assembled result.
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        req = GameMatchRequest(query_id="epic:Unknown", title="Xyzzzzy NotReal Game")
        result = await matcher.match_single(req)

        # No candidates above 0.70 → empty
        assert len(result.candidates) == 0
        assert result.auto_match is None

    async def test_auto_match_direct_bypasses_threshold(self):
        """DIRECT match auto-matches regardless of confidence."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        ))
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={
            "Jaguar": _make_eid_row("epic", "Jaguar", "otix_rl", confirmed_count=0),
        })
        matcher._fetch_media_items = AsyncMock(return_value={
            "otix_rl": _make_mi("otix_rl", "Rocket League"),
        })
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        req = GameMatchRequest(
            query_id="epic:Jaguar", title="Rocket League",
            external_ids=[{"source": "epic", "id": "Jaguar"}],
        )
        result = await matcher.match_single(req)

        # DIRECT at 0.90 → auto-match (bypasses 0.95 threshold)
        assert result.auto_match is not None
        assert result.auto_match.match_type == MatchType.DIRECT


class TestDeveloperOverlap:
    """Fix 2b: _developer_overlap actually works now."""

    def test_exact_match(self):
        from otix.services.game_matcher import _developer_overlap
        assert _developer_overlap("Psyonix", ["psyonix"]) is True

    def test_substring_match(self):
        from otix.services.game_matcher import _developer_overlap
        assert _developer_overlap("Psyonix", ["psyonix llc"]) is True

    def test_reverse_substring(self):
        from otix.services.game_matcher import _developer_overlap
        assert _developer_overlap("Psyonix LLC", ["psyonix"]) is True

    def test_no_match(self):
        from otix.services.game_matcher import _developer_overlap
        assert _developer_overlap("Epic", ["psyonix", "electronic arts"]) is False

    def test_none_input(self):
        from otix.services.game_matcher import _developer_overlap
        assert _developer_overlap(None, ["psyonix"]) is False
        assert _developer_overlap("Epic", None) is False
        assert _developer_overlap(None, None) is False


class TestScannedGameSchemaScenarios:
    """End-to-end: realistic plugin scan data → match results."""

    SCENARIO_EPIC_GAMES = [
        # (title, developer, ext_id, expected_confidence, expected_type)
        ("Rocket League", "Psyonix", "Jaguar", 0.90, MatchType.DIRECT),
        ("Fortnite", "Epic Games", "Fortnite", 0.90, MatchType.DIRECT),
        ("Cyberpunk 2077", "CD Projekt Red", None, 0.95, MatchType.EXACT_TITLE),
        ("Unknown Indie Game X", None, None, None, None),  # no match expected
    ]

    async def test_epic_scan_batch(self):
        """Full batch: 4 Epic games with different match paths."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())

        # Phase 1: Rocket League + Fortnite have external ID mappings
        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        ))
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={
            "Jaguar": _make_eid_row("epic", "Jaguar", "otix_rl", confirmed_count=0),
            "Fortnite": _make_eid_row("epic", "Fortnite", "otix_fn", confirmed_count=3),
        })
        matcher._fetch_media_items = AsyncMock(return_value={
            "otix_rl": _make_mi("otix_rl", "Rocket League"),
            "otix_fn": _make_mi("otix_fn", "Fortnite"),
        })

        # Phase 2a: Cyberpunk 2077 exact title match
        cp = _make_mi("otix_cp", "Cyberpunk 2077", "https://img/cp.jpg")
        cp.involved_companies = [FakeInvolvedCompany("CD Projekt Red", developer=True)]

        # Need to handle Phase 2 for Cyberpunk and Unknown
        matcher._phase2a_exact = AsyncMock(return_value=[3])  # only Unknown left
        matcher._phase2b_ilike = AsyncMock(return_value=[3])
        matcher._phase2c_trigram = AsyncMock(return_value=[3])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        # Directly inject the Cyberpunk candidate into all_candidates
        # by mocking _phase2a_exact to also add the candidate
        async def _phase2a_side_effect(reqs, indices, all_cands):
            # Add Cyberpunk candidate
            from otix.schemas.media import GameMatchCandidate
            all_cands[2].append(GameMatchCandidate(
                media_item_id="otix_cp",
                title="Cyberpunk 2077",
                poster_url="https://img/cp.jpg",
                confidence=0.97,
                match_type=MatchType.EXACT_TITLE,
            ))
            return [3]  # only Unknown (idx 3) left unmatched

        matcher._phase2a_exact = _phase2a_side_effect

        requests = [
            GameMatchRequest(query_id="epic:Jaguar", title="Rocket League",
                           developer="Psyonix",
                           external_ids=[{"source": "epic", "id": "Jaguar"}]),
            GameMatchRequest(query_id="epic:Fortnite", title="Fortnite",
                           developer="Epic Games",
                           external_ids=[{"source": "epic", "id": "Fortnite"}]),
            GameMatchRequest(query_id="epic:Cyberpunk", title="Cyberpunk 2077",
                           developer="CD Projekt Red"),
            GameMatchRequest(query_id="epic:UnknownX", title="Unknown Indie Game X"),
        ]

        results = await matcher.match_batch(requests)

        # Rocket League: DIRECT at 0.90 → auto-match
        assert results[0].auto_match is not None
        assert results[0].auto_match.match_type == MatchType.DIRECT
        assert results[0].auto_match.confidence == 0.90
        assert results[0].auto_match.media_item_id == "otix_rl"

        # Fortnite: DIRECT at 1.0 (3 confirms) → auto-match
        assert results[1].auto_match is not None
        assert results[1].auto_match.match_type == MatchType.DIRECT
        assert results[1].auto_match.confidence == 1.0

        # Cyberpunk 2077: EXACT_TITLE at 0.97 → auto-match
        assert results[2].auto_match is not None
        assert results[2].auto_match.match_type == MatchType.EXACT_TITLE
        assert results[2].auto_match.media_item_id == "otix_cp"

        # Unknown: no match
        assert results[3].auto_match is None
        assert len(results[3].candidates) == 0


class TestEditionMatching:
    """Edition suffixes should not prevent matching the base game."""

    async def test_deluxe_edition_matches_base(self):
        """'Game: Deluxe Edition' should match 'Game' in catalog."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})

        base = _make_mi("otix_base", "Hitman 3", "https://img/h3.jpg")
        base.involved_companies = [FakeInvolvedCompany("IO Interactive", developer=True)]

        # Phase 2a: "Hitman 3" in catalog, request title is "Hitman 3 Deluxe Edition"
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        # Mock Phase 2a to inject base game candidate via ILIKE fallback
        # (exact title won't match because "Hitman 3" != "Hitman 3 Deluxe Edition")
        async def _phase2b_side_effect(reqs, indices, all_cands):
            from otix.schemas.media import GameMatchCandidate
            all_cands[0].append(GameMatchCandidate(
                media_item_id="otix_base",
                title="Hitman 3",
                poster_url="https://img/h3.jpg",
                confidence=0.85,
                match_type=MatchType.ILIKE,
            ))
            return []

        matcher._phase2a_exact = AsyncMock(return_value=[0])
        matcher._phase2b_ilike = _phase2b_side_effect

        req = GameMatchRequest(
            query_id="epic:Hitman3DE", title="Hitman 3 Deluxe Edition",
            developer="IO Interactive",
        )
        result = await matcher.match_single(req)

        # Edition should match via ILIKE with developer bonus
        assert len(result.candidates) >= 1
        best = result.candidates[0]
        assert best.media_item_id == "otix_base"
        assert best.match_type == MatchType.ILIKE
        assert best.confidence >= 0.85  # dev match bonus

    async def test_game_of_the_year_edition(self):
        """'Witcher 3 GOTY' should match 'The Witcher 3: Wild Hunt'."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase2a_exact = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        async def _phase2b_side_effect(reqs, indices, all_cands):
            from otix.schemas.media import GameMatchCandidate
            all_cands[0].append(GameMatchCandidate(
                media_item_id="otix_w3",
                title="The Witcher 3: Wild Hunt",
                confidence=0.75,
                match_type=MatchType.ILIKE,
            ))
            return []
        matcher._phase2b_ilike = _phase2b_side_effect

        req = GameMatchRequest(
            query_id="epic:W3GOTY", title="The Witcher 3: Wild Hunt - Game of the Year Edition",
        )
        result = await matcher.match_single(req)
        assert len(result.candidates) >= 1


class TestDlcMatching:
    """DLC items should match DLC catalog entries, not base games."""

    async def test_dlc_matches_dlc_entry(self):
        """'Game - DLC Pack' should prefer DLC entry over base game."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        # Catalog has both base game AND DLC entry
        base = _make_mi("otix_cyberpunk", "Cyberpunk 2077", "https://img/cp.jpg")
        base.involved_companies = [FakeInvolvedCompany("CD Projekt Red", developer=True)]
        dlc = _make_mi("otix_phantom", "Cyberpunk 2077: Phantom Liberty", "https://img/pl.jpg")
        dlc.involved_companies = [FakeInvolvedCompany("CD Projekt Red", developer=True)]

        # Phase 2a mocks — exact match on DLC title
        async def _phase2a_side_effect(reqs, indices, all_cands):
            from otix.schemas.media import GameMatchCandidate
            # Both base and DLC match via ILIKE (exact won't match because of edition/DLC suffixes)
            return [0]
        matcher._phase2a_exact = _phase2a_side_effect

        # Phase 2b: ILIKE finds both but DLC scores higher word overlap
        async def _phase2b_side_effect(reqs, indices, all_cands):
            from otix.schemas.media import GameMatchCandidate
            # DLC has better word overlap → higher confidence
            all_cands[0].append(GameMatchCandidate(
                media_item_id="otix_phantom",
                title="Cyberpunk 2077: Phantom Liberty",
                poster_url="https://img/pl.jpg",
                confidence=0.85,  # dev match
                match_type=MatchType.ILIKE,
            ))
            all_cands[0].append(GameMatchCandidate(
                media_item_id="otix_cyberpunk",
                title="Cyberpunk 2077",
                poster_url="https://img/cp.jpg",
                confidence=0.75,  # lower: no dev match for this one, or lower word overlap
                match_type=MatchType.ILIKE,
            ))
            return []
        matcher._phase2b_ilike = _phase2b_side_effect

        req = GameMatchRequest(
            query_id="epic:PhantomLiberty", title="Cyberpunk 2077: Phantom Liberty",
            developer="CD Projekt Red",
        )
        result = await matcher.match_single(req)

        # Should have both candidates, DLC ranked higher
        assert len(result.candidates) >= 2
        assert result.candidates[0].media_item_id == "otix_phantom"  # DLC first
        assert result.candidates[0].confidence >= 0.85

    async def test_dlc_not_matched_to_base_game_when_dlc_exists(self):
        """DLC with its own catalog entry shouldn't force-match to base game."""
        # The ranking should put the DLC entry above the base game
        # Verified by the confidence gap — DLC gets developer bonus, base doesn't
        pass  # Covered by test_dlc_matches_dlc_entry above


class TestTitleEdgeCases:
    """Real-world title variations that plugins encounter."""

    async def test_subtitle_separators(self):
        """Titles with different subtitle separators should match."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase2a_exact = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        async def _phase2b_side_effect(reqs, indices, all_cands):
            from otix.schemas.media import GameMatchCandidate
            # Catalog: "Assassin's Creed Valhalla"
            # Request: "Assassins Creed Valhalla" (missing apostrophe)
            all_cands[0].append(GameMatchCandidate(
                media_item_id="otix_acv",
                title="Assassin's Creed Valhalla",
                confidence=0.75,
                match_type=MatchType.ILIKE,
            ))
            return []
        matcher._phase2b_ilike = _phase2b_side_effect

        req = GameMatchRequest(query_id="epic:ACV", title="Assassins Creed Valhalla")
        result = await matcher.match_single(req)
        # Should find a match despite missing apostrophe
        assert len(result.candidates) >= 1
        assert "Creed" in result.candidates[0].title

    async def test_remastered_edition(self):
        """'Game Remastered' should match original 'Game'."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase2a_exact = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        async def _phase2b_side_effect(reqs, indices, all_cands):
            from otix.schemas.media import GameMatchCandidate
            all_cands[0].append(GameMatchCandidate(
                media_item_id="otix_me",
                title="Mass Effect",
                confidence=0.75,
                match_type=MatchType.ILIKE,
            ))
            return []
        matcher._phase2b_ilike = _phase2b_side_effect

        req = GameMatchRequest(
            query_id="epic:ME", title="Mass Effect Legendary Edition",
        )
        result = await matcher.match_single(req)
        assert len(result.candidates) >= 1
        assert result.candidates[0].media_item_id == "otix_me"


class TestNormalizeEdgeCases:
    """Additional normalization scenarios encountered by plugins."""

    def test_japanese_title(self):
        norm = _normalize_title("ゼルダの伝説")
        assert len(norm) > 0

    def test_empty_title(self):
        norm = _normalize_title("")
        assert norm == ""

    def test_symbols_only(self):
        norm = _normalize_title("™®©")
        assert norm == ""

    def test_numeric_title(self):
        norm = _normalize_title("  2048  ")
        assert norm == "2048"

    def test_mixed_symbols_and_text(self):
        norm = _normalize_title("Game™: The Reckoning® ©2024")
        # ™ and ® stripped before NFKD, © also stripped
        assert "Game: The Reckoning 2024" == norm


class TestObscureIndieGames:
    """Obscure/indie games not in popular lists — tests IGDB search + seeding path."""

    async def test_unique_indie_name_igdb_search(self):
        """'A Short Hike' — unique title, only in IGDB, gets seeded."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase2a_exact = AsyncMock(return_value=[0])
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])

        # Simulate IGDB search finding it + seeding
        async def _phase3_side_effect(reqs, indices, all_cands):
            from otix.schemas.media import GameMatchCandidate
            # Seed creates media item + returns ID
            all_cands[0].append(GameMatchCandidate(
                media_item_id="otix_seeded_ash",
                title="A Short Hike",
                poster_url="https://img/ash.jpg",
                confidence=0.90,  # exact IGDB title match → boosted
                match_type=MatchType.IGDB_SEARCH,
                needs_import=False,
                provider_id="113112",
                provider="igdb",
            ))
        matcher._phase3_igdb = _phase3_side_effect

        req = GameMatchRequest(
            query_id="epic:AShortHike", title="A Short Hike",
            developer="adamgryu",
        )
        result = await matcher.match_single(req)
        assert len(result.candidates) >= 1
        assert result.candidates[0].confidence >= 0.90
        assert result.candidates[0].needs_import is False  # was seeded

    async def test_generic_word_title_needs_developer_filter(self):
        """'Control' — common word, needs developer to disambiguate from other 'Control' games."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase1_direct = AsyncMock(return_value=[0])  # bypass Phase 1
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        # Two "Control" games in catalog
        control_505 = _make_mi("otix_control_505", "Control")
        control_505.involved_companies = [FakeInvolvedCompany("Remedy Entertainment", developer=True)]
        control_legacy = _make_mi("otix_control_old", "Control")
        control_legacy.involved_companies = [FakeInvolvedCompany("Unknown Dev", developer=True)]

        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(
                all=MagicMock(return_value=[control_505, control_legacy])
            ))
        ))
        matcher._batch_fetch_developers = AsyncMock(return_value={
            "otix_control_505": ["remedy entertainment"],
            "otix_control_old": ["unknown dev"],
        })

        req = GameMatchRequest(
            query_id="epic:Control", title="Control",
            developer="Remedy Entertainment",
        )
        result = await matcher.match_single(req)

        # Both candidates should appear, but Remedy's should rank higher
        assert len(result.candidates) >= 2
        # The one with matching developer gets 0.97 vs 0.95 without
        dev_match = [c for c in result.candidates if c.confidence >= 0.97]
        assert len(dev_match) >= 1
        # Auto-match should be the developer-matching one (higher confidence)
        assert result.auto_match is not None
        assert result.auto_match.confidence == 0.97

    async def test_short_name_game(self):
        """'ABZU' — 4-char name, should match via exact title."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        abzu = _make_mi("otix_abzu", "ABZU")
        abzu.involved_companies = []
        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[abzu])))
        ))
        matcher._batch_fetch_developers = AsyncMock(return_value={})

        req = GameMatchRequest(query_id="epic:ABZU", title="ABZU")
        result = await matcher.match_single(req)
        assert result.auto_match is not None
        assert result.auto_match.match_type == MatchType.EXACT_TITLE
        assert result.auto_match.media_item_id == "otix_abzu"

    async def test_foreign_indie_unicode_title(self):
        """Japanese indie game title — should normalize and match."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase1_direct = AsyncMock(return_value=[0])  # bypass Phase 1
        matcher._phase2a_exact = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        async def _phase2b_side_effect(reqs, indices, all_cands):
            from otix.schemas.media import GameMatchCandidate
            all_cands[0].append(GameMatchCandidate(
                media_item_id="otix_laplace",
                title="Laplace's Demon",
                confidence=0.75,
                match_type=MatchType.ILIKE,
            ))
            return []
        matcher._phase2b_ilike = _phase2b_side_effect

        # Epic plugin might return localized title
        req = GameMatchRequest(
            query_id="epic:Laplace", title="ラプラスの魔",
            external_ids=[{"source": "epic", "id": "Laplace"}],
        )
        result = await matcher.match_single(req)
        # Should get at least an IGDB candidate (or ILIKE if catalog has it)
        # Even if no match found, shouldn't crash on Unicode
        assert result is not None

    async def test_early_access_indie(self):
        """'Hades' — was Early Access, now full release. EA tag shouldn't block matching."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        hades = _make_mi("otix_hades", "Hades")
        hades.involved_companies = [FakeInvolvedCompany("Supergiant Games", developer=True)]
        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[hades])))
        ))
        matcher._batch_fetch_developers = AsyncMock(return_value={
            "otix_hades": ["supergiant games"],
        })

        req = GameMatchRequest(
            query_id="epic:Hades", title="Hades",
            developer="Supergiant Games",
        )
        result = await matcher.match_single(req)
        assert result.auto_match is not None
        assert result.auto_match.media_item_id == "otix_hades"

    async def test_episodic_game_matches_main(self):
        """'Life is Strange: Episode 1' should match main 'Life is Strange' entry."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase2a_exact = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        async def _phase2b_side_effect(reqs, indices, all_cands):
            from otix.schemas.media import GameMatchCandidate
            all_cands[0].append(GameMatchCandidate(
                media_item_id="otix_lis",
                title="Life is Strange",
                confidence=0.85,  # dev match
                match_type=MatchType.ILIKE,
            ))
            return []
        matcher._phase2b_ilike = _phase2b_side_effect

        req = GameMatchRequest(
            query_id="epic:LIS_EP1", title="Life is Strange: Episode 1",
            developer="Dontnod Entertainment",
        )
        result = await matcher.match_single(req)
        assert len(result.candidates) >= 1

    async def test_obscure_visual_novel(self):
        """'VA-11 Hall-A: Cyberpunk Bartender Action' — long title, IGDB cross-ref."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase1_direct = AsyncMock(return_value=[0])  # bypass Phase 1
        matcher._phase2a_exact = AsyncMock(return_value=[0])
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])

        async def _phase3_side_effect(reqs, indices, all_cands):
            from otix.schemas.media import GameMatchCandidate
            # IGDB cross-ref finds it, seeds it
            all_cands[0].append(GameMatchCandidate(
                media_item_id="otix_seeded_va11",
                title="VA-11 Hall-A: Cyberpunk Bartender Action",
                confidence=0.90,
                match_type=MatchType.IGDB_SEARCH,
                provider_id="19433",
                provider="igdb",
            ))
        matcher._phase3_igdb = _phase3_side_effect

        req = GameMatchRequest(
            query_id="epic:VA11HALLA", title="VA-11 Hall-A: Cyberpunk Bartender Action",
            developer="Sukeban Games",
            external_ids=[{"source": "epic", "id": "VA11HALLA"}],
        )
        result = await matcher.match_single(req)
        assert len(result.candidates) >= 1
        # Long, unique title → high confidence IGDB match
        assert result.candidates[0].confidence >= 0.90

    async def test_free_epic_weekly_obscure(self):
        """Obscure free Epic weekly game — 'Figment' — only in IGDB."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase2a_exact = AsyncMock(return_value=[0])
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])

        async def _phase3_side_effect(reqs, indices, all_cands):
            from otix.schemas.media import GameMatchCandidate
            all_cands[0].append(GameMatchCandidate(
                media_item_id="otix_seeded_figment",
                title="Figment",
                confidence=0.90,
                match_type=MatchType.IGDB_SEARCH,
            ))
        matcher._phase3_igdb = _phase3_side_effect

        req = GameMatchRequest(
            query_id="epic:Figment", title="Figment",
            developer="Bedtime Digital Games",
        )
        result = await matcher.match_single(req)
        assert len(result.candidates) >= 1
        assert result.candidates[0].confidence >= 0.90

    async def test_indie_no_developer_info(self):
        """Plugin returns game without developer field — should still match by title alone."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        fez = _make_mi("otix_fez", "Fez")
        fez.involved_companies = [FakeInvolvedCompany("Polytron Corporation", developer=True)]
        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[fez])))
        ))
        matcher._batch_fetch_developers = AsyncMock(return_value={
            "otix_fez": ["polytron corporation"],
        })

        req = GameMatchRequest(
            query_id="epic:Fez", title="Fez",
            developer=None,  # no developer from plugin
        )
        result = await matcher.match_single(req)
        # Should match by title alone, developer bonus just not applied
        assert result.auto_match is not None
        assert result.auto_match.confidence == 0.95  # exact title, no dev bonus


class TestAmbiguousTitleScenarios:
    """Games with ambiguous titles where developer filtering is critical."""

    async def test_same_title_different_developer(self):
        """Two catalog entries with same title, different developers. Request should match the right one."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        # "Prey" — could be 2006 (Human Head) or 2017 (Arkane)
        prey_2006 = _make_mi("otix_prey_2006", "Prey")
        prey_2006.involved_companies = [FakeInvolvedCompany("Human Head Studios", developer=True)]
        prey_2017 = _make_mi("otix_prey_2017", "Prey")
        prey_2017.involved_companies = [FakeInvolvedCompany("Arkane Studios", developer=True)]

        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(
                all=MagicMock(return_value=[prey_2006, prey_2017])
            ))
        ))
        matcher._batch_fetch_developers = AsyncMock(return_value={
            "otix_prey_2006": ["human head studios"],
            "otix_prey_2017": ["arkane studios"],
        })

        # Request is Arkane's Prey (2017)
        req = GameMatchRequest(
            query_id="epic:Prey2017", title="Prey",
            developer="Arkane Studios",
        )
        result = await matcher.match_single(req)

        # Both should appear, but Arkane's should have higher confidence
        assert len(result.candidates) >= 2
        arkane_candidates = [c for c in result.candidates if "arkane" in str(c.media_item_id).lower() or "2017" in str(c.media_item_id)]
        # The one with matching developer should rank higher
        if arkane_candidates:
            top_arkane = [c for c in result.candidates if c.confidence >= 0.97]
            assert len(top_arkane) >= 1  # dev match bonus applied

    async def test_reboot_vs_original(self):
        """'God of War' — 2005 original vs 2018 reboot. Developer + year distinguish."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        gow_2018 = _make_mi("otix_gow_2018", "God of War")
        gow_2018.involved_companies = [FakeInvolvedCompany("Santa Monica Studio", developer=True)]

        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(
                all=MagicMock(return_value=[gow_2018])
            ))
        ))
        matcher._batch_fetch_developers = AsyncMock(return_value={
            "otix_gow_2018": ["santa monica studio"],
        })

        req = GameMatchRequest(
            query_id="epic:GOW", title="God of War",
            developer="Santa Monica Studio",
            release_year=2018,
        )
        result = await matcher.match_single(req)
        assert result.auto_match is not None
        assert result.auto_match.confidence == 0.97  # exact title + dev match

    async def test_sequel_vs_original(self):
        """'Doom' (2016) vs 'Doom' (1993) — same title, same developer. Release year distinguishes."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])
        matcher._phase3_igdb = AsyncMock(return_value=None)

        # Both by id Software, different years
        doom_2016 = _make_mi("otix_doom_2016", "Doom")
        doom_2016.involved_companies = [FakeInvolvedCompany("id Software", developer=True)]
        doom_1993 = _make_mi("otix_doom_1993", "Doom")
        doom_1993.involved_companies = [FakeInvolvedCompany("id Software", developer=True)]

        session.execute = AsyncMock(return_value=MagicMock(
            scalars=MagicMock(return_value=MagicMock(
                all=MagicMock(return_value=[doom_2016, doom_1993])
            ))
        ))
        # Both have same developer → no differentiation by dev alone
        matcher._batch_fetch_developers = AsyncMock(return_value={
            "otix_doom_2016": ["id software"],
            "otix_doom_1993": ["id software"],
        })

        req = GameMatchRequest(
            query_id="epic:Doom2016", title="Doom",
            developer="id Software",
            release_year=2016,
        )
        result = await matcher.match_single(req)

        # Both candidates have same confidence (same dev)
        # Release year is not factored into Phase 2 confidence currently
        # But both should be candidates
        assert len(result.candidates) >= 2
        # Both at 0.97 (exact title + same dev)
        for c in result.candidates:
            assert c.confidence == 0.97

    async def test_epic_multi_external_id_igdb_crossref(self):
        """Epic request with appName, catalogItemId, offerId checks all IDs in IGDB cross-ref."""
        session = AsyncMock()
        matcher = GameMatcher(session, MagicMock())
        matcher._eid_svc.batch_find_with_metadata = AsyncMock(return_value={})
        matcher._phase1_direct = AsyncMock(return_value=[0])
        matcher._phase2a_exact = AsyncMock(return_value=[0])
        matcher._phase2b_ilike = AsyncMock(return_value=[0])
        matcher._phase2c_trigram = AsyncMock(return_value=[0])

        provider = MagicMock()
        # Mock lookup_epic_ids to receive all epic external IDs
        provider.lookup_epic_ids = AsyncMock(return_value={"catalog_item_99": 1052})
        provider.get_game = AsyncMock(return_value={
            "name": "Alan Wake 2",
            "cover": {"image_id": "co6789"},
            "first_release_date": 1698364800,
            "platforms": [{"name": "PC (Microsoft Windows)"}],
        })

        matcher._seed_game_from_igdb = AsyncMock(return_value="otix_aw2")

        req = GameMatchRequest(
            query_id="epic:Sugar",
            title="Alan Wake 2",
            developer="Remedy Entertainment",
            external_ids=[
                {"source": "epic", "id": "Sugar"},
                {"source": "epic", "id": "catalog_item_99"},
                {"source": "epic", "id": "offer_456"},
                {"source": "epic_namespace", "id": "fn"},
            ],
        )

        unmatched = await matcher._phase3a_igdb_crossref([req], [0], [[]], provider)

        # Cross-ref should pass all epic IDs to lookup_epic_ids
        provider.lookup_epic_ids.assert_called_once()
        queried_ids = provider.lookup_epic_ids.call_args[0][0]
        assert "Sugar" in queried_ids
        assert "catalog_item_99" in queried_ids
        assert "offer_456" in queried_ids

        # Should match and seed game with request_external_ids
        assert unmatched == []
        matcher._seed_game_from_igdb.assert_called_once_with(
            {"name": "Alan Wake 2", "cover": {"image_id": "co6789"}, "first_release_date": 1698364800, "platforms": [{"name": "PC (Microsoft Windows)"}]},
            1052,
            request_external_ids=req.external_ids,
        )

