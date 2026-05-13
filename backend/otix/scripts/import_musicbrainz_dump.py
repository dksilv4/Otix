"""Import MusicBrainz releases from mbdump.tar.bz2 flat files.

Streams through the tar.bz2, extracts release data to a temp file,
then batch-inserts MediaItem + Album records directly — no API calls,
no rate limits.

Usage:
    python -m otix.scripts.import_musicbrainz_dump /path/to/mbdump.tar.bz2 [limit]

    docker compose run --rm worker-slow python -m otix.scripts.import_musicbrainz_dump /data/mbdump.tar.bz2

The dump is available from:
    https://data.metabrainz.org/pub/musicbrainz/data/fullexport/
    Look for the latest dated directory, download mbdump.tar.bz2 (~7 GB).
"""

from __future__ import annotations

import csv
import io
import shlex
import os
import sys
import tarfile
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import TextIO

from sqlalchemy.dialects.postgresql import insert as pg_insert

from otix.domain.media import Album, ExternalID, MediaItem
from otix.infrastructure.database import async_session

# ── Release group primary type IDs (from musicbrainz schema) ──────────
_RELEASE_GROUP_TYPE: dict[int, str] = {
    1: "album",
    2: "single",
    3: "ep",
    4: "broadcast",
    5: "other",
    6: "compilation",
    7: "soundtrack",
    11: "live",
    12: "remix",
}

BATCH_SIZE = 5000


def _parse_tsv(fileobj: TextIO) -> csv.DictReader:
    return csv.DictReader(fileobj, delimiter="\t", quoting=csv.QUOTE_NONE)


def _null(val: str | None) -> str | None:
    if val is None or val == "\\N":
        return None
    return val


def _parse_date(year: str | None, month: str | None, day: str | None) -> date | None:
    y = _null(year)
    m = _null(month)
    d = _null(day)
    if y is None:
        return None
    try:
        return date(
            int(y),
            int(m) if m is not None else 1,
            int(d) if d is not None else 1,
        )
    except (ValueError, TypeError):
        return None


