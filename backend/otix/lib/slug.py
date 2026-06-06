# TODO: Review this file
"""String -> URL-safe slug utility.

Shared across transformers and hydrators that need to generate slugs
from arbitrary text (company names, genre names, etc.).
"""

from __future__ import annotations

import re


def slugify(text: str) -> str:
    """Convert arbitrary text to a URL-safe slug."""
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    if len(slug) > 200:
        slug = slug[:200].rsplit("-", 1)[0]
    return slug
