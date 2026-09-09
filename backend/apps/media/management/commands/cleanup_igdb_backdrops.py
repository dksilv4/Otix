"""Delete IGDB backdrop assets that aren't landscape (e.g. white-bg logo cards).

Older IGDB artwork ingests stored every ``artworks`` image as a ``backdrop`` row,
and IGDB artworks mix wide scenic key art with near-square, white-background logo
cards — so logo images leak into the backdrop set (rendered in the manage
chooser, discover cards and the artwork sweep). This one-time sweep measures each
existing ``provider="igdb"`` ``asset_type="backdrop"`` image (row width/height
when stored, otherwise a streaming JPEG/PNG header read of the image URL) and
deletes rows whose aspect is below the ingest threshold. Mirrored local files are
freed first; rows that survive get their fetched dimensions backfilled so the
chooser can reason about framing without refetching. Idempotent: re-running only
touches rows still above/below the threshold.

Matches the ingest rule in ``igdb_ingest._BACKDROP_MIN_ASPECT``. ``--dry-run``
reports scope without touching the DB or disk.
"""

from __future__ import annotations

import httpx
from django.core.management.base import BaseCommand

from apps.media.models import MediaAsset
from apps.media.services import assets as assets_service
from apps.media.services.igdb_ingest import _BACKDROP_MIN_ASPECT

_TIMEOUT = httpx.Timeout(20.0)
# SOF markers for a JPEG are near the file start; reading more than this without
# finding one means the body isn't a parseable JPEG we understand.
_READ_CAP = 1 << 20  # 1 MiB


def _image_dims(url: str) -> tuple[int, int] | None:
    """Width/height of ``url``'s image via a bounded streaming header read.

    Returns None when the image can't be fetched or isn't a JPEG/PNG/WebP we can
    parse — the caller treats an unknown aspect conservatively.
    """
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as client:
            with client.stream("GET", url) as response:
                if response.status_code != 200:
                    return None
                buf = bytearray()
                for chunk in response.iter_bytes(chunk_size=65536):
                    buf += chunk
                    dims = _probe_dims(bytes(buf))
                    if dims is not None:
                        return dims
                    if len(buf) >= _READ_CAP:
                        return None
                return _probe_dims(bytes(buf))
    except httpx.HTTPError:
        return None


def _probe_dims(buf: bytes) -> tuple[int, int] | None:
    if buf.startswith(b"\x89PNG\r\n\x1a\n"):
        if len(buf) < 24:
            return None
        return (
            int.from_bytes(buf[16:20], "big"),
            int.from_bytes(buf[20:24], "big"),
        )
    if len(buf) >= 12 and buf[0:4] == b"RIFF" and buf[8:12] == b"WEBP":
        return _webp_dims(buf)
    return _jpeg_dims(buf)


def _webp_dims(buf: bytes) -> tuple[int, int] | None:
    """Width/height from a WebP container (VP8X extended / VP8L / VP8 lossy).

    IGDB artwork uploads keep their original container, so some ``.jpg`` URLs
    actually serve WebP; the canvas dims live in the container header.
    """
    fourcc = buf[12:16]
    if fourcc == b"VP8X":  # canvas size (minus one) as 24-bit LE at 24..29
        if len(buf) < 30:
            return None
        return (
            int.from_bytes(buf[24:27], "little") + 1,
            int.from_bytes(buf[27:30], "little") + 1,
        )
    if fourcc == b"VP8L":  # packed 14-bit (w-1)/(h-1) after the 0x2F signature
        if len(buf) < 25 or buf[20] != 0x2F:
            return None
        packed = int.from_bytes(buf[21:25], "little")
        return (
            (packed & 0x3FFF) + 1,
            ((packed >> 14) & 0x3FFF) + 1,
        )
    if fourcc == b"VP8 ":  # lossy key frame: dims after the 3-byte start code
        if len(buf) < 30 or buf[23:26] != b"\x9d\x01\x2a":
            return None
        width = (buf[26] | (buf[27] << 8)) & 0x3FFF
        height = (buf[28] | (buf[29] << 8)) & 0x3FFF
        return (width, height) if width and height else None
    return None


def _jpeg_dims(buf: bytes) -> tuple[int, int] | None:
    """Width/height from a JPEG SOF marker, or None until the header is found.

    Rescanned from the start each call, so a mid-stream "not yet" is harmless:
    the next chunk re-runs over the fuller buffer.
    """
    n = len(buf)
    if n < 2 or buf[0] != 0xFF or buf[1] != 0xD8:
        return None
    i = 2
    while i + 1 < n:
        if buf[i] != 0xFF:
            return None
        marker = buf[i + 1]
        if marker == 0xFF:
            i += 1
            continue
        if marker == 0xD9:  # EOI before any SOF: not a parseable frame
            return None
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:  # standalone, no length
            i += 2
            continue
        if i + 3 >= n:
            return None  # length bytes not buffered yet
        seg_len = (buf[i + 2] << 8) | buf[i + 3]
        if seg_len < 2:
            return None
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            if i + 9 > n:
                return None
            return (
                (buf[i + 7] << 8) | buf[i + 8],  # width
                (buf[i + 5] << 8) | buf[i + 6],  # height
            )
        i += 2 + seg_len
    return None


class Command(BaseCommand):
    help = (
        "Delete non-landscape IGDB 'backdrop' assets (white-bg logo cards), "
        "freeing mirrored local files."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Cap rows scanned at this many (default: all).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be deleted without writing the DB or disk.",
        )

    def handle(self, *args, **options) -> None:
        limit = options["limit"]
        dry_run = options["dry_run"]

        qs = (
            MediaAsset.objects.filter(provider="igdb", asset_type="backdrop")
            .order_by("id")
            .iterator(chunk_size=1000)
        )
        scanned = kept = deleted = unknown = freed = 0
        for asset in qs:
            if limit is not None and scanned >= limit:
                break
            if asset.width and asset.height:
                w, h = asset.width, asset.height
            else:
                dims = _image_dims(asset.url)
                if dims is None:
                    unknown += 1
                    scanned += 1
                    continue
                w, h = dims
            scanned += 1

            if w / h >= _BACKDROP_MIN_ASPECT:
                kept += 1
                if not asset.width or not asset.height:
                    asset.width = w
                    asset.height = h
                    asset.save(update_fields=["width", "height"])
                continue

            deleted += 1
            if not dry_run:
                freed += assets_service._discard_local_copy(asset)
                asset.delete()
            if dry_run and deleted <= 10:
                self.stdout.write(f"[dry-run] delete asset {asset.pk} media {asset.media_item_id}")
                self.stdout.write(f"    {asset.url} ({w}x{h})")

        action = "would delete" if dry_run else "deleted"
        self.stdout.write(
            f"scanned={scanned} kept={kept} {action}={deleted} "
            f"unknown={unknown} bytes_freed={freed}"
        )