async def import_dump(dump_path: str, limit: int = 0) -> dict:
    """Import releases from a MusicBrainz mbdump.tar.bz2 file."""
    print(f"Opening {dump_path} ...")
    tar = tarfile.open(dump_path, "r|bz2")

    # ── Phase 1: Read helper tables into memory, save release data to temp ──
    print("Phase 1: Reading tables from dump ...")
    release_group_map: dict[str, dict] = {}  # id → {name, type}
    artist_credit_map: dict[str, str] = {}  # id → joined name
    release_country_dates: dict[str, date] = {}  # release_id → earliest date
    release_tmp_path: str | None = None
    release_tmp: TextIO | None = None
    release_row_count = 0

    for member in tar:
        name = member.name
        if not member.isfile():
            continue

        if name == "mbdump/release":
            size_mb = member.size / 1024 / 1024
            print(f"  Extracting release ({size_mb:.0f} MB) to temp file ...")
            f = tar.extractfile(member)
            if f is None:
                continue

            fd, release_tmp_path = tempfile.mkstemp(suffix=".tsv", prefix="mbdump_release_")
            os.close(fd)

            # Write release rows to temp file with an extra _date column.
            # The date is resolved later (after release_country is read), so we
            # write a placeholder first. After Phase 1, we sort the temp file by
            # _date DESC to prioritize newest releases.
            #
            # Strategy: write releases now, then in a second pass after sorting
            # we annotate with dates from release_country_dates.
            header_written = False
            with open(release_tmp_path, "w", encoding="utf-8") as tmp:
                reader = _parse_tsv(io.TextIOWrapper(f, encoding="utf-8"))
                writer = csv.writer(tmp, delimiter="\t", quoting=csv.QUOTE_NONE)
                fieldnames = list(reader.fieldnames or [])
                for row in reader:
                    if not header_written:
                        writer.writerow(fieldnames + ["_date"])
                        header_written = True
                    writer.writerow(
                        [row.get(fn, "") for fn in fieldnames]
                        + [""]  # _date placeholder
                    )
                    release_row_count += 1
            print(f"    {release_row_count:,} releases saved to {release_tmp_path}")

        elif name == "mbdump/release_group":
            size_mb = member.size / 1024 / 1024
            print(f"  Reading release_group ({size_mb:.0f} MB) ...")
            f = tar.extractfile(member)
            if f is None:
                continue
            reader = _parse_tsv(io.TextIOWrapper(f, encoding="utf-8"))
            for row in reader:
                rtype = row.get("type", "")
                release_group_map[row["id"]] = {
                    "name": row["name"],
                    "type": int(rtype) if rtype and rtype != "\\N" else 1,
                }
            print(f"    {len(release_group_map):,} release groups loaded")

        elif name == "mbdump/artist_credit":
            size_mb = member.size / 1024 / 1024
            print(f"  Reading artist_credit ({size_mb:.0f} MB) ...")
            f = tar.extractfile(member)
            if f is None:
                continue
            reader = _parse_tsv(io.TextIOWrapper(f, encoding="utf-8"))
            for row in reader:
                artist_credit_map[row["id"]] = row["name"]
            print(f"    {len(artist_credit_map):,} artist credits loaded")

        elif name == "mbdump/release_country":
            size_mb = member.size / 1024 / 1024
            print(f"  Reading release_country ({size_mb:.0f} MB) ...")
            f = tar.extractfile(member)
            if f is None:
                continue
            reader = _parse_tsv(io.TextIOWrapper(f, encoding="utf-8"))
            for row in reader:
                rid = row["release"]
                parsed = _parse_date(
                    row.get("date_year"), row.get("date_month"), row.get("date_day")
                )
                if parsed:
                    cur = release_country_dates.get(rid)
                    if cur is None or parsed < cur:
                        release_country_dates[rid] = parsed
            print(f"    {len(release_country_dates):,} releases with dates")

        else:
            continue

    tar.close()
    print(
        f"Phase 1 complete. {release_row_count:,} releases, "
        f"{len(release_group_map):,} release groups, "
        f"{len(artist_credit_map):,} artist credits"
    )

    if not release_tmp_path:
        print("Error: no release data found in dump")
        return {"imported": 0, "skipped": 0, "total": 0}

    # ── Phase 1.5: Annotate releases with dates, filter, and sort ──────
    print("\nAnnotating releases with dates and sorting by newest first ...")
    dated_tmp_path = tempfile.mktemp(suffix=".tsv", prefix="mbdump_dated_")

    with_dates = 0
    without_dates = 0
    with open(release_tmp_path, "r", encoding="utf-8") as inf, \
         open(dated_tmp_path, "w", encoding="utf-8") as outf:
        reader = _parse_tsv(inf)
        fieldnames = list(reader.fieldnames or [])

        # Verify _date column exists
        if "_date" not in fieldnames:
            print("Error: _date column missing from release data")
            return {"imported": 0, "skipped": 0, "total": 0}

        writer = csv.writer(outf, delimiter="\t", quoting=csv.QUOTE_NONE)
        writer.writerow(fieldnames)

        for release in reader:
            rid = release.get("id", "")
            rel_date = release_country_dates.get(rid)
            if rel_date is None:
                without_dates += 1
                continue  # skip entries without any release date

            with_dates += 1
            release["_date"] = rel_date.isoformat()
            writer.writerow([release.get(fn, "") for fn in fieldnames])

    os.unlink(release_tmp_path)

    print(f"  {with_dates:,} releases have dates, {without_dates:,} skipped (no date)")

    # Sort by _date DESC (newest first) using Unix sort for large files
    sorted_tmp_path = tempfile.mktemp(suffix=".tsv", prefix="mbdump_sorted_")
    print("  Sorting by date (newest first) ...")
    os.system(
        f"head -1 {shlex.quote(dated_tmp_path)} > {shlex.quote(sorted_tmp_path)} && "
        f"tail -n +2 {shlex.quote(dated_tmp_path)} | "
        f"sort -t$'\\t' -k{fieldnames.index('_date') + 1} -r >> {shlex.quote(sorted_tmp_path)}"
    )
    os.unlink(dated_tmp_path)
    print("  Sort complete.")

    # ── Phase 2: Process sorted release data, batch insert ──────────────
    print("\nPhase 2: Inserting into database ...")
    imported = 0
    skipped = 0
    batch_media: list[dict] = []
    batch_albums: list[dict] = []
    batch_ext_ids: list[dict] = []

    with open(sorted_tmp_path, "r", encoding="utf-8") as tmp:
        reader = _parse_tsv(tmp)
        for release in reader:
            if limit and imported >= limit:
                break

            mbid = _null(release.get("gid"))
            if not mbid:
                skipped += 1
                continue

            title = release.get("name", "Unknown Release")
            artist_credit_id = release.get("artist_credit", "")
            artist_name = (
                artist_credit_map.get(artist_credit_id, "") if artist_credit_id else ""
            )

            rg = release_group_map.get(release.get("release_group", ""), {})
            rg_name = rg.get("name", title)
            rg_type = rg.get("type", 1)
            release_type = _RELEASE_GROUP_TYPE.get(rg_type, "album")

            if release_type in ("broadcast",):
                skipped += 1
                continue

            barcode = _null(release.get("barcode"))
            display_title = (
                rg_name if rg_name and len(rg_name) > len(title) else title
            )

            # Parse date from pre-computed _date column (ISO format)
            rel_date = None
            date_str = release.get("_date", "")
            if date_str:
                try:
                    rel_date = date.fromisoformat(date_str)
                except (ValueError, TypeError):
                    pass

            batch_media.append({
                "media_type": "music",
                "title": display_title[:1000],
                "overview": artist_name[:5000] if artist_name else None,
                "slug": "",
                "release_date": rel_date,
                "popularity": 0.0,
                "original_language": None,
                "synced_at": datetime.now(timezone.utc),
                "next_sync_at": datetime.now(timezone.utc) + timedelta(days=30),
            })

            batch_albums.append({
                "release_type": release_type,
                "track_count": 0,
                "disc_count": 0,
                "musicbrainz_id": mbid,
                "musicbrainz_release_group_id": release.get("release_group", ""),
                "catalog_number": None,
                "barcode": barcode,
            })

            batch_ext_ids.append({
                "provider": "musicbrainz",
                "external_id": mbid,
                "content_hash": "",
            })

            if len(batch_media) >= BATCH_SIZE:
                count = await _flush_batch(batch_media, batch_albums, batch_ext_ids)
                imported += count
                batch_media.clear()
                batch_albums.clear()
                batch_ext_ids.clear()
                pct = (imported / max(release_row_count, 1)) * 100
                print(f"  Imported {imported:,}/{release_row_count:,} ({pct:.1f}%)")

    # Final batch
    if batch_media:
        count = await _flush_batch(batch_media, batch_albums, batch_ext_ids)
        imported += count

    # Clean up temp files
    for p in (sorted_tmp_path, dated_tmp_path, release_tmp_path):
        try:
            os.unlink(p)
        except (OSError, TypeError):
            pass

    print(f"\nDone. Imported: {imported:,}  Skipped: {skipped:,}  "
          f"Total releases: {release_row_count:,}  "
          f"With dates: {with_dates:,}  Without dates: {without_dates:,}")
    return {"imported": imported, "skipped": skipped, "total": release_row_count}


