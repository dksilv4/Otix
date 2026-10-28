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
from apps.freegames.services.providers.gog import GOGFreeGamesProvider
from apps.freegames.services.providers.steam import SteamFreeGamesProvider
from apps.media.models import ExternalID, MediaItem
from apps.media.serializers import MediaItemSummarySerializer
from apps.media.services import catalog as catalog_service
from apps.media.services.game_matcher import _comparison_key

logger = logging.getLogger(__name__)

CACHE_KEY = "freegames:aggregated:v4"
CACHE_TTL = 900  # 15 minutes


class FreeGamesAggregator:
    """Aggregates and enriches free game promotions from multiple store providers."""

    def __init__(self, providers: list[BaseFreeGamesProvider] | None = None):
        self._providers = (
            providers
            if providers is not None
            else [EpicFreeGamesProvider(), SteamFreeGamesProvider(), GOGFreeGamesProvider()]
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

            is_dlc_or_pack = item.item_type in ("dlc", "pack", "bundle")

            # Prefer store promo images for DLCs/packs; prefer catalog art for games
            if is_dlc_or_pack:
                poster_url = item.poster_url or (media_data or {}).get("poster_url")
                backdrop_url = item.backdrop_url or (media_data or {}).get("backdrop_url")
                logo_url = self._usable_logo_url(item.logo_url)
            else:
                poster_url = (media_data or {}).get("poster_url") or item.poster_url
                backdrop_url = (media_data or {}).get("backdrop_url") or item.backdrop_url
                logo_url = self._usable_logo_url(
                    (media_data or {}).get("logo_url")
                ) or self._usable_logo_url(item.logo_url)

            # DLCs and packs must preserve their own title, never overwritten by base game title!
            title = (
                item.title if is_dlc_or_pack else ((media_data or {}).get("title") or item.title)
            )
            base_game_title = item.base_game_title or (
                (media_data or {}).get("title") if is_dlc_or_pack and media_data else None
            )

            item_dict: dict[str, Any] = {
                "id": item.id,
                "store": item.store,
                "store_name": item.store_name,
                "title": title,
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
                "item_type": item.item_type,
                "base_game_title": base_game_title,
                "base_game_id": item.base_game_id,
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

    def get_promotions_for_media_item(self, media_item) -> list[dict[str, Any]]:
        """Return any active or upcoming promotional giveaway for the given media item."""
        cached = cache.get(CACHE_KEY)
        if cached is None:
            cached = self.get_free_games(use_cache=True)
        if not cached:
            return []

        promotions: list[dict[str, Any]] = []
        media_id = getattr(media_item, "id", None)
        media_slug = getattr(media_item, "slug", None)
        title = getattr(media_item, "title", None)
        steam_app_id = None
        game = getattr(media_item, "game", None)
        if game is not None:
            steam_app_id = getattr(game, "steam_app_id", None)

        comp_key = _comparison_key(title) if title else None

        for bucket in ("current", "upcoming"):
            items = cached.get(bucket) or []
            for item in items:
                matched_media = item.get("media_item")
                matched_id = (matched_media or {}).get("id") if matched_media else None
                matched_slug = (matched_media or {}).get("slug") if matched_media else None

                is_match = False
                if media_id is not None and matched_id == media_id:
                    is_match = True
                elif media_slug and matched_slug == media_slug:
                    is_match = True
                elif (
                    steam_app_id
                    and item.get("external_id")
                    and str(item.get("external_id")) == str(steam_app_id)
                ):
                    is_match = True
                elif (
                    steam_app_id
                    and item.get("base_game_id")
                    and str(item.get("base_game_id")) == str(steam_app_id)
                ):
                    is_match = True
                elif (
                    comp_key
                    and item.get("base_game_title")
                    and _comparison_key(item.get("base_game_title")) == comp_key
                ):
                    is_match = True
                elif (
                    comp_key
                    and item.get("title")
                    and _comparison_key(item.get("title")) == comp_key
                ):
                    is_match = True

                if is_match:
                    promotions.append(
                        {
                            "id": item.get("id"),
                            "store": item.get("store"),
                            "store_name": item.get("store_name"),
                            "title": item.get("title"),
                            "description": item.get("description"),
                            "original_price": item.get("original_price"),
                            "discount_percentage": item.get("discount_percentage"),
                            "is_free_now": item.get("is_free_now", bucket == "current"),
                            "start_date": item.get("start_date"),
                            "end_date": item.get("end_date"),
                            "claim_url": item.get("claim_url"),
                            "item_type": item.get("item_type", "game"),
                            "base_game_title": item.get("base_game_title"),
                        }
                    )
        return promotions

    def _match_catalog(
        self,
        item: FreeGameItem,
        media_content_type: ContentType,
    ) -> MediaItem | None:
        """Attempt to find a matching MediaItem in the local catalog."""
        is_dlc_or_pack = item.item_type in ("dlc", "pack", "bundle")

        # For DLCs and packs, attempt to match the base game
        if is_dlc_or_pack:
            if item.base_game_id:
                ext_row = (
                    ExternalID.objects.filter(
                        content_type=media_content_type,
                        provider=item.store,
                        external_id=item.base_game_id,
                    )
                    .only("object_id")
                    .first()
                )
                if ext_row and ext_row.object_id:
                    media = MediaItem.objects.filter(pk=ext_row.object_id).first()
                    if media:
                        return media

            if item.base_game_title:
                media_by_title = MediaItem.objects.filter(
                    media_type="game",
                    title__iexact=item.base_game_title.strip(),
                ).first()
                if media_by_title:
                    return media_by_title

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

            if media:
                if item.item_type in ("dlc", "pack", "bundle"):
                    if item.base_game_id:
                        attach_external_id(media.pk, item.store, item.base_game_id, "game")
                elif item.external_id:
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
        target_id = (
            item.base_game_id
            if item.item_type in ("dlc", "pack", "bundle") and item.base_game_id
            else item.external_id
        )
        if item.store == "steam" and target_id:
            try:
                return int(target_id)
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

        is_dlc_or_pack = item.item_type in ("dlc", "pack", "bundle")

        if item.store == "epic" and item.external_id:
            if ":" in item.external_id:
                namespace, offer_id = item.external_id.split(":", 1)
            if offer_id:
                try:
                    igdb_id = provider.lookup_epic_ids([offer_id]).get(offer_id)
                except Exception:
                    logger.debug("Free game Epic cross-reference failed for offer_id %s", offer_id)
        elif item.store == "steam":
            target_app_id = (
                item.base_game_id if is_dlc_or_pack and item.base_game_id else item.external_id
            )
            if target_app_id:
                try:
                    steam_app_id = int(target_app_id)
                    igdb_id = provider.lookup_steam_app_ids([steam_app_id]).get(steam_app_id)
                except (TypeError, ValueError):
                    logger.debug("Invalid Steam app id for free game: %s", target_app_id)
                except Exception:
                    logger.debug(
                        "Free game Steam cross-reference failed for app_id %s",
                        target_app_id,
                    )
        elif item.store == "gog" and item.external_id:
            try:
                # IGDB external_game_source = 2 for GOG
                gog_id_map = provider.lookup_external_game_ids(2, [str(item.external_id)])
                igdb_id = gog_id_map.get(str(item.external_id))
            except Exception:
                logger.debug("Free game GOG cross-reference failed for id %s", item.external_id)

        target_title = (
            item.base_game_title if is_dlc_or_pack and item.base_game_title else item.title
        )
        if igdb_id is None and target_title:
            for variant in self._title_search_variants(target_title):
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
