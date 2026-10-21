"""Image URL normalization to prevent Mixed Content and localhost leakage."""

from __future__ import annotations

import re
import urllib.parse

# Upload URL regex: matches /uploads/<32-hex-uuid>.<ext> or /api/v1/uploads/<32-hex-uuid>.<ext>
UPLOAD_URL_RE = re.compile(
    r"/(?:api/v1/)?uploads/([0-9a-f]{32}\.[a-z0-9]+)$",
    re.IGNORECASE,
)

# Known external CDNs that support HTTPS
HTTPS_CDNS = (
    "steamstatic.com",
    "steamcontent.com",
    "steamcommunity.com",
    "tmdb.org",
    "themoviedb.org",
    "googleusercontent.com",
    "gravatar.com",
    "igdb.com",
    "steamgriddb.com",
    "fanart.tv",
    "thetvdb.com",
    "tvdb.com",
)


def _is_local_or_private(host: str) -> bool:
    """True when host is localhost, loopback, testserver, or a private LAN IP."""
    h = host.lower().split(":")[0]
    return (
        h == "localhost"
        or h == "127.0.0.1"
        or h == "testserver"
        or h == "0.0.0.0"
        or h.startswith("192.168.")
        or h.startswith("10.")
        or bool(re.match(r"^172\.(1[6-9]|2[0-9]|3[0-1])\.", h))
    )


def clean_image_url(url: str | None) -> str | None:
    """Normalize image URLs to prevent Mixed Content.

    1. Local upload URLs on otix.app, internal docker hosts, or public domains
       are normalized to root-relative /uploads/<hex>.<ext>.
    2. Any http:// URLs on otix.app or www.otix.app are upgraded to https://.
    3. Any http:// URLs for known HTTPS CDNs are upgraded to https://.
    4. Local development URLs (localhost / testserver) are preserved for tests.
    """
    if not url:
        return url
    val = url.strip()
    if not val:
        return None

    # Check for upload pattern (whether absolute with http/https or relative)
    match = UPLOAD_URL_RE.search(val)
    if match:
        filename = match.group(1)
        if val.startswith("/"):
            return f"/uploads/{filename}"
        lower = val.lower()
        if (
            "otix.app" in lower
            or lower.startswith("http://api:")
            or lower.startswith("http://api/")
            or lower.startswith("http://otix-api")
            or lower.startswith("https://api:")
            or lower.startswith("https://otix-api")
        ):
            return f"/uploads/{filename}"
        try:
            parsed = urllib.parse.urlsplit(val)
            if not _is_local_or_private(parsed.hostname or ""):
                return f"/uploads/{filename}"
        except Exception:
            pass

    # Upgrade otix.app http to https
    if val.startswith("http://otix.app/") or val.startswith("http://www.otix.app/"):
        return "https://" + val[len("http://") :]

    # Upgrade known CDNs that support HTTPS
    if val.startswith("http://"):
        lower = val.lower()
        if any(cdn in lower for cdn in HTTPS_CDNS):
            return "https://" + val[len("http://") :]

    return val
