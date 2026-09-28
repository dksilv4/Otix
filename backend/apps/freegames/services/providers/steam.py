"""Steam Store free-to-keep promotions provider.

Scrapes Steam search results sorted by price ascending with the specials
filter — the same approach as the desktop Steam plugin — and keeps only
100%-off titles.
"""

from __future__ import annotations

import logging
import re

import httpx

from apps.freegames.services.base import BaseFreeGamesProvider, FreeGameItem

logger = logging.getLogger(__name__)

STEAM_SEARCH_URL = (
    "https://store.steampowered.com/search/results/"
    "?query=&dynamic_data=&sort_by=Price_ASC&specials=1"
    "&cc={country}&l=english&page={page}"
)

_APPID_RE = re.compile(r'^="(\d+)"')
_TITLE_RE = re.compile(r'<span class="title">([^<]+)</span>')
_ORIG_PRICE_RE = re.compile(r'discount_original_price">([^<]+)</div>')
_SECTION_SPLIT_RE = re.compile(r"<a[^>]*data-ds-appid")

# Portrait library art + hero — same CDN assets the Steam source plugin uses.
# Search capsules (184x69 / 616x353) are landscape and too soft for MediaCard.
# Do NOT invent logo.png — many apps (esp. DLC) 404, and MediaCard then shows a
# broken overlay. Logos come from SteamGrid / catalog hydration when available.
_STEAM_CDN = "https://cdn.akamai.steamstatic.com/steam/apps/{app_id}"


def _steam_artwork(app_id: str) -> tuple[str, str, None]:
    base = _STEAM_CDN.format(app_id=app_id)
    return (
        f"{base}/library_600x900.jpg",
        f"{base}/library_hero.jpg",
        None,
    )


class SteamFreeGamesProvider(BaseFreeGamesProvider):
    """Fetches 100%-off free-to-keep titles from Steam search specials."""

    def __init__(
        self,
        *,
        country: str = "us",
        max_pages: int = 3,
        timeout: float = 15.0,
    ):
        self._country = country
        self._max_pages = max_pages
        self._timeout = timeout

    @property
    def store_id(self) -> str:
        return "steam"

    @property
    def store_name(self) -> str:
        return "Steam"

    def fetch_free_games(self) -> list[FreeGameItem]:
        """Scrape Steam specials pages for currently free-to-keep games."""
        seen: set[str] = set()
        items: list[FreeGameItem] = []

        headers = {
            "User-Agent": ("Mozilla/5.0 (compatible; OtixFreeGames/1.0; +https://otix.app)"),
            "Accept-Language": "en-US,en;q=0.9",
        }

        try:
            with httpx.Client(
                timeout=self._timeout, headers=headers, follow_redirects=True
            ) as client:
                for page in range(1, self._max_pages + 1):
                    url = STEAM_SEARCH_URL.format(country=self._country, page=page)
                    try:
                        resp = client.get(url)
                        resp.raise_for_status()
                        html = resp.text
                    except Exception:
                        logger.exception("Steam free games search page %s failed", page)
                        break

                    page_items, section_count = self._parse_page(html)
                    for item in page_items:
                        if item.external_id in seen:
                            continue
                        seen.add(item.external_id or item.id)
                        items.append(item)

                    logger.info(
                        "Steam search page %s: %s free games found",
                        page,
                        len(page_items),
                    )

                    # Steam pages typically hold ~25 results; fewer means last page.
                    if section_count < 25:
                        break
        except Exception:
            logger.exception("Failed to fetch Steam free games")
            return []

        return items

    def _parse_page(self, html: str) -> tuple[list[FreeGameItem], int]:
        sections = _SECTION_SPLIT_RE.split(html)
        items: list[FreeGameItem] = []

        for section in sections[1:]:
            if 'data-discount="100"' not in section and "-100%" not in section:
                continue

            appid_match = _APPID_RE.match(section)
            title_match = _TITLE_RE.search(section)
            if not appid_match or not title_match:
                continue

            app_id = appid_match.group(1)
            title = title_match.group(1).strip()
            if not title:
                continue

            orig_match = _ORIG_PRICE_RE.search(section)
            original_price = orig_match.group(1).strip() if orig_match else None
            poster_url, backdrop_url, logo_url = _steam_artwork(app_id)

            items.append(
                FreeGameItem(
                    id=f"steam:{app_id}",
                    store=self.store_id,
                    store_name=self.store_name,
                    title=title,
                    description=None,
                    original_price=original_price,
                    discount_percentage=100,
                    is_free_now=True,
                    start_date=None,
                    end_date=None,
                    claim_url=f"https://store.steampowered.com/app/{app_id}",
                    poster_url=poster_url,
                    backdrop_url=backdrop_url,
                    logo_url=logo_url,
                    external_id=app_id,
                    raw_data={"appId": int(app_id)},
                )
            )

        return items, len(sections)
