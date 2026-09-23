"""Wikidata API provider client for video game characters, voice cast, and crew."""

from __future__ import annotations

import logging
import urllib.parse
from typing import TYPE_CHECKING, Any

import httpx
from django.conf import settings

from core.providers.framework import (
    BaseProviderClient,
    ProviderError,
    resolve_shared_http_client,
)
from core.providers.wikidata.schemas import CastCredit, CrewCredit, GameCreditsPayload
from core.providers.wikidata.transformers import (
    transform_cast_credit,
    transform_crew_credit,
)

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

BASE_URL = "https://www.wikidata.org"
SPARQL_URL = "https://query.wikidata.org/sparql"
DEFAULT_USER_AGENT = "Otix/1.0 (https://github.com/dksilv4/Otix; media-server)"

_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a process-shared AsyncClient bound to Wikidata with a custom User-Agent."""
    global _shared_client, _shared_client_loop_id
    timeout = getattr(settings, "WIKIDATA_REQUEST_TIMEOUT_SECONDS", 12.0)
    _shared_client, _shared_client_loop_id = resolve_shared_http_client(
        _shared_client,
        _shared_client_loop_id,
        base_url=BASE_URL,
        timeout=timeout,
        headers={"User-Agent": getattr(settings, "WIKIDATA_USER_AGENT", DEFAULT_USER_AGENT)},
    )
    return _shared_client


async def close_http_client() -> None:
    """Close and reset the process-shared AsyncClient."""
    global _shared_client, _shared_client_loop_id
    if _shared_client is not None and not _shared_client.is_closed:
        await _shared_client.aclose()
    _shared_client = None
    _shared_client_loop_id = None


class WikidataError(ProviderError):
    """Generic Wikidata API or SPARQL communication error."""


class WikidataProvider(BaseProviderClient):
    """Async Wikidata API client with rate limiting, caching, and circuit breaking."""

    def __init__(
        self,
        *,
        redis: Redis | None = None,
        http_client: httpx.AsyncClient | None = None,
        circuit_threshold: int = 5,
        circuit_recovery: float = 30.0,
    ) -> None:
        client = http_client or get_http_client()
        rate = float(getattr(settings, "WIKIDATA_GLOBAL_RPS_LIMIT", 5.0))
        super().__init__(
            name="wikidata",
            redis=redis,
            http_client=client,
            rate=rate,
            burst=int(rate * 2),
            circuit_threshold=circuit_threshold,
            circuit_recovery=circuit_recovery,
        )

    async def _sparql_query(self, query: str) -> list[dict[str, Any]]:
        """Execute a SPARQL query against Wikidata endpoint."""
        url = f"{SPARQL_URL}?query={urllib.parse.quote(query)}&format=json"
        try:
            response = await self.http.get(url, timeout=7.0)
            if response.status_code == 200:
                data = response.json()
                return data.get("results", {}).get("bindings", [])
            return []
        except Exception as e:
            logger.warning("Wikidata SPARQL query failed: %s", e)
            return []

    async def find_entity_by_steam_id(self, steam_id: str) -> str | None:
        """Resolve a game's Wikidata Q-number using Steam application ID (P1733)."""
        clean_id = steam_id.strip()
        if not clean_id:
            return None
        query = f'SELECT ?item WHERE {{ ?item wdt:P1733 "{clean_id}". }} LIMIT 1'
        bindings = await self._sparql_query(query)
        if bindings:
            uri = bindings[0].get("item", {}).get("value", "")
            return uri.split("/")[-1] if uri else None
        return None

    async def find_entity_by_igdb_id(self, igdb_id: int) -> str | None:
        """Resolve a game's Wikidata Q-number using IGDB ID (P5794)."""
        query = f'SELECT ?item WHERE {{ ?item wdt:P5794 "{igdb_id}". }} LIMIT 1'
        bindings = await self._sparql_query(query)
        if bindings:
            uri = bindings[0].get("item", {}).get("value", "")
            return uri.split("/")[-1] if uri else None
        return None

    async def search_entity_by_title(self, title: str) -> str | None:
        """Fuzzy search for video game entity by title."""
        params = {
            "action": "wbsearchentities",
            "search": title.strip(),
            "language": "en",
            "type": "item",
            "limit": 5,
            "format": "json",
        }
        try:
            resp = await self._get("/w/api.php", params=params)
            if resp.status_code != 200:
                return None
            data = resp.json()
            for result in data.get("search", []):
                desc = (result.get("description") or "").lower()
                if "video game" in desc or "game" in desc:
                    return result.get("id")
            if data.get("search"):
                return data["search"][0].get("id")
        except Exception as e:
            logger.warning("Wikidata search entity failed for '%s': %s", title, e)
        return None

    async def get_entities(self, entity_ids: list[str]) -> dict[str, Any]:
        """Fetch multiple entities by ID in a single API call."""
        if not entity_ids:
            return {}
        unique_ids = list(dict.fromkeys(entity_ids[:50]))
        params = {
            "action": "wbgetentities",
            "ids": "|".join(unique_ids),
            "languages": "en",
            "props": "labels|descriptions|claims",
            "format": "json",
        }
        try:
            resp = await self._get("/w/api.php", params=params)
            if resp.status_code == 200:
                return resp.json().get("entities", {})
        except Exception as e:
            logger.warning("Wikidata get_entities failed: %s", e)
        return {}

    async def get_game_credits(
        self,
        *,
        steam_id: str | None = None,
        igdb_id: int | None = None,
        title: str | None = None,
    ) -> GameCreditsPayload:
        """Resolve a game entity and extract cast and key crew."""
        entity_id: str | None = None

        if steam_id:
            entity_id = await self.find_entity_by_steam_id(steam_id)
        if not entity_id and igdb_id:
            entity_id = await self.find_entity_by_igdb_id(igdb_id)
        if not entity_id and title:
            entity_id = await self.search_entity_by_title(title)

        if not entity_id:
            return {
                "entity_id": None,
                "fandom_id": None,
                "cast": [],
                "crew": [],
                "characters": [],
            }

        entities = await self.get_entities([entity_id])
        game_data = entities.get(entity_id)
        if not game_data:
            return {
                "entity_id": entity_id,
                "fandom_id": None,
                "cast": [],
                "crew": [],
                "characters": [],
            }

        claims = game_data.get("claims", {})
        cast: list[CastCredit] = []
        crew: list[CrewCredit] = []

        # 0. Game Fandom ID (P6262)
        game_fandom_id: str | None = None
        p6262_game = claims.get("P6262", [])
        if p6262_game:
            raw_fid = p6262_game[0].get("mainsnak", {}).get("datavalue", {}).get("value")
            if isinstance(raw_fid, str):
                game_fandom_id = raw_fid

        # 1. Characters list directly attached to game (P674)
        char_claims = claims.get("P674", [])
        char_entity_ids = [
            c["mainsnak"]["datavalue"]["value"]["id"]
            for c in char_claims
            if c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
        ]

        # 2. Game-level Cast Claims: P725 (voice actor), P161 (cast member), P175 (performer)
        # Links actor to character via P453 (role entity) or P4633 (role name string)
        game_cast_claims = claims.get("P725", []) + claims.get("P161", []) + claims.get("P175", [])
        raw_cast_pairs: list[tuple[str, str | None, str | None]] = []
        for c in game_cast_claims:
            a_id = c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
            if not a_id:
                continue
            quals = c.get("qualifiers", {})
            p4633 = quals.get("P4633", [])
            p453 = quals.get("P453", [])
            role_name_str = None
            role_qid = None
            if p4633:
                role_name_str = p4633[0].get("datavalue", {}).get("value")
            if p453:
                role_qid = p453[0].get("datavalue", {}).get("value", {}).get("id")
                if role_qid and role_qid not in char_entity_ids:
                    char_entity_ids.append(role_qid)
            raw_cast_pairs.append((a_id, role_name_str, role_qid))

        # 3. Directors (P57), Screenwriters (P58), Composers (P86)
        director_ids = [
            c["mainsnak"]["datavalue"]["value"]["id"]
            for c in claims.get("P57", [])
            if c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
        ]
        writer_ids = [
            c["mainsnak"]["datavalue"]["value"]["id"]
            for c in claims.get("P58", [])
            if c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
        ]
        composer_ids = [
            c["mainsnak"]["datavalue"]["value"]["id"]
            for c in claims.get("P86", [])
            if c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
        ]

        # Fetch character entities, cast actor entities, and crew entities
        actor_ids = [p[0] for p in raw_cast_pairs]
        needed_entity_ids = (
            list(char_entity_ids) + actor_ids + director_ids + writer_ids + composer_ids
        )
        entity_map = await self.get_entities(needed_entity_ids)

        characters_list: list[Any] = []
        fallback_cast_pairs: list[tuple[str, str]] = []
        for cid in char_entity_ids:
            cdata = entity_map.get(cid, {})
            c_label = cdata.get("labels", {}).get("en", {}).get("value")
            if not c_label:
                continue
            c_claims = cdata.get("claims", {})

            # Fallback character performer (P175) ONLY if game has no direct cast claims
            if not raw_cast_pairs:
                actor_claim = c_claims.get("P175", [])
                if actor_claim:
                    aid = (
                        actor_claim[0]
                        .get("mainsnak", {})
                        .get("datavalue", {})
                        .get("value", {})
                        .get("id")
                    )
                    if aid:
                        fallback_cast_pairs.append((aid, c_label))

            # Character external IDs and image from claims
            char_img_url = None
            p18_char = c_claims.get("P18", [])
            if p18_char:
                char_img_file = p18_char[0].get("mainsnak", {}).get("datavalue", {}).get("value")
                if char_img_file:
                    char_img_url = f"https://commons.wikimedia.org/wiki/Special:FilePath/{urllib.parse.quote(char_img_file)}"

            char_fandom_id = None
            p6262_char = c_claims.get("P6262", [])
            if p6262_char:
                raw_cfid = p6262_char[0].get("mainsnak", {}).get("datavalue", {}).get("value")
                if isinstance(raw_cfid, str):
                    char_fandom_id = raw_cfid

            char_btva_id = None
            p5604_char = c_claims.get("P5604", [])
            if p5604_char:
                raw_btva = p5604_char[0].get("mainsnak", {}).get("datavalue", {}).get("value")
                if isinstance(raw_btva, str):
                    char_btva_id = raw_btva

            char_wiki_title = cdata.get("sitelinks", {}).get("enwiki", {}).get("title")

            characters_list.append(
                {
                    "character_name": c_label,
                    "wikidata_id": cid,
                    "image_url": char_img_url,
                    "fandom_id": char_fandom_id,
                    "wikipedia_title": char_wiki_title,
                    "btva_id": char_btva_id,
                }
            )

        # Ingest fallback character performers if game had no direct cast
        if fallback_cast_pairs:
            needed_fallback_ids = [aid for aid, _ in fallback_cast_pairs if aid not in entity_map]
            if needed_fallback_ids:
                fb_map = await self.get_entities(needed_fallback_ids)
                entity_map.update(fb_map)
            for aid, c_name in fallback_cast_pairs:
                raw_cast_pairs.append((aid, c_name, None))

        # Build Cast entries from game's direct cast claims (or fallback)
        order = 0
        for actor_id, role_name_str, role_qid in raw_cast_pairs:
            actor_data = entity_map.get(actor_id, {})
            actor_name = actor_data.get("labels", {}).get("en", {}).get("value")
            if not actor_name:
                continue
            char_name = role_name_str
            if not char_name and role_qid:
                char_data = entity_map.get(role_qid, {})
                char_name = char_data.get("labels", {}).get("en", {}).get("value")
            if not char_name:
                char_name = "Cast"

            photo_file = None
            p18 = actor_data.get("claims", {}).get("P18", [])
            if p18:
                photo_file = p18[0].get("mainsnak", {}).get("datavalue", {}).get("value")
            credit = transform_cast_credit(
                actor_name, char_name, photo_filename=photo_file, sort_order=order
            )
            if credit:
                cast.append(credit)
                order += 1

        # Build Crew entries
        for d_id in director_ids:
            d_data = entity_map.get(d_id, {})
            name = d_data.get("labels", {}).get("en", {}).get("value")
            if name:
                photo_file = None
                p18 = d_data.get("claims", {}).get("P18", [])
                if p18:
                    photo_file = p18[0].get("mainsnak", {}).get("datavalue", {}).get("value")
                crew_credit = transform_crew_credit(name, "director", photo_filename=photo_file)
                if crew_credit:
                    crew.append(crew_credit)

        for w_id in writer_ids:
            w_data = entity_map.get(w_id, {})
            name = w_data.get("labels", {}).get("en", {}).get("value")
            if name:
                photo_file = None
                p18 = w_data.get("claims", {}).get("P18", [])
                if p18:
                    photo_file = p18[0].get("mainsnak", {}).get("datavalue", {}).get("value")
                crew_credit = transform_crew_credit(name, "writer", photo_filename=photo_file)
                if crew_credit:
                    crew.append(crew_credit)

        for c_id in composer_ids:
            c_data = entity_map.get(c_id, {})
            name = c_data.get("labels", {}).get("en", {}).get("value")
            if name:
                photo_file = None
                p18 = c_data.get("claims", {}).get("P18", [])
                if p18:
                    photo_file = p18[0].get("mainsnak", {}).get("datavalue", {}).get("value")
                crew_credit = transform_crew_credit(name, "composer", photo_filename=photo_file)
                if crew_credit:
                    crew.append(crew_credit)

        return {
            "entity_id": entity_id,
            "fandom_id": game_fandom_id,
            "cast": cast,
            "crew": crew,
            "characters": characters_list,
        }
