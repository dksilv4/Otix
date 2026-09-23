"""Game credits hydration service: populates cast, crew, and placeholder characters."""

from __future__ import annotations

import logging

from django.db import transaction

from apps.media.models import MediaCharacter, MediaItem
from apps.media.services.completeness import recompute_completeness
from apps.people.models import MediaCredit, Person
from core.providers.wikidata import WikidataProvider

logger = logging.getLogger(__name__)


def _extract_game_ids(media: MediaItem) -> tuple[str | None, int | None]:
    """Extract Steam App ID and IGDB ID from a MediaItem's external ids."""
    steam_id: str | None = None
    igdb_id: int | None = None

    for ext in media.external_ids.all():
        if ext.provider == "steam" and ext.external_id:
            steam_id = ext.external_id
        elif ext.provider == "igdb" and ext.external_id and ext.external_id.isdigit():
            igdb_id = int(ext.external_id)

    return steam_id, igdb_id


async def hydrate_game_credits(
    media: MediaItem,
    *,
    provider: WikidataProvider | None = None,
) -> int:
    """Resolve and hydrate video game cast and crew credits into MediaCredit and Character rows."""
    if media.media_type != "game":
        return 0

    from asgiref.sync import sync_to_async

    steam_id, igdb_id = await sync_to_async(_extract_game_ids)(media)
    p = provider or WikidataProvider()

    try:
        credits_data = await p.get_game_credits(
            steam_id=steam_id,
            igdb_id=igdb_id,
            title=media.title,
        )
    except Exception as e:
        logger.warning("Failed to fetch Wikidata game credits for '%s': %s", media.title, e)
        return 0

    cast_entries = credits_data.get("cast") or []
    crew_entries = credits_data.get("crew") or []
    char_entries = credits_data.get("characters") or []
    if not cast_entries and not crew_entries and not char_entries:
        return 0

    def _apply_credits() -> int:
        count = 0
        people_to_backfill: list[Person] = []
        with transaction.atomic():
            # 1. Apply cast
            for order, c in enumerate(cast_entries):
                p_name = c["person_name"]
                c_name = c["character_name"]
                person = Person.objects.filter(name=p_name).first()
                if not person:
                    person = Person.objects.create(
                        name=p_name,
                        photo_url=c.get("photo_url"),
                    )
                elif not person.photo_url and c.get("photo_url"):
                    person.photo_url = c["photo_url"]
                    person.save(update_fields=["photo_url"])

                if not person.photo_url and person not in people_to_backfill:
                    people_to_backfill.append(person)

                MediaCredit.objects.update_or_create(
                    media_item=media,
                    person=person,
                    role="cast",
                    character_name=c_name,
                    defaults={"sort_order": order},
                )
                count += 1

                from apps.media.services.character_enrichment import (
                    get_or_create_character_for_media,
                )

                if c_name and c_name.strip().lower() not in (
                    "cast",
                    "various",
                    "additional voices",
                    "self",
                    "uncredited",
                    "narrator",
                ):
                    char, _ = get_or_create_character_for_media(media, c_name)
                    MediaCharacter.objects.get_or_create(
                        media_item=media,
                        character=char,
                        defaults={"order": order},
                    )

            # 1b. Apply additional characters from Wikidata character claims
            for c_order, claim in enumerate(char_entries, start=len(cast_entries)):
                c_name = claim.get("character_name")
                if not c_name:
                    continue
                char, _ = get_or_create_character_for_media(media, c_name)
                MediaCharacter.objects.get_or_create(
                    media_item=media,
                    character=char,
                    defaults={"order": c_order},
                )

            # 2. Apply crew (directors, writers, composers)
            for order, cr in enumerate(crew_entries):
                p_name = cr["person_name"]
                role = cr["role"]
                person = Person.objects.filter(name=p_name).first()
                if not person:
                    person = Person.objects.create(
                        name=p_name,
                        photo_url=cr.get("photo_url"),
                    )
                elif not person.photo_url and cr.get("photo_url"):
                    person.photo_url = cr["photo_url"]
                    person.save(update_fields=["photo_url"])

                if not person.photo_url and person not in people_to_backfill:
                    people_to_backfill.append(person)

                MediaCredit.objects.update_or_create(
                    media_item=media,
                    person=person,
                    role=role,
                    defaults={"sort_order": order},
                )
                count += 1

            # 2b. Store Fandom External ID for MediaItem if discovered
            if credits_data.get("fandom_id"):
                from django.contrib.contenttypes.models import ContentType

                from apps.media.models import ExternalID

                media_ct = ContentType.objects.get_for_model(MediaItem)
                ExternalID.objects.get_or_create(
                    content_type=media_ct,
                    object_id=media.pk,
                    provider="fandom",
                    defaults={"external_id": credits_data["fandom_id"]},
                )

            recompute_completeness(media)

        # Backfill photos outside of database transaction
        for p in people_to_backfill:
            try:
                from apps.people.services.photo_lookup import backfill_person_photo

                backfill_person_photo(p)
            except Exception as e:
                logger.debug("Failed photo backfill for %s: %s", p.name, e)

        # 3. Enrich characters with Wikidata claims and Fandom assets
        try:
            from apps.media.services.character_enrichment import enrich_game_characters

            community = None
            if credits_data.get("fandom_id"):
                cand = credits_data["fandom_id"].split(":", 1)[0].lower()
                if cand not in ("video-game-databank", "xbox", "gamicus"):
                    community = cand

            enrich_game_characters(media, fandom_community=community)
        except Exception as e:
            logger.debug(
                "Character enrichment error during credits hydration for '%s': %s",
                media.title,
                e,
            )

        return count

    # Run DB writes synchronously
    from asgiref.sync import sync_to_async

    return await sync_to_async(_apply_credits)()
