"""GOG free promotions provider."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from apps.freegames.services.base import BaseFreeGamesProvider, FreeGameItem

logger = logging.getLogger(__name__)

GAMERPOWER_GOG_URL = "https://www.gamerpower.com/api/giveaways?platform=gog"
GOG_CATALOG_URL = "https://catalog.gog.com/v1/catalog"
GOG_PRODUCT_API_URL = "https://api.gog.com/products/{product_id}"


class GOGFreeGamesProvider(BaseFreeGamesProvider):
    """Fetches free promotional games from GOG via GamerPower and GOG Catalog."""

    def __init__(
        self,
        gamerpower_url: str = GAMERPOWER_GOG_URL,
        catalog_url: str = GOG_CATALOG_URL,
        timeout: float = 12.0,
    ):
        self._gamerpower_url = gamerpower_url
        self._catalog_url = catalog_url
        self._timeout = timeout

    @property
    def store_id(self) -> str:
        return "gog"

    @property
    def store_name(self) -> str:
        return "GOG"

    def fetch_free_games(self) -> list[FreeGameItem]:
        items: list[FreeGameItem] = []
        seen_titles: set[str] = set()

        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Otix/1.0",
            "Accept": "application/json",
        }

        with httpx.Client(timeout=self._timeout, headers=headers, follow_redirects=True) as client:
            # 1. Fetch active giveaways from GamerPower for GOG
            try:
                resp = client.get(self._gamerpower_url)
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list):
                        for entry in data:
                            parsed = self._parse_gamerpower_entry(entry, client)
                            if parsed and parsed.title.lower() not in seen_titles:
                                seen_titles.add(parsed.title.lower())
                                items.append(parsed)
            except Exception:
                logger.exception("Failed to fetch GOG giveaways from GamerPower")

            # 2. Query GOG Catalog for 100% off promotional items
            try:
                catalog_resp = client.get(
                    f"{self._catalog_url}?discounted=eq:true&price=between:0,0&limit=20"
                )
                if catalog_resp.status_code == 200:
                    cat_data = catalog_resp.json()
                    products = cat_data.get("products", [])
                    for prod in products:
                        parsed = self._parse_catalog_product(prod)
                        if parsed and parsed.title.lower() not in seen_titles:
                            seen_titles.add(parsed.title.lower())
                            items.append(parsed)
            except Exception:
                logger.exception("Failed to query GOG catalog for free promotions")

        return items

    def _parse_gamerpower_entry(
        self, entry: dict[str, Any], client: httpx.Client
    ) -> FreeGameItem | None:
        title = entry.get("title", "")
        # GamerPower titles often end with " (GOG) Giveaway" or similar
        clean_title = (
            title.replace(" (GOG) Giveaway", "")
            .replace(" (GOG)", "")
            .replace(" Giveaway", "")
            .strip()
        )
        if not clean_title:
            return None

        # Look up product on GOG catalog to find actual GOG product ID & store slug
        gog_id: str | None = None
        claim_url = entry.get("open_giveaway_url") or entry.get("gamerpower_url")
        poster_url = entry.get("image") or entry.get("thumbnail")
        backdrop_url = None
        logo_url = None

        try:
            lookup_resp = client.get(f"{self._catalog_url}?query=like:{clean_title}&limit=5")
            if lookup_resp.status_code == 200:
                lookup_data = lookup_resp.json()
                for prod in lookup_data.get("products", []):
                    prod_title = prod.get("title", "")
                    if prod_title.lower() == clean_title.lower() or prod.get("id"):
                        gog_id = str(prod.get("id"))
                        slug = prod.get("slug")
                        if slug:
                            claim_url = f"https://www.gog.com/en/game/{slug}"
                        cover_v = prod.get("coverVertical")
                        cover_h = prod.get("coverHorizontal")
                        logo = prod.get("logo")
                        if cover_v:
                            poster_url = cover_v if cover_v.startswith("http") else f"https:{cover_v}"
                        if cover_h:
                            backdrop_url = cover_h if cover_h.startswith("http") else f"https:{cover_h}"
                        if logo:
                            logo_url = logo if logo.startswith("http") else f"https:{logo}"
                        break
        except Exception:
            logger.debug("Failed catalog cross-lookup for GamerPower GOG game %s", clean_title)

        worth = entry.get("worth")
        original_price = worth if worth and worth != "N/A" else None
        end_date = entry.get("end_date")
        if end_date and end_date == "N/A":
            end_date = None

        return FreeGameItem(
            id=f"gog_{gog_id or entry.get('id')}",
            store="gog",
            store_name="GOG",
            title=clean_title,
            description=entry.get("description"),
            original_price=original_price,
            discount_percentage=100,
            is_free_now=True,
            start_date=entry.get("published_date"),
            end_date=end_date,
            claim_url=claim_url or "https://www.gog.com",
            poster_url=poster_url,
            backdrop_url=backdrop_url,
            logo_url=logo_url,
            external_id=gog_id or str(entry.get("id")),
            raw_data=entry,
        )

    def _parse_catalog_product(self, prod: dict[str, Any]) -> FreeGameItem | None:
        title = prod.get("title")
        prod_id = prod.get("id")
        if not title or not prod_id:
            return None

        slug = prod.get("slug")
        claim_url = f"https://www.gog.com/en/game/{slug}" if slug else "https://www.gog.com"

        cover_v = prod.get("coverVertical")
        cover_h = prod.get("coverHorizontal")
        logo = prod.get("logo")
        poster_url = (cover_v if cover_v.startswith("http") else f"https:{cover_v}") if cover_v else None
        backdrop_url = (cover_h if cover_h.startswith("http") else f"https:{cover_h}") if cover_h else None
        logo_url = (logo if logo.startswith("http") else f"https:{logo}") if logo else None

        price = prod.get("price") or {}
        base_price = price.get("base")

        return FreeGameItem(
            id=f"gog_{prod_id}",
            store="gog",
            store_name="GOG",
            title=title,
            description=None,
            original_price=base_price if base_price and base_price != "$0.00" else None,
            discount_percentage=100,
            is_free_now=True,
            start_date=None,
            end_date=None,
            claim_url=claim_url,
            poster_url=poster_url,
            backdrop_url=backdrop_url,
            logo_url=logo_url,
            external_id=str(prod_id),
            raw_data=prod,
        )
