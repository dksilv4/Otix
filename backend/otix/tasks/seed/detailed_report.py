# TODO: Review this file
"""Print a detailed completeness report for all seeded entities."""
from __future__ import annotations

import asyncio

from sqlalchemy import select, text
from sqlalchemy.orm import selectinload

from otix.domain.collection import CollectionItem
from otix.domain.company import InvolvedCompany
from otix.domain.genre import MediaGenre, MediaKeyword
from otix.domain.media import (
    ExternalID,
    MediaItem,
    Track,
)
from otix.domain.people import MediaCredit, Person
from otix.infrastructure.database import async_session, dispose_engine


def _ok(val) -> str:
    return "✓" if val else "✗"


async def report() -> None:
    async with async_session() as session:

        # ── MOVIES ──────────────────────────────────────────────
        result = await session.execute(
            select(MediaItem)
            .options(
                selectinload(MediaItem.movie),
                selectinload(MediaItem.genres).selectinload(MediaGenre.genre),
                selectinload(MediaItem.keywords).selectinload(MediaKeyword.keyword),
                selectinload(MediaItem.assets),
                selectinload(MediaItem.videos),
                selectinload(MediaItem.releases),
                selectinload(MediaItem.external_ratings),
                selectinload(MediaItem.collection_items).selectinload(CollectionItem.collection),
            )
            .where(MediaItem.media_type == "movie")
            .order_by(MediaItem.title)
        )
        movies = result.unique().scalars().all()

        print(f"\n{'='*70}")
        print(f"  MOVIES ({len(movies)})")
        print(f"{'='*70}")

        for mi in movies:
            print(f"\n  ▸ {mi.title}  (id={mi.id})")
            print(f"    {'CORE':─<50}")
            print(f"    {_ok(True)} title           {mi.title}")
            print(f"    {_ok(bool(mi.overview))} overview        {(mi.overview or '')[:100]}")
            print(f"    {_ok(bool(mi.slug))} slug            {mi.slug}")
            print(f"    {_ok(mi.release_date is not None)} release_date    {mi.release_date or ''}")
            print(f"    {_ok(bool(mi.original_language))} language        {mi.original_language or ''}")
            print(f"    {_ok(mi.popularity > 0)} popularity      {mi.popularity}")
            print(f"    {_ok(mi.completeness_score > 0)} completeness     {mi.completeness_score}")

            # Movie-specific
            m = mi.movie
            print(f"    {'MOVIE':─<50}")
            print(f"    {_ok(m.runtime is not None)} runtime         {m.runtime or ''}")
            print(f"    {_ok(bool(m.budget))} budget          {m.budget or ''}")
            print(f"    {_ok(bool(m.revenue))} revenue         {m.revenue or ''}")
            tagline = getattr(m, "tagline", None)
            print(f"    {_ok(bool(tagline))} tagline         {tagline or ''}")

            # ASSETS — the important part
            print(f"    {'ASSETS':─<50}")
            poster_url = mi.poster_url
            backdrop_url = mi.backdrop_url
            logo_url = mi.logo_url
            textless_url = mi.textless_poster_url
            print(f"    {_ok(bool(poster_url))} poster          {(poster_url or '')[:80]}")
            print(f"    {_ok(bool(backdrop_url))} backdrop        {(backdrop_url or '')[:80]}")
            print(f"    {_ok(bool(logo_url))} logo            {(logo_url or '')[:80]}")
            print(f"    {_ok(bool(textless_url))} textless_poster {(textless_url or '')[:80]}")
            # Extra assets in media_assets table
            asset_by_type = {}
            for a in mi.assets:
                asset_by_type.setdefault(a.asset_type, []).append(a)
            for atype, items in sorted(asset_by_type.items()):
                if atype not in ("poster", "backdrop", "logo", "textless_poster"):
                    for a in items[:3]:
                        print(f"    {_ok(True)} {atype:<15} {(a.url or '')[:80]}")

            # Videos
            print(f"    {'VIDEOS':─<50}")
            if mi.videos:
                for v in mi.videos[:5]:
                    print(f"    {_ok(True)} {(v.video_type or 'video'):<12} {v.url[:80]}")
            else:
                print(f"    {_ok(False)} none")

            # Releases
            print(f"    {'RELEASES':─<50}")
            if mi.releases:
                for r in mi.releases[:5]:
                    print(f"    {_ok(True)} {r.country_code or '??':<4}  cert={r.certification or '?'}  date={r.release_date}")
            else:
                print(f"    {_ok(False)} none")

            # External ratings
            print(f"    {'RATINGS':─<50}")
            if mi.external_ratings:
                for er in mi.external_ratings[:3]:
                    print(f"    {_ok(True)} {er.provider}: {er.score}/{er.max_score} ({er.vote_count} votes)")
            else:
                print(f"    {_ok(False)} none")

            # Genres / Keywords
            if mi.genres:
                print(f"    genres:     {[g.genre.name for g in mi.genres]}")
            else:
                print("    genres:     none")
            if mi.keywords:
                print(f"    keywords:   {[k.keyword.name for k in mi.keywords[:10]]}")
            else:
                print("    keywords:   none")

            # Collection
            if mi.collection_items:
                for ci in mi.collection_items:
                    c = ci.collection
                    print(f"    collection: {c.name} (tmdb={c.tmdb_id}) sort={ci.sort_order}")
            else:
                print("    collection: none")

        # ── SHOWS ──────────────────────────────────────────────
        result = await session.execute(
            select(MediaItem)
            .options(
                selectinload(MediaItem.show),
                selectinload(MediaItem.genres).selectinload(MediaGenre.genre),
                selectinload(MediaItem.assets),
                selectinload(MediaItem.videos),
                selectinload(MediaItem.external_ratings),
                selectinload(MediaItem.involved_companies).selectinload(InvolvedCompany.company),
            )
            .where(MediaItem.media_type == "show")
            .order_by(MediaItem.title)
        )
        shows = result.unique().scalars().all()

        print(f"\n{'='*70}")
        print(f"  TV SHOWS ({len(shows)})")
        print(f"{'='*70}")

        for mi in shows:
            s = mi.show
            print(f"\n  ▸ {mi.title}  (id={mi.id})")
            print(f"    {_ok(bool(mi.overview))} overview        {(mi.overview or '')[:100]}")
            print(f"    {_ok(mi.release_date is not None)} first_aired     {mi.release_date or ''}")
            print(f"    {_ok(bool(mi.original_language))} language        {mi.original_language or ''}")
            print(f"    {_ok(mi.popularity > 0)} popularity      {mi.popularity}")
            print(f"    {_ok(s.status is not None)} status          {s.status or ''}")
            print(f"    {_ok(s.first_air_date is not None)} first_air_date  {s.first_air_date or ''}")
            print(f"    {_ok(s.last_air_date is not None)} last_air_date   {s.last_air_date or ''}")
            print(f"    {_ok(s.number_of_seasons is not None)} seasons         {s.number_of_seasons or ''}")
            print(f"    {_ok(s.number_of_episodes is not None)} episodes        {s.number_of_episodes or ''}")

            # ASSETS
            print(f"    {'ASSETS':─<50}")
            poster_url = mi.poster_url
            backdrop_url = mi.backdrop_url
            print(f"    {_ok(bool(poster_url))} poster          {(poster_url or '')[:80]}")
            print(f"    {_ok(bool(backdrop_url))} backdrop        {(backdrop_url or '')[:80]}")
            for a in mi.assets:
                if a.asset_type not in ("poster", "backdrop"):
                    print(f"    {_ok(True)} {a.asset_type:<15} {(a.url or '')[:80]}")

            if mi.videos:
                print(f"    videos:  {len(mi.videos)} total")
            if mi.genres:
                print(f"    genres:  {[g.genre.name for g in mi.genres]}")
            if mi.involved_companies:
                print(f"    networks: {[ic.company.name for ic in mi.involved_companies[:5]]}")

            # External IDs
            eid_result = await session.execute(
                select(ExternalID).where(
                    ExternalID.entity_type == "media_item",
                    ExternalID.entity_id == mi.id,
                )
            )
            eids = eid_result.scalars().all()
            if eids:
                print(f"    external_ids: {[(e.provider, e.external_id) for e in eids]}")

        # ── GAMES ───────────────────────────────────────────────
        result = await session.execute(
            select(MediaItem)
            .options(
                selectinload(MediaItem.game),
                selectinload(MediaItem.genres).selectinload(MediaGenre.genre),
                selectinload(MediaItem.assets),
                selectinload(MediaItem.videos),
            )
            .where(MediaItem.media_type == "game")
            .order_by(MediaItem.title)
        )
        games = result.unique().scalars().all()

        print(f"\n{'='*70}")
        print(f"  GAMES ({len(games)})")
        print(f"{'='*70}")

        for mi in games:
            g = mi.game
            print(f"\n  ▸ {mi.title}  (id={mi.id})")
            print(f"    {_ok(bool(mi.overview))} overview        {(mi.overview or '')[:100]}")
            print(f"    {_ok(mi.release_date is not None)} release_date    {mi.release_date or ''}")
            print(f"    {_ok(mi.popularity > 0)} popularity      {mi.popularity}")
            print(f"    {_ok(g.is_free is not None)} is_free         {g.is_free}")

            # ASSETS
            print(f"    {'ASSETS':─<50}")
            poster_url = mi.poster_url
            backdrop_url = mi.backdrop_url
            print(f"    {_ok(bool(poster_url))} poster          {(poster_url or '')[:80]}")
            print(f"    {_ok(bool(backdrop_url))} backdrop        {(backdrop_url or '')[:80]}")
            for a in mi.assets:
                if a.asset_type not in ("poster", "backdrop"):
                    print(f"    {_ok(True)} {a.asset_type:<15} {(a.url or '')[:80]}")
            if not mi.assets and not poster_url:
                print(f"    {_ok(False)} no assets at all")

            if mi.videos:
                for v in mi.videos[:3]:
                    print(f"    video: {v.video_type or 'video'} - {v.url[:80]}")
            else:
                print(f"    {_ok(False)} no videos")

            if mi.genres:
                print(f"    genres: {[g.genre.name for g in mi.genres]}")
            else:
                print(f"    {_ok(False)} no genres")

            eid_result = await session.execute(
                select(ExternalID).where(
                    ExternalID.entity_type == "media_item",
                    ExternalID.entity_id == mi.id,
                )
            )
            eids = eid_result.scalars().all()
            print(f"    external_ids: {[(e.provider, e.external_id) for e in eids]}")

        # ── ALBUMS ──────────────────────────────────────────────
        result = await session.execute(
            select(MediaItem)
            .options(
                selectinload(MediaItem.album),
                selectinload(MediaItem.genres).selectinload(MediaGenre.genre),
                selectinload(MediaItem.assets),
                selectinload(MediaItem.credits).selectinload(MediaCredit.person),
                selectinload(MediaItem.involved_companies).selectinload(InvolvedCompany.company),
            )
            .where(MediaItem.media_type == "music")
            .order_by(MediaItem.title)
        )
        albums = result.unique().scalars().all()

        print(f"\n{'='*70}")
        print(f"  ALBUMS ({len(albums)})")
        print(f"{'='*70}")

        for mi in albums:
            a = mi.album
            print(f"\n  ▸ {mi.title}  (id={mi.id})")
            print(f"    {_ok(bool(mi.overview))} overview        {(mi.overview or '')[:80]}")
            print(f"    {_ok(mi.release_date is not None)} release_date    {mi.release_date or ''}")
            print(f"    {_ok(bool(mi.slug))} slug            {mi.slug}")
            print(f"    {_ok(bool(a.release_type))} release_type    {a.release_type}")
            print(f"    {_ok(bool(a.catalog_number))} catalog_number  {a.catalog_number or ''}")
            print(f"    {_ok(bool(a.barcode))} barcode         {a.barcode or ''}")
            print(f"    {_ok(a.track_count > 0)} track_count     {a.track_count}")
            print(f"    {_ok(a.disc_count is not None)} disc_count      {a.disc_count}")
            print(f"    {_ok(bool(a.duration_ms))} duration_ms     {a.duration_ms or ''}")

            # ASSETS
            print(f"    {'ASSETS':─<50}")
            poster_url = mi.poster_url
            print(f"    {_ok(bool(poster_url))} poster          {(poster_url or '')[:80]}")
            for a_item in mi.assets:
                print(f"    {_ok(True)} {a_item.asset_type:<15} {(a_item.url or '')[:80]}")
            if not mi.assets and not poster_url:
                print(f"    {_ok(False)} no cover art")

            # Tracks
            print(f"    {'TRACKS':─<50}")
            result2 = await session.execute(
                select(Track)
                .options(selectinload(Track._external_ids))
                .where(Track.album_id == mi.id)
                .order_by(Track.disc_number, Track.track_number)
            )
            tracks = result2.scalars().all()
            for t in tracks:
                has_mbid = bool(t.musicbrainz_recording_id)
                bool(t.isrc)
                has_dur = t.duration_ms is not None
                dur_str = f"{t.duration_ms // 1000}s" if has_dur else "?"
                all_ids = f"mbid={t.musicbrainz_recording_id or '-':<20} isrc={t.isrc or '-'}"
                print(f"    {_ok(has_mbid)} {t.disc_number}.{t.track_number:02d} {t.title[:42]:<42} dur={dur_str:>5}  {all_ids}")
            if not tracks:
                print(f"    {_ok(False)} no tracks")

            # External IDs
            eid_result = await session.execute(
                select(ExternalID).where(
                    ExternalID.entity_type == "media_item",
                    ExternalID.entity_id == mi.id,
                )
            )
            eids = eid_result.scalars().all()
            print(f"    external_ids: {[(e.provider, e.external_id) for e in eids]}")

            if mi.genres:
                print(f"    genres:  {[g.genre.name for g in mi.genres]}")
            if mi.credits:
                print(f"    artists: {[(c.person.name, c.role) for c in mi.credits]}")
            if mi.involved_companies:
                print(f"    labels:  {[ic.company.name for ic in mi.involved_companies]}")

        # ── PEOPLE ──────────────────────────────────────────────
        seed_names = [
            "Keanu Reeves",
            "Leonardo DiCaprio",
            "Christopher Nolan",
            "Quentin Tarantino",
            "Tom Hanks",
        ]
        print(f"\n{'='*70}")
        print(f"  PEOPLE ({len(seed_names)} seeded)")
        print(f"{'='*70}")

        for name in seed_names:
            result = await session.execute(
                select(Person)
                .options(selectinload(Person._external_ids))
                .where(Person.name == name)
            )
            p = result.scalar()
            if not p:
                print(f"\n  ▸ {name} — NOT FOUND")
                continue
            print(f"\n  ▸ {p.name}  (id={p.id})")
            print(f"    {_ok(bool(p.biography))} biography       {(p.biography or '')[:100]}")
            print(f"    {_ok(p.birthday is not None)} birthday        {p.birthday or ''}")
            print(f"    {_ok(p.deathday is not None)} deathday        {p.deathday or ''}")

            # External IDs via descriptor
            print(f"    {'EXTERNAL IDs':─<50}")
            ext_checks = [
                ("tmdb_id", p.tmdb_id),
                ("imdb_id", p.imdb_id),
                ("wikidata_id", p.wikidata_id),
                ("musicbrainz_artist_id", p.musicbrainz_artist_id),
                ("spotify_artist_id", p.spotify_artist_id),
                ("youtube_channel_id", p.youtube_channel_id),
            ]
            for ename, evalue in ext_checks:
                print(f"    {_ok(bool(evalue))} {ename:<24} {evalue or ''}")

            # Profile image
            profile_url = getattr(p, "profile_image_url", None)
            print(f"    {_ok(bool(profile_url))} profile_image   {(profile_url or '')[:80]}")

        # ── GLOBAL TOTALS ───────────────────────────────────────
        print(f"\n{'='*70}")
        print("  G L O B A L   T O T A L S")
        print(f"{'='*70}")

        # Media items by type
        result = await session.execute(
            text(
                "SELECT media_type, COUNT(*) FROM media_items "
                "GROUP BY media_type ORDER BY COUNT(*) DESC"
            )
        )
        print("\n  MEDIA ITEMS by type:")
        for r in result:
            print(f"    {r[0]:<10} {r[1]}")

        # People
        result = await session.execute(text("SELECT COUNT(*) FROM people"))
        print(f"\n  PEOPLE:           {result.scalar()}")

        # Media assets by type
        result = await session.execute(
            text(
                "SELECT asset_type, COUNT(*) FROM media_assets "
                "GROUP BY asset_type ORDER BY COUNT(*) DESC"
            )
        )
        print("\n  MEDIA ASSETS by type:")
        for r in result:
            print(f"    {r[0]:<20} {r[1]}")

        # Videos
        result = await session.execute(text("SELECT COUNT(*) FROM media_videos"))
        print(f"\n  MEDIA VIDEOS:     {result.scalar()}")

        # External ratings
        result = await session.execute(text("SELECT COUNT(*) FROM external_ratings"))
        print(f"  EXT RATINGS:      {result.scalar()}")

        # Releases
        result = await session.execute(text("SELECT COUNT(*) FROM media_releases"))
        print(f"  MEDIA RELEASES:   {result.scalar()}")

        # External IDs by entity type
        result = await session.execute(
            text(
                "SELECT COALESCE(entity_type, '(null — legacy)'), COUNT(*) "
                "FROM external_ids GROUP BY entity_type ORDER BY COUNT(*) DESC"
            )
        )
        print("\n  EXTERNAL IDs by entity_type:")
        for r in result:
            print(f"    {r[0]:<25} {r[1]}")

        # Companies, collections
        result = await session.execute(text("SELECT COUNT(*) FROM companies"))
        print(f"\n  COMPANIES:        {result.scalar()}")
        result = await session.execute(text("SELECT COUNT(*) FROM collections"))
        print(f"  COLLECTIONS:      {result.scalar()}")
        result = await session.execute(text("SELECT COUNT(*) FROM genres"))
        print(f"  GENRES:           {result.scalar()}")
        result = await session.execute(text("SELECT COUNT(*) FROM keywords"))
        print(f"  KEYWORDS:         {result.scalar()}")
        result = await session.execute(text("SELECT COUNT(*) FROM tracks"))
        print(f"  TRACKS:           {result.scalar()}")

    await dispose_engine()


def main() -> None:
    asyncio.run(report())


if __name__ == "__main__":
    main()
