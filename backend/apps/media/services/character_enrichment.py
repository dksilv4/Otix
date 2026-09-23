"""Service for extracting character external IDs and multi-source image enrichment."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from django.contrib.contenttypes.models import ContentType
from django.utils.text import slugify

from apps.media.models import Character, CharacterAsset, ExternalID, MediaItem
from core.providers.fandom import FandomProvider
from core.providers.wikidata import normalize_character_name

logger = logging.getLogger(__name__)


def _character_ct() -> ContentType:
    return ContentType.objects.get_for_model(Character)


def enrich_character(
    character: Character,
    fandom_community: str | None = None,
    wikidata_claim: dict[str, Any] | None = None,
    fandom_provider: FandomProvider | None = None,
    fandom_data: Any | None = None,
    media_item: MediaItem | None = None,
) -> bool:
    """Enrich a single character with external IDs, high-res portraits, and gallery assets.

    Returns True if any new data or asset was added.
    """
    char_ct = _character_ct()
    changed = False
    char_updates = []

    # 1. Ingest Wikidata External IDs & Commons Image
    if wikidata_claim:
        qid = wikidata_claim.get("wikidata_id")
        if qid:
            _, created = ExternalID.objects.get_or_create(
                content_type=char_ct,
                object_id=character.pk,
                provider="wikidata",
                external_id=qid,
            )
            if created:
                changed = True

        wiki_title = wikidata_claim.get("wikipedia_title")
        if wiki_title:
            _, created = ExternalID.objects.get_or_create(
                content_type=char_ct,
                object_id=character.pk,
                provider="wikipedia",
                external_id=wiki_title,
            )
            if created:
                changed = True

        btva_id = wikidata_claim.get("btva_id")
        if btva_id:
            _, created = ExternalID.objects.get_or_create(
                content_type=char_ct,
                object_id=character.pk,
                provider="btva",
                external_id=btva_id,
            )
            if created:
                changed = True

        # Commons high-res image
        commons_url = wikidata_claim.get("image_url")
        if commons_url:
            asset, created = CharacterAsset.objects.get_or_create(
                character=character,
                url=commons_url,
                defaults={
                    "asset_type": "mugshot",
                    "provider": "commons",
                    "caption": f"{character.name} (Wikimedia Commons)",
                },
            )
            if created:
                changed = True
            if not character.mug_shot_url:
                character.mug_shot_url = commons_url
                char_updates.append("mug_shot_url")

        # Check if wikidata claims have an explicit Fandom ID
        claim_fandom_id = wikidata_claim.get("fandom_id")
        if claim_fandom_id and ":" in claim_fandom_id:
            from core.providers.fandom.client import NON_GAME_COMMUNITIES

            cand_comm = claim_fandom_id.split(":", 1)[0].lower()
            if not fandom_community and cand_comm not in NON_GAME_COMMUNITIES:
                fandom_community = cand_comm

    # 2. Ingest Fandom Wiki Data & Gallery Assets
    f_data = fandom_data
    if f_data is None and fandom_community:
        provider = fandom_provider or FandomProvider()
        try:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            if loop and loop.is_running():
                from asgiref.sync import async_to_sync

                f_data = async_to_sync(provider.get_character_page)(
                    fandom_community, character.name
                )
            else:
                f_data = asyncio.run(provider.get_character_page(fandom_community, character.name))
        except Exception as e:
            logger.warning(
                "Fandom character page lookup error for %s/%s: %s",
                fandom_community,
                character.name,
                e,
            )
            f_data = None

    if f_data:
        fandom_ext_id = f"{f_data.community}:{f_data.page_title}"
        # Delete any polluted generic wiki IDs (e.g. logos:...)
        ExternalID.objects.filter(
            content_type=char_ct,
            object_id=character.pk,
            provider="fandom",
            external_id__startswith="logos:",
        ).delete()
        _, created = ExternalID.objects.get_or_create(
            content_type=char_ct,
            object_id=character.pk,
            provider="fandom",
            external_id=fandom_ext_id,
        )
        if created:
            changed = True

        # Ingest all extracted images
        for idx, img in enumerate(f_data.images):
            asset_type = "mugshot" if img.is_primary else "gallery"
            defaults = {
                "asset_type": asset_type,
                "width": img.width,
                "height": img.height,
                "provider": "fandom",
                "caption": img.caption,
                "order": idx,
            }
            _, a_created = CharacterAsset.objects.get_or_create(
                character=character,
                url=img.url,
                defaults=defaults,
            )
            if a_created:
                changed = True

        # Primary mugshot upgrade (replace empty, IGDB, Commons, or polluted logopedia thumbs)
        existing_mug = character.mug_shot_url or ""
        is_wrong_community = False
        if existing_mug and getattr(f_data, "community", None):
            if "wikia.nocookie.net" in existing_mug:
                if (
                    f"/{f_data.community}/" not in existing_mug
                    and f"/{f_data.community}_" not in existing_mug
                ):
                    is_wrong_community = True

        if f_data.primary_image_url and (
            not existing_mug
            or "igdb.com" in existing_mug
            or "logopedia" in existing_mug
            or "wikimedia.org" in existing_mug
            or "commons" in existing_mug
            or is_wrong_community
        ):
            character.mug_shot_url = f_data.primary_image_url
            char_updates.append("mug_shot_url")

        # Fill missing metadata from wikitext
        if f_data.description and (not character.description or is_wrong_community):
            character.description = f_data.description
            char_updates.append("description")
        if f_data.gender and (not character.gender or is_wrong_community):
            character.gender = f_data.gender
            char_updates.append("gender")
        if f_data.species and (not character.species or is_wrong_community):
            character.species = f_data.species
            char_updates.append("species")

        # Ingest voice actors from Fandom into MediaCredit
        if getattr(f_data, "actors", None):
            from apps.people.models import MediaCredit, Person

            target_media = media_item
            if not target_media:
                mc = character.media_characters.select_related("media_item").first()
                if mc:
                    target_media = mc.media_item

            if target_media:
                for a_idx, actor in enumerate(f_data.actors):
                    person = Person.objects.filter(name=actor.name).first()
                    if not person:
                        person = Person.objects.create(name=actor.name)
                        changed = True
                    MediaCredit.objects.update_or_create(
                        media_item=target_media,
                        person=person,
                        role="cast",
                        character_name=character.name,
                        defaults={"sort_order": a_idx},
                    )

    if char_updates:
        character.save(update_fields=list(set(char_updates)))
        changed = True

    return changed


def get_or_create_character_for_media(
    media: MediaItem,
    name: str,
    slug: str | None = None,
    defaults: dict[str, Any] | None = None,
) -> tuple[Character, bool]:
    """Resolve or create a Character scoped to this media item and franchise.

    Avoids cross-franchise character collisions (e.g. Ares/Zeus in God of War vs Hades II).
    If an existing Character with the same base slug belongs to an unrelated franchise,
    a distinct Character scoped to this media is created instead.
    """
    clean_name = name.strip()
    base_slug = slug or slugify(clean_name)[:200]
    extra = defaults or {}

    # 1. If media already has this character attached, return it
    mc = (
        media.characters.filter(character__name__iexact=clean_name)
        .select_related("character")
        .first()
    )
    if mc:
        return mc.character, False

    # 2. Check if a character with base_slug exists
    existing = Character.objects.filter(slug=base_slug).first()
    if not existing:
        char = Character.objects.create(name=clean_name, slug=base_slug, **extra)
        return char, True

    # 3. Check if existing character is claimed by other media
    other_media_ids = list(
        existing.media_characters.exclude(media_item=media).values_list("media_item_id", flat=True)
    )
    if not other_media_ids:
        # Not claimed by any other game, safe to reuse
        return existing, False

    # 4. Check franchise compatibility
    is_compatible = False
    media_game = getattr(media, "game", None)
    if media_game and media_game.franchise_id:
        from apps.media.models import Game

        other_franchises = list(
            Game.objects.filter(media_item_id__in=other_media_ids).values_list(
                "franchise_id", flat=True
            )
        )
        if other_franchises and all(fid == media_game.franchise_id for fid in other_franchises):
            is_compatible = True

    if is_compatible:
        return existing, False

    # 5. Distinct media/franchise: create a media-scoped character
    scoped_slug = f"{media.slug}-{base_slug}"[:200]
    scoped_char = Character.objects.filter(slug=scoped_slug).first()
    if not scoped_char:
        scoped_char = Character.objects.create(name=clean_name, slug=scoped_slug, **extra)
        return scoped_char, True

    return scoped_char, False


async def _gather_game_enrichment(
    media_title: str,
    media_slug: str,
    fandom_id: str | None,
    community: str | None,
    char_names: list[str],
    provider: FandomProvider,
) -> tuple[str | None, dict[str, Any], dict[str, Any]]:
    """Fetch community info, Wikidata claims, and Fandom pages in a single async session."""
    detected_community = community
    if not detected_community:
        try:
            detected_community = await provider.detect_community(
                media_title, media_slug, fandom_id=fandom_id
            )
        except Exception as e:
            logger.debug("Failed community auto-detection for '%s': %s", media_title, e)

    # Ingest Wikidata character claims
    wikidata_claims_map: dict[str, dict[str, Any]] = {}
    from core.providers.fandom.client import NON_GAME_COMMUNITIES
    from core.providers.wikidata import WikidataProvider

    wd = WikidataProvider()
    try:
        credits_data = await wd.get_game_credits(title=media_title)
        for claim in credits_data.get("characters", []):
            norm = normalize_character_name(claim.get("character_name", ""))
            wikidata_claims_map[norm] = claim
        if not detected_community and credits_data.get("fandom_id"):
            cand = credits_data["fandom_id"].split(":", 1)[0].lower()
            if cand not in NON_GAME_COMMUNITIES:
                detected_community = cand
    except Exception as e:
        logger.debug("Wikidata lookup for game characters failed: %s", e)

    # Fetch character pages using provider
    fandom_pages: dict[str, Any] = {}
    if detected_community:
        # Discover characters from Category:Characters on Fandom wiki
        if len(char_names) < 35:
            try:
                comm_chars = await provider.get_community_characters(
                    detected_community, game_title=media_title, limit=35
                )
                for c_name in comm_chars:
                    if c_name not in char_names:
                        char_names.append(c_name)
            except Exception as e:
                logger.debug("Failed community characters lookup on %s: %s", detected_community, e)

        for name in char_names:
            try:
                page = await provider.get_character_page(detected_community, name)
                fandom_pages[name] = page
            except Exception as e:
                logger.warning(
                    "Failed fetching Fandom page for %s/%s: %s", detected_community, name, e
                )
                fandom_pages[name] = None

    return detected_community, wikidata_claims_map, fandom_pages


def enrich_game_characters(
    media: MediaItem,
    fandom_community: str | None = None,
    fandom_provider: FandomProvider | None = None,
) -> int:
    """Enrich all characters attached to a game.

    Detects the game's Fandom community if not supplied, queries Wikidata claims,
    and enriches each character with high-res assets and external IDs.
    """
    media_chars = list(media.characters.select_related("character").order_by("order"))
    provider = fandom_provider or FandomProvider()
    char_names = [mc.character.name for mc in media_chars]

    # Check if media item has an existing Fandom ExternalID
    media_ct = ContentType.objects.get_for_model(MediaItem)
    ext_fandom = ExternalID.objects.filter(
        content_type=media_ct, object_id=media.pk, provider="fandom"
    ).first()
    fandom_id = ext_fandom.external_id if ext_fandom else None

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        from asgiref.sync import async_to_sync

        detected_community, wikidata_claims_map, fandom_pages = async_to_sync(
            _gather_game_enrichment
        )(media.title, media.slug, fandom_id, fandom_community, char_names, provider)
    else:
        detected_community, wikidata_claims_map, fandom_pages = asyncio.run(
            _gather_game_enrichment(
                media.title, media.slug, fandom_id, fandom_community, char_names, provider
            )
        )

    if detected_community:
        # Clean up any bad generic wiki ExternalIDs (e.g. logos:Pragmata)
        ExternalID.objects.filter(
            content_type=media_ct,
            object_id=media.pk,
            provider="fandom",
            external_id__startswith="logos:",
        ).delete()
        ExternalID.objects.update_or_create(
            content_type=media_ct,
            object_id=media.pk,
            provider="fandom",
            defaults={"external_id": f"{detected_community}:{media.slug}"},
        )

    # Attach any newly discovered characters from Fandom
    from apps.media.models import MediaCharacter

    for c_name, f_data in fandom_pages.items():
        if not f_data:
            continue
        char, _ = get_or_create_character_for_media(media, c_name)
        mc, created = MediaCharacter.objects.get_or_create(
            media_item=media,
            character=char,
            defaults={"order": len(media_chars)},
        )
        if created and mc not in media_chars:
            media_chars.append(mc)

    enriched_count = 0
    for mc in media_chars:
        char = mc.character
        norm_name = normalize_character_name(char.name)
        claim = wikidata_claims_map.get(norm_name)
        f_data = fandom_pages.get(char.name)
        if not f_data and char.name.lower().startswith("the "):
            f_data = fandom_pages.get(char.name[4:].strip())
        if not f_data:
            f_data = fandom_pages.get(norm_name)
        if enrich_character(
            char,
            fandom_community=detected_community,
            wikidata_claim=claim,
            fandom_provider=provider,
            fandom_data=f_data,
            media_item=media,
        ):
            enriched_count += 1

    return enriched_count
