"""Free games aggregator service.

Collects promotional free games across all registered store providers,
matches them against the Otix media catalog, and caches results to optimize
response times.
"""

from __future__ import annotations

import logging
from typing import Any

from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache

from apps.freegames.services.base import BaseFreeGamesProvider, FreeGameItem
from apps.freegames.services.providers.epic import EpicFreeGamesProvider
from apps.freegames.services.providers.steam import SteamFreeGamesProvider
from apps.media.models import ExternalID, MediaItem
from apps.media.serializers import MediaItemSummarySerializer
from apps.media.services import catalog as catalog_service

logger = logging.getLogger(__name__)

CACHE_KEY = "freegames:aggregated:v4"
CACHE_TTL = 900  # 15 minutes


class FreeGamesAggregator:
    """Aggregates and enriches free game promotions from multiple store providers."""

    def __init__(self, providers: list[BaseFreeGamesProvider] | None = None):
        self._providers = (
            providers
            if providers is not None
            else [EpicFreeGamesProvider(), SteamFreeGamesProvider()]
        )

    def register_provider(self, provider: BaseFreeGamesProvider) -> None:
        """Register a new store provider."""
        self._providers.append(provider)

    def get_free_games(
        self,
        request=None,
        use_cache: bool = True,
    ) -> dict[str, list[dict[str, Any]]]:
        """Fetch all current and upcoming free games across all providers."""
        if use_cache:
            cached = cache.get(CACHE_KEY)
            if cached is not None:
                return cached

        raw_items: list[FreeGameItem] = []
        for provider in self._providers:
            try:
                items = provider.fetch_free_games()
                raw_items.extend(items)
            except Exception:
                logger.exception(
                    "Provider %s failed during free games aggregation", provider.store_id
                )

        # Match against Otix media catalog
        enriched_items: list[dict[str, Any]] = []
        media_content_type = ContentType.objects.get_for_model(MediaItem)

        for item in raw_items:
            media = self._match_catalog(item, media_content_type)
            if media is None:
                media = self._hydrate_from_igdb(item)
            if media is not None:
                media = self._ensure_full_hydration(media, item)

            media_data = None
            if media is not None:
                try:
                    user = request.user if request is not None else None
                    context = (
                        catalog_service.request_context(request)
                        if request is not None
                        else "general"
                    )
                    # Reload so SteamGrid / IGDB assets attached above are visible.
                    media = MediaItem.objects.filter(pk=media.pk).first() or media
                    catalog_service.enrich_summaries([media], user, context)
                    media_data = dict(MediaItemSummarySerializer(media).data)
                    # Prefer catalog art; fall back to store promo images so cards
                    # never render blank after a thin seed.
                    if not media_data.get("poster_url") and item.poster_url:
                        media_data["poster_url"] = item.poster_url
                    if not media_data.get("backdrop_url") and item.backdrop_url:
                        media_data["backdrop_url"] = item.backdrop_url
                    if not self._usable_logo_url(media_data.get("logo_url")):
                        media_data["logo_url"] = self._usable_logo_url(item.logo_url)
                except Exception:
                    logger.exception("Failed to serialize matched media item %s", media.id)

            poster_url = (media_data or {}).get("poster_url") or item.poster_url
            backdrop_url = (media_data or {}).get("backdrop_url") or item.backdrop_url
            logo_url = self._usable_logo_url(
                (media_data or {}).get("logo_url")
            ) or self._usable_logo_url(item.logo_url)

            item_dict: dict[str, Any] = {
                "id": item.id,
                "store": item.store,
                "store_name": item.store_name,
                "title": (media_data or {}).get("title") or item.title,
                "description": item.description or getattr(media, "overview", None),
                "original_price": item.original_price,
                "discount_percentage": item.discount_percentage,
                "is_free_now": item.is_free_now,
                "start_date": item.start_date,
                "end_date": item.end_date,
                "claim_url": item.claim_url,
                "poster_url": poster_url,
                "backdrop_url": backdrop_url,
                "logo_url": logo_url,
                "external_id": item.external_id,
                "matched": media_data is not None,
                "media_item": media_data,
            }
            enriched_items.append(item_dict)

        current = [i for i in enriched_items if i["is_free_now"]]
        upcoming = [i for i in enriched_items if not i["is_free_now"]]

        result = {
            "current": current,
            "upcoming": upcoming,
            "total": len(enriched_items),
        }

        if use_cache:
            cache.set(CACHE_KEY, result, CACHE_TTL)

        return result

    def _match_catalog(
        self,
        item: FreeGameItem,
        media_content_type: ContentType,
    ) -> MediaItem | None:
        """Attempt to find a matching MediaItem in the local catalog."""
        # 1. Exact external ID match (store + external_id)
        if item.external_id:
            ext_row = (
                ExternalID.objects.filter(
                    content_type=media_content_type,
                    provider=item.store,
                    external_id=item.external_id,
                )
                .only("object_id")
                .first()
            )
            if ext_row and ext_row.object_id:
                media = MediaItem.objects.filter(pk=ext_row.object_id).first()
                if media:
                    return media

            # 2. Epic bare offerId fallback (if external_id is namespace:offerId)
            if item.store == "epic" and ":" in item.external_id:
                bare_id = item.external_id.split(":", 1)[1]
                ext_row = (
                    ExternalID.objects.filter(
                        content_type=media_content_type,
                        provider="epic",
                        external_id=bare_id,
                    )
                    .only("object_id")
                    .first()
                )
                if ext_row and ext_row.object_id:
                    media = MediaItem.objects.filter(pk=ext_row.object_id).first()
                    if media:
                        return media

        # 3. Match by exact game title (case-insensitive)
        media_by_title = MediaItem.objects.filter(
            media_type="game",
            title__iexact=item.title.strip(),
        ).first()
        if media_by_title:
            return media_by_title

        return None

    def _hydrate_from_igdb(self, item: FreeGameItem) -> MediaItem | None:
        """Match an unmatched free game via IGDB and seed a full catalog row."""
        try:
            from apps.media.services.identity import attach_external_id, find_media_id
            from apps.media.services.igdb import IGDBProvider, configured
            from core.providers.igdb.hydrators import seed_game_from_igdb
            from core.providers.igdb.schemas import GAME_HYDRATION_FIELDS

            if not configured():
                logger.debug("IGDB not configured; skipping on-the-fly free game hydration")
                return None

            provider = IGDBProvider()
            igdb_id, offer_id, namespace = self._resolve_igdb_id(provider, item)
            if igdb_id is None:
                logger.info("Could not match free game '%s' to any IGDB title", item.title)
                return None

            existing_media_id = find_media_id("igdb", str(igdb_id), "game")
            media = (
                MediaItem.objects.filter(pk=existing_media_id).first()
                if existing_media_id
                else None
            )

            if media is None:
                logger.info(
                    "Seeding and fully hydrating free game '%s' (IGDB ID: %s)",
                    item.title,
                    igdb_id,
                )
                raw_game = provider.get_game(igdb_id, fields=GAME_HYDRATION_FIELDS)
                if not raw_game:
                    logger.warning("IGDB returned empty game payload for ID %s", igdb_id)
                    return None
                media_id = seed_game_from_igdb(raw_game, igdb_id)
                media = MediaItem.objects.filter(pk=media_id).first()

            if media and item.external_id:
                attach_external_id(media.pk, item.store, item.external_id, "game")
                if item.store == "epic":
                    if offer_id:
                        attach_external_id(media.pk, "epic", offer_id, "game")
                    if namespace:
                        attach_external_id(media.pk, "epic_namespace", namespace, "game")

            return media
        except Exception:
            logger.exception("Failed to hydrate free game '%s' from IGDB", item.title)
            return None

    def _ensure_full_hydration(self, media: MediaItem, item: FreeGameItem) -> MediaItem:
        """Deepen a matched/seeded row: IGDB fold + SteamGrid logos/posters."""
        try:
            from asgiref.sync import async_to_sync
            from django.conf import settings

            from apps.media.services.igdb import IGDBProvider, configured
            from core.providers.igdb.hydrators import seed_game_from_igdb
            from core.providers.igdb.schemas import GAME_HYDRATION_FIELDS

            needs_depth = self._needs_artwork_depth(media)
            if needs_depth and configured():
                from apps.media.services.catalog import external_ids_for

                provider = IGDBProvider()
                igdb_id, _, _ = self._resolve_igdb_id(provider, item)
                if igdb_id is None:
                    # Prefer the IGDB id already linked on this media row.
                    raw_igdb = external_ids_for([media]).get(media.pk, {}).get("igdb")
                    igdb_id = int(raw_igdb) if raw_igdb and str(raw_igdb).isdigit() else None

                if igdb_id is not None:
                    raw_game = provider.get_game(igdb_id, fields=GAME_HYDRATION_FIELDS)
                    if raw_game:
                        media_id = seed_game_from_igdb(raw_game, igdb_id)
                        media = MediaItem.objects.filter(pk=media_id).first() or media

            steam_app_id = self._steam_app_id_for(media, item)
            if settings.STEAMGRID_API_KEY and (needs_depth or steam_app_id):
                try:
                    from apps.media.services.steamgrid_artwork import (
                        fetch_and_attach_game_artwork,
                        fetch_and_attach_game_logos,
                    )

                    if steam_app_id is not None and needs_depth:
                        async_to_sync(fetch_and_attach_game_artwork)(media.pk, steam_app_id)
                    else:
                        async_to_sync(fetch_and_attach_game_logos)(media.pk, steam_app_id)
                except Exception:
                    logger.debug(
                        "SteamGrid enrich failed for free game media_id=%s",
                        media.pk,
                        exc_info=True,
                    )
        except Exception:
            logger.exception(
                "Full hydration failed for free game '%s' media_id=%s",
                item.title,
                getattr(media, "pk", None),
            )
        return media

    @staticmethod
    def _usable_logo_url(url: str | None) -> str | None:
        """Drop speculative Steam CDN logos that commonly 404 (esp. DLC)."""
        if not url:
            return None
        path = url.split("?", 1)[0]
        if "/steam/apps/" in path and path.endswith("/logo.png"):
            return None
        return url

    @staticmethod
    def _needs_artwork_depth(media: MediaItem) -> bool:
        """True when the row is missing logo/poster or is still a thin seed."""
        assets = list(media.assets.all()) if hasattr(media, "assets") else []
        types = {(a.asset_type or "").lower() for a in assets}
        missing_logo = "logo" not in types
        missing_poster = "poster" not in types
        thin = (media.completeness_score or 0) < 0.35
        return missing_logo or missing_poster or thin

    @staticmethod
    def _steam_app_id_for(media: MediaItem, item: FreeGameItem) -> int | None:
        if item.store == "steam" and item.external_id:
            try:
                return int(item.external_id)
            except (TypeError, ValueError):
                pass
        try:
            from apps.media.services.catalog import external_ids_for

            steam_raw = external_ids_for([media]).get(media.pk, {}).get("steam")
            if steam_raw and str(steam_raw).isdigit():
                return int(steam_raw)
        except Exception:
            pass
        return None

    def _resolve_igdb_id(
        self,
        provider,
        item: FreeGameItem,
    ) -> tuple[int | None, str | None, str | None]:
        """Resolve IGDB id from store cross-ref or title search variants."""
        from apps.media.services.game_matcher import (
            _comparison_key,
            _igdb_search_query,
        )
        from apps.media.services.igdb import SEARCH_FIELDS

        offer_id = item.external_id
        namespace: str | None = None
        igdb_id: int | None = None

        if item.store == "epic" and item.external_id:
            if ":" in item.external_id:
                namespace, offer_id = item.external_id.split(":", 1)
            if offer_id:
                try:
                    igdb_id = provider.lookup_epic_ids([offer_id]).get(offer_id)
                except Exception:
                    logger.debug("Free game Epic cross-reference failed for offer_id %s", offer_id)
        elif item.store == "steam" and item.external_id:
            try:
                steam_app_id = int(item.external_id)
                igdb_id = provider.lookup_steam_app_ids([steam_app_id]).get(steam_app_id)
            except (TypeError, ValueError):
                logger.debug("Invalid Steam app id for free game: %s", item.external_id)
            except Exception:
                logger.debug(
                    "Free game Steam cross-reference failed for app_id %s",
                    item.external_id,
                )

        if igdb_id is None and item.title:
            for variant in self._title_search_variants(item.title):
                clean = _igdb_search_query(variant)
                candidates: list[dict] = []
                try:
                    candidates = provider.search_games_by_name(
                        clean, limit=10, fields=SEARCH_FIELDS
                    )
                except Exception:
                    logger.debug("IGDB search_games_by_name failed for title %s", clean)
                if not candidates:
                    try:
                        candidates = provider.search_games(clean, limit=10, fields=SEARCH_FIELDS)
                    except Exception:
                        logger.debug("IGDB search_games failed for title %s", clean)

                target_key = _comparison_key(variant)
                for candidate in candidates:
                    cand_name = candidate.get("name") or ""
                    if _comparison_key(cand_name) == target_key:
                        igdb_id = candidate.get("id")
                        break
                if igdb_id is not None:
                    break

                # Soft: unique candidate whose key contains / is contained by target.
                soft: list[dict] = []
                for candidate in candidates:
                    cand_key = _comparison_key(candidate.get("name") or "")
                    if not cand_key or not target_key:
                        continue
                    if target_key in cand_key or cand_key in target_key:
                        soft.append(candidate)
                if len(soft) == 1:
                    igdb_id = soft[0].get("id")
                    break

        return igdb_id, offer_id, namespace

    @staticmethod
    def _title_search_variants(title: str) -> list[str]:
        """Store titles often append DLC / pack suffixes IGDB omits."""
        variants = [title]
        for sep in (" - ", ": ", " – ", " — "):
            if sep in title:
                variants.append(title.split(sep, 1)[0].strip())
        # Deduplicate while preserving order.
        seen: set[str] = set()
        out: list[str] = []
        for v in variants:
            key = v.casefold()
            if v and key not in seen:
                seen.add(key)
                out.append(v)
        return out


# Module-level singleton
aggregator = FreeGamesAggregator()
