"""Tests for game hero backfill helpers."""

from __future__ import annotations

from otix.scripts.backfill_game_heroes import _iter_platform_jobs


def test_iter_platform_jobs_prefers_steam_then_other_store_ids():
    jobs = list(
        _iter_platform_jobs(
            730,
            {
                "steam": 730,
                "egs": "test-egs",
                "gog": "",
                "uplay": None,
                "eshop": "test-eshop",
            },
        )
    )

    assert jobs == [
        ("steam", 730),
        ("egs", "test-egs"),
        ("eshop", "test-eshop"),
    ]


def test_iter_platform_jobs_handles_games_without_store_ids():
    assert list(_iter_platform_jobs(730, None)) == [("steam", 730)]
    assert list(_iter_platform_jobs(None, None)) == []
