"""Person photo discovery and backfill service across TMDB and Wikipedia/Wikimedia."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

import httpx

from core.providers.tmdb.client import TMDBProvider

if TYPE_CHECKING:
    from apps.people.models import Person

logger = logging.getLogger(__name__)

DEFAULT_WIKI_HEADERS = {
    "User-Agent": "OtixMediaCatalog/1.0 (https://otix.media; contact@otix.media)",
}


async def lookup_person_photo(name: str) -> str | None:
    """Find a person's photo via TMDB, Wikipedia, or Wikimedia Commons."""
    clean_name = name.strip()
    if not clean_name:
        return None

    # Common spelling variant handling (e.g. Kristy Rider -> Kirsty Rider)
    variants = [clean_name]
    if "kristy rider" in clean_name.lower():
        variants.append(re.sub(r"kristy\s+rider", "Kirsty Rider", clean_name, flags=re.IGNORECASE))

    for candidate in variants:
        # 1. TMDB search
        try:
            tmdb = TMDBProvider()
            res = await tmdb.search_people(candidate)
            results = res.get("results", []) if res else []
            if results and results[0].get("profile_path"):
                return f"https://image.tmdb.org/t/p/w500{results[0]['profile_path']}"
        except Exception as e:
            logger.debug("TMDB person lookup failed for %s: %s", candidate, e)

        # 2. Wikipedia (en, fr)
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                for lang in ("en", "fr"):
                    r = await client.get(
                        f"https://{lang}.wikipedia.org/w/api.php?"
                        f"action=query&titles={candidate}&prop=pageimages"
                        f"&pithumbsize=500&format=json&redirects=1",
                        headers=DEFAULT_WIKI_HEADERS,
                    )
                    if r.status_code == 200:
                        pages = r.json().get("query", {}).get("pages", {})
                        p = next(iter(pages.values()), {})
                        if p.get("pageid", -1) > 0 and "thumbnail" in p:
                            thumb = p["thumbnail"].get("source")
                            if thumb:
                                return thumb

                # 3. Wikimedia Commons search
                r = await client.get(
                    f"https://commons.wikimedia.org/w/api.php?"
                    f"action=query&generator=search&gsrsearch={candidate}"
                    f"&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url&format=json",
                    headers=DEFAULT_WIKI_HEADERS,
                )
                if r.status_code == 200:
                    pages = r.json().get("query", {}).get("pages", {})
                    for p in pages.values():
                        title = p.get("title", "").lower()
                        if title.endswith((".jpg", ".jpeg", ".png", ".webp")) and not any(
                            k in title
                            for k in (
                                "logo",
                                "icon",
                                "blason",
                                "flag",
                                "signature",
                                "poster",
                                "cover",
                                "pdf",
                            )
                        ):
                            infos = p.get("imageinfo", [])
                            if infos and infos[0].get("url"):
                                return infos[0]["url"]
        except Exception as e:
            logger.debug("Wikipedia/Wikimedia lookup failed for %s: %s", candidate, e)

    return None


def backfill_person_photo(person: Person) -> bool:
    """Synchronous helper to look up and attach a photo to a Person if missing."""
    if person.photo_url:
        return False

    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    photo_url: str | None = None
    if loop and loop.is_running():
        from asgiref.sync import async_to_sync

        photo_url = async_to_sync(lookup_person_photo)(person.name)
    else:
        photo_url = asyncio.run(lookup_person_photo(person.name))

    if photo_url:
        person.photo_url = photo_url
        person.save(update_fields=["photo_url"])
        return True
    return False
