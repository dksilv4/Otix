"""Steam Store free-to-keep promotions provider.

Scrapes Steam search results sorted by price ascending with the specials
filter — the same approach as the desktop Steam plugin — and keeps only
100%-off titles.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from apps.freegames.services.base import BaseFreeGamesProvider, FreeGameItem

logger = logging.getLogger(__name__)

STEAM_SEARCH_URL = (
    "https://store.steampowered.com/search/results/"
    "?query=&dynamic_data=&sort_by=Price_ASC&specials=1"
    "&cc={country}&l=english&page={page}"
)

_ROW_RE = re.compile(
    r'<a\s+[^>]*href="(?P<url>https://store\.steampowered\.com/(?P<kind>app|sub|bundle)/(?P<id>\d+)[^"]*)"[^>]*>(?P<content>.*?)(?=</a>)',
    re.DOTALL,
)
_TITLE_RE = re.compile(r'<span class="title">([^<]+)</span>')
_ORIG_PRICE_RE = re.compile(r'discount_original_price">([^<]+)</div>')
_IMG_RE = re.compile(r'<img[^>]*src="([^"]+)"')
_SECTION_SPLIT_RE = re.compile(r"<a[^>]*data-ds-appid")
_APPID_RE = re.compile(r'^="(\d+)"')

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


def _infer_base_game_title(title: str) -> str | None:
    """Infer base game title from DLC/pack title delimiters."""
    for sep in (": ", " - ", " – ", " — "):
        if sep in title:
            base = title.split(sep, 1)[0].strip()
            if base:
                return base
    return None


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

                    page_items, section_count = self._parse_page(html, client=client)
                    for item in page_items:
                        key = item.external_id or item.id
                        if key in seen:
                            continue
                        seen.add(key)
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

    def _fetch_appdetails(self, client: httpx.Client, app_id: str) -> dict | None:
        """Fetch Steam app details to detect DLCs and identify parent games."""
        try:
            resp = client.get(
                f"https://store.steampowered.com/api/appdetails?appids={app_id}",
                timeout=5.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                entry = data.get(str(app_id), {})
                if entry.get("success"):
                    return entry.get("data")
        except Exception:
            logger.debug("Steam appdetails fetch failed for appid %s", app_id)
        return None

    def _parse_page(
        self, html: str, client: httpx.Client | None = None
    ) -> tuple[list[FreeGameItem], int]:
        items: list[FreeGameItem] = []
        matches = list(_ROW_RE.finditer(html))

        if matches:
            total_sections = len(matches)
            for m in matches:
                full_tag = m.group(0)
                content = m.group("content")
                if 'data-discount="100"' not in full_tag and "-100%" not in full_tag:
                    continue

                kind = m.group("kind")  # "app", "sub", or "bundle"
                item_id = m.group("id")

                title_match = _TITLE_RE.search(content)
                if not title_match:
                    continue
                title = title_match.group(1).strip()
                if not title:
                    continue

                orig_match = _ORIG_PRICE_RE.search(content)
                original_price = orig_match.group(1).strip() if orig_match else None

                img_match = _IMG_RE.search(content)
                capsule_img = img_match.group(1) if img_match else None

                item = self._build_item(
                    kind=kind,
                    item_id=item_id,
                    title=title,
                    original_price=original_price,
                    capsule_img=capsule_img,
                    client=client,
                )
                if item:
                    items.append(item)
            return items, total_sections

        # Fallback parser for older / mock HTML formats that don't match _ROW_RE
        sections = _SECTION_SPLIT_RE.split(html)
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
            img_match = _IMG_RE.search(section)
            capsule_img = img_match.group(1) if img_match else None

            item = self._build_item(
                kind="app",
                item_id=app_id,
                title=title,
                original_price=original_price,
                capsule_img=capsule_img,
                client=client,
            )
            if item:
                items.append(item)

        return items, len(sections)

    def _build_item(
        self,
        *,
        kind: str,
        item_id: str,
        title: str,
        original_price: str | None,
        capsule_img: str | None,
        client: httpx.Client | None,
    ) -> FreeGameItem:
        title_lower = title.lower()
        is_pack_name = "pack" in title_lower or "bundle" in title_lower or "collection" in title_lower
        is_dlc_name = any(
            w in title_lower
            for w in (" dlc", "dlc ", "expansion", "add-on", "addon", "season pass", "content pack")
        )

        details: dict | None = None
        if kind == "app" and client:
            details = self._fetch_appdetails(client, item_id)

        steam_type = (details.get("type") or "").lower() if details else None
        fullgame = details.get("fullgame") if details else None
        header_image = details.get("header_image") if details else None
        short_desc = details.get("short_description") if details else None

        # Determine item type
        if kind == "bundle":
            item_type = "bundle"
            claim_url = f"https://store.steampowered.com/bundle/{item_id}"
            item_ref_id = f"steam:bundle:{item_id}"
        elif kind == "sub":
            item_type = "pack"
            claim_url = f"https://store.steampowered.com/sub/{item_id}"
            item_ref_id = f"steam:sub:{item_id}"
        elif steam_type == "dlc":
            item_type = "pack" if is_pack_name else "dlc"
            claim_url = f"https://store.steampowered.com/app/{item_id}"
            item_ref_id = f"steam:{item_id}"
        elif is_pack_name:
            item_type = "pack"
            claim_url = f"https://store.steampowered.com/app/{item_id}"
            item_ref_id = f"steam:{item_id}"
        elif is_dlc_name:
            item_type = "dlc"
            claim_url = f"https://store.steampowered.com/app/{item_id}"
            item_ref_id = f"steam:{item_id}"
        else:
            item_type = "game"
            claim_url = f"https://store.steampowered.com/app/{item_id}"
            item_ref_id = f"steam:{item_id}"

        # Determine base game details if this is a DLC or pack
        base_game_title: str | None = None
        base_game_id: str | None = None
        if item_type in ("dlc", "pack", "bundle"):
            if isinstance(fullgame, dict):
                base_game_title = fullgame.get("name")
                if fullgame.get("appid"):
                    base_game_id = str(fullgame["appid"])
            if not base_game_title:
                base_game_title = _infer_base_game_title(title)

        # Artwork resolution
        logo_url = None
        if item_type in ("dlc", "pack", "bundle"):
            poster_url = header_image or capsule_img
            backdrop_url = header_image or capsule_img
        else:
            poster_url, backdrop_url, logo_url = _steam_artwork(item_id)
            if header_image and not poster_url:
                poster_url = header_image
            if not poster_url and capsule_img:
                poster_url = capsule_img

        raw_data: dict[str, Any] = {"kind": kind, "appId": int(item_id) if item_id.isdigit() else item_id}
        if details:
            raw_data["details"] = details

        return FreeGameItem(
            id=item_ref_id,
            store=self.store_id,
            store_name=self.store_name,
            title=title,
            description=short_desc,
            original_price=original_price,
            discount_percentage=100,
            is_free_now=True,
            start_date=None,
            end_date=None,
            claim_url=claim_url,
            poster_url=poster_url,
            backdrop_url=backdrop_url,
            logo_url=logo_url,
            external_id=item_id,
            item_type=item_type,
            base_game_title=base_game_title,
            base_game_id=base_game_id,
            raw_data=raw_data,
        )
