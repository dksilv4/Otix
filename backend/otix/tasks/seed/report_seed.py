# TODO: Review this file
"""Seed and verify known-good test data across all media types.

Runs inline sync for a curated list of IDs (not via Celery tasks) and
prints a human-readable report of what was created, including ExternalID
descriptor verification.

Usage:
    cd backend && python -m otix.tasks.seed.report_seed

This is a development/reporting tool, not part of the Celery beat schedule.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from otix.domain.media import (
    Album,
    ExternalID,
    Game,
    MediaItem,
)
from otix.domain.people import Person
from otix.infrastructure.database import async_session, dispose_engine


@dataclass
class SeedReport:
    """Aggregated results from a seeding run."""

    movies: list[str] = field(default_factory=list)
    shows: list[str] = field(default_factory=list)
    people: list[str] = field(default_factory=list)
    games: list[str] = field(default_factory=list)
    albums: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    started_at: float = 0.0
    finished_at: float = 0.0

    @property
    def elapsed(self) -> float:
        return self.finished_at - self.started_at

    def print(self) -> None:
        print("\n" + "=" * 70)
        print("  O T I X   S E E D   R E P O R T")
        print("=" * 70)

        def _section(title: str, items: list[str]) -> None:
            print(f"\n  {title} ({len(items)})")
            print(f"  {'-' * 50}")
            if items:
                for item in items:
                    print(f"    {item}")
            else:
                print("    (none)")

        _section("Movies", self.movies)
        _section("TV Shows", self.shows)
        _section("People", self.people)
        _section("Games", self.games)
        _section("Albums", self.albums)

        if self.errors:
            _section("Errors", self.errors)

        total = len(self.movies) + len(self.shows) + len(self.people) + len(self.games) + len(self.albums)
        print(f"\n  {'─' * 50}")
        print(f"  Total entities: {total}")
        print(f"  Errors: {len(self.errors)}")
        print(f"  Duration: {self.elapsed:.1f}s")
        print("=" * 70)


# ── Known-good test IDs ────────────────────────────────────────────────────

SEED_MOVIES = [
    (603, "The Matrix"),
    (27205, "Inception"),
    (157336, "Interstellar"),
    (155, "The Dark Knight"),
    (680, "Pulp Fiction"),
]

SEED_SHOWS = [
    (1396, "Breaking Bad"),
    (66732, "Stranger Things"),
    (1399, "Game of Thrones"),
]

SEED_PEOPLE = [
    (6384, "Keanu Reeves"),
    (6193, "Leonardo DiCaprio"),
    (525, "Christopher Nolan"),
    (192, "Quentin Tarantino"),
    (31, "Tom Hanks"),
]

SEED_GAMES = [
    730,  # Counter-Strike 2
    570,  # Dota 2
    578080,  # PUBG: BATTLEGROUNDS
]

SEED_ALBUMS = [
    ("4b3d18cc-8937-36f4-8de0-481088be58e6", "OK Computer"),
    ("b84ee12a-09ef-421b-82de-0441a926375b", "The Dark Side of the Moon"),
    ("03437e02-835f-3a0a-a37c-48a36c2e852a", "Abbey Road"),
]


# ── Sync function imports (lazy to avoid top-level Celery stub printing) ───


async def _sync_tmdb_media(tmdb_id: int, media_type: str, force: bool = False):
    from otix.tasks.sync.tmdb import _sync_tmdb_media as _impl

    return await _impl(tmdb_id, media_type, force)


async def _sync_tmdb_person(tmdb_id: int, force: bool = False):
    from otix.tasks.sync.tmdb import _sync_tmdb_person as _impl

    return await _impl(tmdb_id, force)


async def _sync_steam_app(steam_app_id: int):
    from otix.tasks.sync.steam import _sync_steam_seed_app as _impl

    return await _impl(steam_app_id)


async def _sync_musicbrainz_album(mbid: str, force: bool = False):
    from otix.tasks.sync.musicbrainz import _sync_musicbrainz_album as _impl

    return await _impl(mbid, force)


# ── Helpers ─────────────────────────────────────────────────────────────────


def _result_status(result: dict | None) -> str:
    """Extract a human-readable status from a sync result dict."""
    if result is None:
        return "skipped (unchanged)"
    return result.get("status", "synced")


# ── Main runner ────────────────────────────────────────────────────────────


async def run_seed_report() -> SeedReport:
    report = SeedReport()
    report.started_at = time.monotonic()

    # ── Movies ──────────────────────────────────────────────────────────
    print("Syncing movies...")
    for tmdb_id, title in SEED_MOVIES:
        try:
            result = await _sync_tmdb_media(tmdb_id, "movie", force=True)
            status = _result_status(result)
            report.movies.append(f"{title} (tmdb:{tmdb_id}) — {status}")
        except Exception as exc:
            report.errors.append(f"{title}: {exc}")

    # ── TV Shows ────────────────────────────────────────────────────────
    print("Syncing TV shows...")
    for tmdb_id, title in SEED_SHOWS:
        try:
            result = await _sync_tmdb_media(tmdb_id, "show", force=True)
            status = _result_status(result)
            report.shows.append(f"{title} (tmdb:{tmdb_id}) — {status}")
        except Exception as exc:
            report.errors.append(f"{title}: {exc}")

    # ── People ──────────────────────────────────────────────────────────
    print("Syncing people...")
    for tmdb_id, name in SEED_PEOPLE:
        try:
            result = await _sync_tmdb_person(tmdb_id, force=True)
            status = _result_status(result)
            report.people.append(f"{name} (tmdb:{tmdb_id}) — {status}")
        except Exception as exc:
            report.errors.append(f"{name}: {exc}")

    # ── Games ───────────────────────────────────────────────────────────
    print("Syncing game...")
    for app_id in SEED_GAMES:
        try:
            result = await _sync_steam_app(app_id)
            if result:
                name = result.get("name", f"App {app_id}")
                status = result.get("status", "synced")
                report.games.append(f"{name} (steam:{app_id}) — {status}")
            else:
                report.games.append(f"App {app_id} (steam:{app_id}) — skipped (unchanged)")
        except Exception as exc:
            report.errors.append(f"Steam app {app_id}: {exc}")

    # ── Albums ──────────────────────────────────────────────────────────
    print("Syncing albums...")
    for mbid, title in SEED_ALBUMS:
        try:
            result = await _sync_musicbrainz_album(mbid, force=True)
            status = _result_status(result)
            report.albums.append(f"{title} (mb:{mbid[:8]}...) — {status}")
        except Exception as exc:
            report.errors.append(f"{title}: {exc}")

    report.finished_at = time.monotonic()
    return report


# ── Verification queries ───────────────────────────────────────────────────


async def verify_external_ids() -> None:
    """Run verification queries to confirm ExternalID descriptors work."""
    print("\n  Verifying ExternalID descriptors...")

    async with async_session() as session:
        # Count ExternalID rows by entity_type
        rows = await session.execute(
            select(
                ExternalID.entity_type,
                func.count(ExternalID.id),
            ).group_by(ExternalID.entity_type)
        )
        for entity_type, count in rows:
            label = entity_type or "(null — legacy stubs)"
            print(f"    external_ids.{label}: {count} rows")

        # Verify descriptor reads for a sample of each entity type
        game = await session.scalar(
            select(Game).options(selectinload(Game.media_item), selectinload(Game._external_ids)).limit(1)
        )
        if game:
            steam_id = game.steam_app_id
            print(f"    Game '{game.media_item.title}' steam_app_id = {steam_id}")

        person = await session.scalar(
            select(Person)
            .options(selectinload(Person._external_ids))
            .where(
                Person.id.in_(
                    select(ExternalID.entity_id).where(
                        ExternalID.entity_type == "person",
                        ExternalID.provider == "tmdb",
                    )
                )
            )
            .limit(1)
        )
        if person:
            print(f"    Person '{person.name}' tmdb_id = {person.tmdb_id}")

        album = await session.scalar(
            select(Album).options(selectinload(Album.media_item), selectinload(Album._external_ids)).limit(1)
        )
        if album:
            mb_id = album.musicbrainz_id
            print(f"    Album '{album.media_item.title}' musicbrainz_id = {mb_id}")

        mi_count = await session.scalar(select(func.count(MediaItem.id)))
        p_count = await session.scalar(select(func.count(Person.id)))
        print(f"\n    Database totals: {mi_count} media_items, {p_count} people")


# ── Entry point ────────────────────────────────────────────────────────────


async def main() -> None:
    report = await run_seed_report()
    await verify_external_ids()
    report.print()
    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