async def _flush_batch(
    batch_media: list[dict],
    batch_albums: list[dict],
    batch_ext_ids: list[dict],
) -> int:
    """Insert a batch of releases. Returns number inserted."""
    from uuid import uuid4

    async with async_session() as session:
        # Pre-check: skip musicbrainz_ids already in the DB
        existing_mbids = set()
        mbids_in_batch = [
            a["musicbrainz_id"] for a in batch_albums if a["musicbrainz_id"]
        ]
        if mbids_in_batch:
            from sqlalchemy import select as sa_select
            result = await session.execute(
                sa_select(Album.musicbrainz_id).where(
                    Album.musicbrainz_id.in_(mbids_in_batch)
                )
            )
            existing_mbids = {row[0] for row in result.fetchall()}

        # Filter out already-existing albums
        fresh_media = []
        fresh_albums = []
        fresh_exts = []
        for i, album in enumerate(batch_albums):
            if album["musicbrainz_id"] in existing_mbids:
                continue
            fresh_media.append(batch_media[i])
            fresh_albums.append(album)
            fresh_exts.append(batch_ext_ids[i])

        if not fresh_media:
            await session.commit()
            return 0

        # 1. Insert media_items, returning generated IDs
        insert_stmt = (
            pg_insert(MediaItem)
            .values(
                [{**m, "id": f"oti_{uuid4().hex[:12]}"} for m in fresh_media]
            )
            .returning(MediaItem.id)
        )
        result = await session.execute(insert_stmt)
        media_ids = [row[0] for row in result.fetchall()]

        # 2. Insert albums linked to media_items
        for i, album in enumerate(fresh_albums):
            album["media_item_id"] = media_ids[i]
        await session.execute(
            pg_insert(Album)
            .values(fresh_albums)
            .on_conflict_do_nothing(constraint="albums_musicbrainz_id_key")
        )

        # 3. Insert external_ids linked to media_items
        for i, ext in enumerate(fresh_exts):
            ext["media_item_id"] = media_ids[i]
        await session.execute(pg_insert(ExternalID).values(fresh_exts))

        await session.commit()
        return len(media_ids)


async def main():
    if len(sys.argv) < 2:
        print(
            "Usage: python -m otix.scripts.import_musicbrainz_dump "
            "<path/to/mbdump.tar.bz2> [limit]"
        )
        sys.exit(1)

    dump_path = sys.argv[1]
    if not Path(dump_path).exists():
        print(f"Error: file not found: {dump_path}")
        sys.exit(1)

    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    stats = await import_dump(dump_path, limit=limit)
    print(f"\nImport complete: {stats}")


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
