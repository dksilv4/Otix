"""HTTP Range streaming helpers for Django-as-node file downloads."""

from __future__ import annotations

import re
from pathlib import Path

from django.http import FileResponse, HttpResponse, StreamingHttpResponse

_RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


def parse_byte_range(header: str | None, file_size: int) -> tuple[int, int] | None:
    if not header:
        return None
    match = _RANGE_RE.match(header.strip())
    if not match:
        return None
    start_raw, end_raw = match.group(1), match.group(2)
    if start_raw == "" and end_raw == "":
        return None
    if start_raw == "":
        # suffix bytes: bytes=-N
        try:
            length = int(end_raw)
        except ValueError:
            return None
        if length <= 0:
            return None
        start = max(0, file_size - length)
        end = file_size - 1
        return start, end
    try:
        start = int(start_raw)
    except ValueError:
        return None
    if end_raw == "":
        end = file_size - 1
    else:
        try:
            end = int(end_raw)
        except ValueError:
            return None
    if start < 0 or end < start or start >= file_size:
        return None
    end = min(end, file_size - 1)
    return start, end


def stream_file_response(
    path: str | Path,
    *,
    range_header: str | None = None,
    download_name: str | None = None,
) -> HttpResponse | StreamingHttpResponse | FileResponse:
    file_path = Path(path)
    if not file_path.is_file():
        return HttpResponse(status=404)

    file_size = file_path.stat().st_size
    filename = download_name or file_path.name
    content_type = "application/octet-stream"
    byte_range = parse_byte_range(range_header, file_size)

    if byte_range is None:
        handle = file_path.open("rb")
        response = FileResponse(
            handle, as_attachment=True, filename=filename, content_type=content_type
        )
        response["Accept-Ranges"] = "bytes"
        response["Content-Length"] = str(file_size)
        return response

    start, end = byte_range
    length = end - start + 1

    def iterator(chunk_size: int = 1024 * 1024):
        with file_path.open("rb") as handle:
            handle.seek(start)
            remaining = length
            while remaining > 0:
                chunk = handle.read(min(chunk_size, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    response = StreamingHttpResponse(iterator(), status=206, content_type=content_type)
    response["Content-Range"] = f"bytes {start}-{end}/{file_size}"
    response["Accept-Ranges"] = "bytes"
    response["Content-Length"] = str(length)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
