"""Epic Games Store free promotions provider."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from apps.freegames.services.base import BaseFreeGamesProvider, FreeGameItem

logger = logging.getLogger(__name__)

EPIC_PROMOTIONS_URL = (
    "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions"
    "?locale=en-US&country=US&allowCountries=US"
)


class EpicFreeGamesProvider(BaseFreeGamesProvider):
    """Fetches free promotional titles directly from Epic Games Store."""

    def __init__(self, endpoint_url: str = EPIC_PROMOTIONS_URL, timeout: float = 12.0):
        self._endpoint_url = endpoint_url
        self._timeout = timeout

    @property
    def store_id(self) -> str:
        return "epic"

    @property
    def store_name(self) -> str:
        return "Epic Games Store"

    def fetch_free_games(self) -> list[FreeGameItem]:
        """Query Epic's promotions API and parse active & upcoming free games."""
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.get(self._endpoint_url)
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            logger.exception(
                "Failed to fetch Epic Games free promotions from %s", self._endpoint_url
            )
            return []

        elements = (
            data.get("data", {}).get("Catalog", {}).get("searchStore", {}).get("elements", [])
        )

        items: list[FreeGameItem] = []
        for element in elements:
            parsed = self._parse_element(element)
            if parsed:
                items.append(parsed)

        return items

    def _parse_element(self, element: dict[str, Any]) -> FreeGameItem | None:
        title = element.get("title")
        if not title:
            return None

        promotions = element.get("promotions") or {}
        active_offers = promotions.get("promotionalOffers", [])
        upcoming_offers = promotions.get("upcomingPromotionalOffers", [])

        active_free: list[dict[str, Any]] = []
        for group in active_offers:
            for offer in group.get("promotionalOffers", []):
                discount = offer.get("discountSetting", {}).get("discountPercentage")
                if discount == 0:
                    active_free.append(offer)

        upcoming_free: list[dict[str, Any]] = []
        for group in upcoming_offers:
            for offer in group.get("promotionalOffers", []):
                discount = offer.get("discountSetting", {}).get("discountPercentage")
                if discount == 0:
                    upcoming_free.append(offer)

        # Only interested in 100% free promotions (either currently active or upcoming)
        if not active_free and not upcoming_free:
            return None

        is_free_now = bool(active_free)
        selected_offer = active_free[0] if active_free else upcoming_free[0]

        start_date = selected_offer.get("startDate")
        end_date = selected_offer.get("endDate")

        # Resolve slug for direct store claim URL
        slug = self._extract_slug(element)
        claim_url = (
            f"https://store.epicgames.com/p/{slug}"
            if slug
            else "https://store.epicgames.com/free-games"
        )

        # Resolve images
        poster_url, backdrop_url = self._extract_images(element.get("keyImages", []))

        # Format price
        price_info = element.get("price", {}).get("totalPrice", {})
        fmt_price = price_info.get("fmtPrice", {}).get("originalPrice")
        orig_price = price_info.get("originalPrice")
        if fmt_price:
            price_str = fmt_price
        elif orig_price:
            price_str = f"${orig_price / 100:.2f}"
        else:
            price_str = None

        item_id = element.get("id") or slug or title.lower().replace(" ", "-")
        namespace = element.get("namespace")
        external_id = f"{namespace}:{item_id}" if namespace else item_id

        return FreeGameItem(
            id=f"epic:{item_id}",
            store=self.store_id,
            store_name=self.store_name,
            title=title,
            description=element.get("description"),
            original_price=price_str,
            discount_percentage=100,
            is_free_now=is_free_now,
            start_date=start_date,
            end_date=end_date,
            claim_url=claim_url,
            poster_url=poster_url,
            backdrop_url=backdrop_url,
            external_id=external_id,
            raw_data={
                "namespace": namespace,
                "offerId": item_id,
                "productSlug": slug,
            },
        )

    def _extract_slug(self, element: dict[str, Any]) -> str | None:
        offer_mappings = element.get("offerMappings") or []
        if offer_mappings and offer_mappings[0].get("pageSlug"):
            return offer_mappings[0]["pageSlug"]

        catalog_ns = element.get("catalogNs", {}).get("mappings") or []
        if catalog_ns and catalog_ns[0].get("pageSlug"):
            return catalog_ns[0]["pageSlug"]

        if element.get("productSlug"):
            return element["productSlug"]

        if element.get("urlSlug"):
            return element["urlSlug"]

        return None

    def _extract_images(self, key_images: list[dict[str, Any]]) -> tuple[str | None, str | None]:
        poster_url: str | None = None
        backdrop_url: str | None = None

        for img in key_images:
            img_type = img.get("type")
            url = img.get("url")
            if not url:
                continue

            if img_type == "OfferImageTall" and not poster_url:
                poster_url = url
            elif img_type == "Thumbnail" and not poster_url:
                poster_url = url
            elif (
                img_type in ("OfferImageWide", "featuredMedia", "VaultClosed") and not backdrop_url
            ):
                backdrop_url = url

        # Fallback if only wide is available
        if not poster_url and backdrop_url:
            poster_url = backdrop_url

        return poster_url, backdrop_url
