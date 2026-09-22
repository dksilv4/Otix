"""Data transformers and sanitizers for normalizing provider payloads.

Utility functions for parsing messy upstream API data (dates, HTML-encoded strings,
unnormalized unicode, ratings) into consistent, clean representations.
"""

from __future__ import annotations

import hashlib
import html
import json
import math
import re
import unicodedata
from datetime import date
from typing import Any

# Regular expression patterns for supported date formats
_DATE_FULL_RE = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})")
_DATE_YEAR_MONTH_RE = re.compile(r"^(\d{4})-(\d{1,2})$")
_DATE_YEAR_ONLY_RE = re.compile(r"^(\d{4})$")


def parse_iso_date(raw: str | None) -> date | None:
    """Parse an ISO 8601 date string, truncated year, or timestamp into a date object.

    Supports:
        - Full ISO dates: "2024-05-12"
        - ISO timestamps: "2024-05-12T14:30:00Z"
        - Year and month: "2024-05" -> date(2024, 5, 1)
        - Year only: "2024" -> date(2024, 1, 1)

    Returns:
        date instance if parsing succeeds, None on empty, None, or invalid values.
    """
    if not raw or not isinstance(raw, str):
        return None

    s = raw.strip()
    if not s:
        return None

    try:
        # Check full date or ISO datetime prefix YYYY-MM-DD
        m = _DATE_FULL_RE.match(s)
        if m:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))

        # Check year-month YYYY-MM
        m = _DATE_YEAR_MONTH_RE.match(s)
        if m:
            return date(int(m.group(1)), int(m.group(2)), 1)

        # Check year-only YYYY
        m = _DATE_YEAR_ONLY_RE.match(s)
        if m:
            return date(int(m.group(1)), 1, 1)
    except (ValueError, OverflowError):
        return None

    return None


def sanitize_text(raw: str | None) -> str | None:
    """Clean, unescape, and normalize raw text from external providers.

    1. Unescapes HTML entities (&amp;, &quot;, &#39;, etc.).
    2. Normalizes unicode characters to canonical NFC form.
    3. Trims leading and trailing whitespace.
    4. Returns None if the input is None or becomes empty after trimming.
    """
    if raw is None or not isinstance(raw, str):
        return None

    unescaped = html.unescape(raw)
    normalized = unicodedata.normalize("NFC", unescaped)
    cleaned = normalized.strip()
    return cleaned if cleaned else None


def compute_payload_hash(data: Any) -> str:
    """Compute a deterministic SHA-256 hash of a payload dictionary or object.

    Keys are sorted to guarantee that dictionary ordering does not alter the hash.
    """
    serialized = json.dumps(data, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def clamp_rating(val: float | int, min_val: float = 0.0, max_val: float = 100.0) -> float:
    """Clamp a rating score into the range [min_val, max_val].

    Handles NaN and non-finite numbers safely by defaulting to min_val.
    """
    try:
        fval = float(val)
    except (ValueError, TypeError):
        return float(min_val)

    if math.isnan(fval) or math.isinf(fval):
        return float(min_val)

    return max(float(min_val), min(float(max_val), fval))
