"""Tests for the canonical completeness scorer (``apps.media.services.completeness``).

The module is the single source of truth shared by the ingest pipeline (which
persists ``recompute_completeness`` at each seed/hydration tail) and the admin
hydration-status panel (``apps.proposals.services.admin`` scores from the same
functions). These tests pin the pure flag math, the persistence behaviour, and
the guarantee that a hydrated row's stored score reflects its graph and that the
admin panel reports the same number.
"""

from __future__ import annotations

from django.test import TestCase

from apps.media.models import Genre, MediaAsset, MediaGenre, MediaItem, Movie
from apps.media.services.completeness import (
    CORE_FLAGS,
    RELATION_FLAGS,
    TYPE_FLAG_GROUPS,
    completeness_flags,
    recompute_completeness,
    required_flags,
    score_from_flags,
)
from apps.media.services.igdb_ingest import seed_game_from_igdb
from apps.media.services.tmdb_ingest import seed_movie_from_tmdb
from apps.proposals.services.admin import get_hydration_status

_IGDB_ID = 119133


def _game_raw(**overrides):
    raw = {
        "id": _IGDB_ID,
        "name": "Hades",
        "slug": "hades",
        "storyline": "Defy the god of the dead as you hack and slash out of Hell.",
        "summary": "A roguelike dungeon crawler from Supergiant Games.",
        "cover": {"image_id": "co1234"},
        "first_release_date": 1600300800,  # 2020-09-17
    }
    raw.update(overrides)
    return raw


def _movie_raw(**overrides):
    raw = {
        "id": 550,
        "title": "Fight Club",
        "overview": "An insomniac and a soap salesman start an underground club.",
        "release_date": "1999-10-15",
        "original_language": "en",
        "adult": False,
        "popularity": 60.0,
        "runtime": 139,
        "budget": 63000000,
        "revenue": 100000000,
        "poster_path": "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
        "backdrop_path": "/hZkgoQYus5vegHoetLkCJzb17zJ.jpg",
        "imdb_id": "tt0137523",
        "genres": [{"id": 18, "name": "Drama"}, {"id": 53, "name": "Thriller"}],
    }
    raw.update(overrides)
    return raw


class ScoreFromFlagsTests(TestCase):
    def test_flag_counts_match_legacy(self):
        self.assertEqual(len(CORE_FLAGS), 7)
        self.assertEqual(len(RELATION_FLAGS), 10)
        self.assertEqual(len(required_flags("movie")), 7 + 10 + 5)
        self.assertEqual(len(required_flags("show")), 7 + 10 + 3)
        self.assertEqual(len(required_flags("game")), 7 + 10 + 3)
        self.assertEqual(len(required_flags("music")), 7 + 10)
        self.assertEqual(len(required_flags("person")), 7 + 10)
        self.assertEqual(len(TYPE_FLAG_GROUPS["movie"]), 5)
        self.assertEqual(len(TYPE_FLAG_GROUPS["show"]), 3)
        self.assertEqual(len(TYPE_FLAG_GROUPS["game"]), 3)

    def test_all_flags_true_scores_one(self):
        flags = {flag: True for flag in required_flags("movie")}
        self.assertEqual(score_from_flags("movie", flags), 1.0)

    def test_partial_fractions_round_to_three_decimals(self):
        flags = {flag: True for flag in required_flags("movie")}
        # Turn off 11 of 22 → 0.5.
        for flag in required_flags("movie")[:11]:
            flags[flag] = False
        self.assertEqual(score_from_flags("movie", flags), 0.5)
        # A fully-hydrated game (9 of 20 flags) → 0.45.
        game_flags = {flag: False for flag in required_flags("game")}
        for flag in (
            "has_overview",
            "has_poster",
            "has_release_date",
            "has_external_ids",
            "has_assets",
            "has_genres",
            "has_platforms",
            "has_game_modes",
            "has_companies",
        ):
            game_flags[flag] = True
        self.assertEqual(score_from_flags("game", game_flags), 0.45)

    def test_unknown_media_type_uses_core_plus_relations(self):
        flags = {flag: True for flag in required_flags("person")}
        self.assertEqual(score_from_flags("person", flags), 1.0)


class RecomputeCompletenessTests(TestCase):
    def test_recompute_persists_and_reflects_added_graph(self):
        media = MediaItem.objects.create(
            media_type="movie",
            title="Bare",
            overview="Only a plot blurb.",
            completeness_score=0.15,
        )
        bare = recompute_completeness(media)
        self.assertEqual(bare, score_from_flags("movie", completeness_flags(media)))
        media.refresh_from_db()
        self.assertEqual(media.completeness_score, bare)

        # Enrich the row: poster, release date, runtime, a genre.
        MediaAsset.objects.create(
            media_item=media,
            asset_type="poster",
            url="https://cdn.example/bare.jpg",
            provider="tmdb",
            score=100,
        )
        media.release_date = "2020-01-01"
        media.save(update_fields=("release_date", "updated_at"))
        Movie.objects.create(media_item_id=media.pk, runtime=100, budget=1, revenue=2)
        genre, _ = Genre.objects.get_or_create(name="Drama")
        MediaGenre.objects.create(media_item=media, genre=genre)

        enriched = recompute_completeness(media)
        self.assertGreater(enriched, bare)
        self.assertEqual(enriched, score_from_flags("movie", completeness_flags(media)))
        media.refresh_from_db()
        self.assertEqual(media.completeness_score, enriched)

    def test_recompute_is_a_noop_save_when_unchanged(self):
        media = MediaItem.objects.create(media_type="show", title="Static")
        recompute_completeness(media)
        media.refresh_from_db()
        first = media.completeness_score
        recompute_completeness(media)
        media.refresh_from_db()
        self.assertEqual(media.completeness_score, first)

    def test_igdb_full_hydration_outranks_minimal_seed(self):
        minimal = seed_game_from_igdb(_game_raw(), _IGDB_ID)
        self.assertEqual(
            MediaItem.objects.get(pk=minimal).completeness_score, 0.25
        )

        full_raw = _game_raw(
            status=0,
            platforms=[{"name": "PC (Microsoft Windows)"}],
            genres=[{"name": "Roguelike"}],
            game_modes=[{"name": "Single player"}],
            involved_companies=[
                {
                    "developer": True,
                    "publisher": False,
                    "porting": False,
                    "supporting": False,
                    "company": {"id": 1, "name": "Supergiant Games", "slug": "supergiant-games"},
                }
            ],
        )
        seed_game_from_igdb(full_raw, _IGDB_ID)
        self.assertEqual(
            MediaItem.objects.get(pk=minimal).completeness_score, 0.45
        )

    def test_admin_hydration_status_scores_from_the_same_flags(self):
        media_id = seed_movie_from_tmdb(_movie_raw())
        media = MediaItem.objects.get(pk=media_id)
        stored = media.completeness_score
        self.assertGreater(stored, 0.0)

        result = get_hydration_status(
            media_type="movie",
            search="Fight",
            page=1,
            per_page=10,
            sort_by="title",
            sort_dir="asc",
        )
        item = next(i for i in result["items"] if i["id"] == media_id)
        self.assertEqual(item["completeness_score"], stored)
        for flag, value in completeness_flags(media).items():
            self.assertEqual(item[flag], value)
