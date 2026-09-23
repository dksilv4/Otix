"""Fandom MediaWiki provider client for video game characters and imagery."""

from __future__ import annotations

import logging
import re
import urllib.parse
from typing import TYPE_CHECKING

import httpx
from django.conf import settings

from core.providers.fandom.schemas import FandomActor, FandomCharacter, FandomImage
from core.providers.framework import (
    BaseProviderClient,
    resolve_shared_http_client,
)

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
DEFAULT_REFERER = "https://fandom.com"

# Fandom community subdomains that host non-game or non-narrative content
NON_GAME_COMMUNITIES = {
    "logos",
    "logopedia",
    "video-game-databank",
    "xbox",
    "gamicus",
    "video-games",
    "gaming",
    "games",
    "soundtrack",
    "soundtracks",
    "transcripts",
    "dubbing",
    "doblaje",
    "quotes",
    "crappy-games",
    "awesome-games",
    "greatest-movies",
    "terrible-movies",
    "trope",
    "tropes",
    "fictional-companies",
    "community",
    "wikia",
    "tv",
    "cinema",
}

# Franchise-wide wikis covering multiple games, comics, and films.
# For these, Category:Characters MUST NOT be dumped into a single game;
# only game-specific categories (e.g. Category:Silent Hill f characters) are permitted.
FRANCHISE_COMMUNITIES = {
    "marvel",
    "dc",
    "batman",
    "forza",
    "silenthill",
    "residentevil",
    "starwars",
    "pokemon",
    "disney",
    "lego",
    "mario",
    "finalfantasy",
    "assassinscreed",
    "callofduty",
    "gta",
    "nintendo",
}

# Keywords indicating generic wiki UI assets rather than character art
UI_FILE_KEYWORDS = {
    "icon",
    "logo",
    "wordmark",
    "button",
    "arrow",
    "stub",
    "spoiler",
    "edit",
    "star",
    "badge",
    "disambig",
    "flag",
    "symbol",
    "bullet",
}

_shared_client: httpx.AsyncClient | None = None
_shared_client_loop_id: int | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a process-shared AsyncClient bound to Fandom with required headers."""
    global _shared_client, _shared_client_loop_id
    timeout = getattr(settings, "FANDOM_REQUEST_TIMEOUT_SECONDS", 10.0)
    _shared_client, _shared_client_loop_id = resolve_shared_http_client(
        _shared_client,
        _shared_client_loop_id,
        base_url="https://fandom.com",
        timeout=timeout,
        headers={
            "User-Agent": getattr(settings, "FANDOM_USER_AGENT", DEFAULT_USER_AGENT),
            "Referer": DEFAULT_REFERER,
        },
    )
    return _shared_client


def clean_fandom_image_url(url: str | None) -> str | None:
    """Strip thumbnail scaling tokens from a Fandom CDN URL to get full resolution."""
    if not url:
        return None
    # Strip /scale-to-width-down/1000 or /scale-to-width/...
    url = re.sub(r"/scale-to-width(-down)?/\d+", "", url)
    return url


def _strip_wiki_templates(text: str) -> str:
    """Strip top-level and nested MediaWiki templates {{...}} properly handling nesting."""
    result = []
    depth = 0
    i = 0
    n = len(text)
    while i < n:
        if i + 1 < n and text[i : i + 2] == "{{":
            depth += 1
            i += 2
        elif i + 1 < n and text[i : i + 2] == "}}":
            if depth > 0:
                depth -= 1
            i += 2
        else:
            if depth == 0:
                result.append(text[i])
            i += 1
    return "".join(result)


class FandomProvider(BaseProviderClient):
    """Client for retrieving character images, galleries, and bios from Fandom wikis."""

    def __init__(
        self,
        *,
        redis: Redis | None = None,
        http_client: httpx.AsyncClient | None = None,
        circuit_threshold: int = 5,
        circuit_recovery: float = 30.0,
    ) -> None:
        self._custom_http = http_client
        client = http_client or get_http_client()
        rate = float(getattr(settings, "FANDOM_GLOBAL_RPS_LIMIT", 5.0))
        super().__init__(
            name="fandom",
            redis=redis,
            http_client=client,
            rate=rate,
            burst=int(rate * 2),
            circuit_threshold=circuit_threshold,
            circuit_recovery=circuit_recovery,
        )

    def _get_client(self) -> httpx.AsyncClient:
        if self._custom_http is not None:
            return self._custom_http
        client = get_http_client()
        self.http = client
        return client

    async def detect_community(
        self,
        game_title: str,
        game_slug: str,
        fandom_id: str | None = None,
    ) -> str | None:
        """Detect the Fandom community subdomain for a game.

        Prioritizes dedicated slug candidates (e.g. 'pragmata', 'hades', 'sonic'),
        validates external IDs against known non-narrative wikis, and verifies siteinfo.
        """
        client = self._get_client()

        # 1. Probe slug & franchise candidates first (most specific & authoritative)
        normalized_slug = re.sub(r"[^a-z0-9\-]", "", game_slug.lower())
        candidates = [normalized_slug]
        if "arkham" in normalized_slug:
            candidates.insert(0, "arkhamcity")
        if "god-of-war" in normalized_slug or "godofwar" in normalized_slug:
            candidates.insert(0, "godofwar")
        if "-" in normalized_slug:
            parts = normalized_slug.split("-")
            candidates.append(parts[0])  # e.g. 'witcher', 'batman', 'clair'
            if len(parts) >= 2:
                candidates.append(f"{parts[0]}-{parts[1]}")  # e.g. 'clair-obscur'
                candidates.append("".join(parts[:2]))  # e.g. 'expedition33'

        for cand in candidates:
            if not cand or len(cand) < 3 or cand in NON_GAME_COMMUNITIES:
                continue
            api_url = f"https://{cand}.fandom.com/api.php?action=query&meta=siteinfo&format=json"
            try:
                resp = await client.get(api_url, timeout=2.5)
                if resp.status_code == 200:
                    data = resp.json()
                    if "query" in data and "general" in data["query"]:
                        return cand
            except Exception:
                continue

        # 2. Check known Fandom ID (e.g. from Wikidata P6262 'clair-obscur:Gustave')
        if fandom_id and ":" in fandom_id:
            community = fandom_id.split(":", 1)[0].strip().lower()
            if "." in community:
                community = community.split(".", 1)[-1]
            if community and community not in NON_GAME_COMMUNITIES:
                api_url = (
                    f"https://{community}.fandom.com/api.php?action=query&meta=siteinfo&format=json"
                )
                try:
                    resp = await client.get(api_url, timeout=2.5)
                    if resp.status_code == 200:
                        data = resp.json()
                        if "query" in data and "general" in data["query"]:
                            return community
                except Exception:
                    pass

        return None

    async def get_community_characters(
        self, community: str, game_title: str = "", limit: int = 150
    ) -> list[str]:
        """Retrieve characters listed in game or character categories for a Fandom wiki."""
        client = self._get_client()
        categories: list[str] = []
        if game_title:
            clean_title = game_title.split("–")[0].split("-")[0].strip()
            categories.append(f"Category:{game_title} characters")
            categories.append(f"Category:{game_title} Characters")
            if clean_title != game_title:
                categories.append(f"Category:{clean_title} characters")
                categories.append(f"Category:{clean_title} Characters")
                categories.append(f"Category:{clean_title}")

        # Generic categories are ONLY allowed for dedicated wikis (never franchise wikis)
        if community not in FRANCHISE_COMMUNITIES:
            categories.append(f"Category:{community.capitalize()} characters")
            categories.append("Category:Characters")

        chars: list[str] = []
        visited_cats: set[str] = set()
        queue = list(categories)

        while queue and len(chars) < limit:
            cat = queue.pop(0)
            if cat in visited_cats:
                continue
            visited_cats.add(cat)

            # For dedicated wikis, also inspect subcategories (e.g. Expeditioners, Gestrals, Expedition 33)
            cmtype = "page|subcat" if community not in FRANCHISE_COMMUNITIES else "page"
            url = (
                f"https://{community}.fandom.com/api.php?"
                f"action=query&list=categorymembers&cmtitle={urllib.parse.quote(cat)}"
                f"&cmlimit=100&cmtype={cmtype}&format=json"
            )
            try:
                resp = await client.get(url, timeout=4.0)
                if resp.status_code == 200:
                    data = resp.json()
                    members = data.get("query", {}).get("categorymembers", [])
                    for m in members:
                        ns = m.get("ns")
                        title = m.get("title", "").strip()
                        if ns == 14:  # Subcategory
                            lower_cat = title.lower()
                            if any(
                                kw in lower_cat
                                for kw in (
                                    "character",
                                    "expedition",
                                    "gestral",
                                    "merchant",
                                    "party",
                                    "people",
                                    "npc",
                                    "boss",
                                    "enem",
                                )
                            ):
                                if title not in visited_cats and title not in queue:
                                    queue.append(title)
                        elif ns == 0:
                            if not title or title.lower() in (
                                "character",
                                "characters",
                                "minor characters",
                                "list of characters",
                                "categories",
                            ):
                                continue
                            if ":" in title:
                                continue
                            if title not in chars:
                                chars.append(title)
                                if len(chars) >= limit:
                                    break
            except Exception as e:
                logger.debug("Failed querying %s on %s: %s", cat, community, e)

        return chars

    async def get_character_page(
        self,
        community: str,
        character_name: str,
    ) -> FandomCharacter | None:
        """Fetch character details, primary portrait, and gallery images from a Fandom wiki."""
        client = self._get_client()
        clean_name = character_name.strip()
        encoded_name = urllib.parse.quote(clean_name)

        # 1. Query pageimages, images list, and canonical URL
        query_url = (
            f"https://{community}.fandom.com/api.php?"
            f"action=query&titles={encoded_name}&redirects=1"
            f"&prop=pageimages|images|info&inprop=url&pithumbsize=1000&format=json"
        )
        try:
            resp = await client.get(query_url)
            if resp.status_code == 429:
                import asyncio
                await asyncio.sleep(1.0)
                resp = await client.get(query_url)
            if resp.status_code != 200:
                logger.warning(
                    "Fandom query returned status %s for %s/%s",
                    resp.status_code,
                    community,
                    clean_name,
                )
                return None
            data = resp.json()
        except Exception as e:
            logger.error("Failed querying Fandom for %s/%s: %s", community, clean_name, e)
            return None

        pages = data.get("query", {}).get("pages", {})
        if not pages:
            return None

        page = next(iter(pages.values()), {})
        page_id = page.get("pageid", -1)

        # If direct title lookup failed, try normalized (unaccented) name
        if page_id <= 0 or "missing" in page:
            from core.providers.wikidata import normalize_character_name

            norm_name = normalize_character_name(clean_name)
            if norm_name and norm_name.lower() != clean_name.lower():
                norm_res = await self.get_character_page(community, norm_name)
                if norm_res:
                    return norm_res

            # Try stripping "The " prefix (e.g. "The Joker" -> "Joker", "The Riddler" -> "Riddler")
            if clean_name.lower().startswith("the "):
                stripped_name = clean_name[4:].strip()
                stripped_res = await self.get_character_page(community, stripped_name)
                if stripped_res:
                    return stripped_res

            # Try searching the wiki as a fallback
            search_url = (
                f"https://{community}.fandom.com/api.php?"
                f"action=query&list=search&srsearch={encoded_name}&srlimit=1&format=json"
            )
            try:
                s_resp = await client.get(search_url)
                if s_resp.status_code == 200:
                    s_data = s_resp.json()
                    search_results = s_data.get("query", {}).get("search", [])
                    if search_results:
                        canonical_title = search_results[0].get("title")
                        if canonical_title and canonical_title.lower() != clean_name.lower():
                            return await self.get_character_page(community, canonical_title)
            except Exception:
                pass
            return None

        page_title = page.get("title", clean_name)
        full_url = (
            page.get("fullurl")
            or f"https://{community}.fandom.com/wiki/{urllib.parse.quote(page_title)}"
        )
        thumb_source = page.get("thumbnail", {}).get("source")
        primary_image_url = clean_fandom_image_url(thumb_source)

        images_list: list[FandomImage] = []
        if primary_image_url:
            images_list.append(
                FandomImage(
                    url=primary_image_url,
                    title=page.get("pageimage", page_title),
                    width=page.get("thumbnail", {}).get("width"),
                    height=page.get("thumbnail", {}).get("height"),
                    is_primary=True,
                    caption=f"{page_title} official portrait",
                )
            )

        # 2. Filter embedded page images and batch fetch imageinfo
        raw_images = page.get("images", [])
        filtered_files: list[str] = []
        for img in raw_images:
            img_title = img.get("title", "")
            if not img_title.startswith("File:"):
                continue
            lower_title = img_title.lower()
            if any(junk in lower_title for junk in UI_FILE_KEYWORDS):
                continue
            filtered_files.append(img_title)

        if filtered_files:
            # Batch up to 20 files
            batch_files = filtered_files[:20]
            pipe_titles = urllib.parse.quote("|".join(batch_files))
            info_url = (
                f"https://{community}.fandom.com/api.php?"
                f"action=query&titles={pipe_titles}&prop=imageinfo&iiprop=url|size&format=json"
            )
            try:
                info_resp = await client.get(info_url)
                if info_resp.status_code == 200:
                    info_data = info_resp.json()
                    for img_page in info_data.get("query", {}).get("pages", {}).values():
                        infos = img_page.get("imageinfo", [])
                        if not infos:
                            continue
                        info = infos[0]
                        img_url = clean_fandom_image_url(info.get("url"))
                        w = info.get("width")
                        h = info.get("height")
                        # Skip tiny icons / buttons
                        if not img_url or (w and h and (w < 150 or h < 150)):
                            continue
                        # Avoid duplicating the primary image
                        if any(existing.url == img_url for existing in images_list):
                            continue

                        caption = img_page.get("title", "").replace("File:", "").rsplit(".", 1)[0]
                        caption = caption.replace("_", " ")

                        images_list.append(
                            FandomImage(
                                url=img_url,
                                title=img_page.get("title", ""),
                                width=w,
                                height=h,
                                is_primary=False,
                                caption=caption,
                            )
                        )
            except Exception as e:
                logger.debug("Failed fetching imageinfo for %s: %s", community, e)

        # 3. Parse wikitext for infobox & bio
        description: str | None = None
        gender: str | None = None
        species: str | None = None
        aliases: list[str] = []
        actors: list[FandomActor] = []

        parse_url = (
            f"https://{community}.fandom.com/api.php?"
            f"action=parse&page={urllib.parse.quote(page_title)}&redirects=1&prop=wikitext&format=json"
        )
        try:
            p_resp = await client.get(parse_url)
            if p_resp.status_code == 200:
                p_data = p_resp.json()
                wikitext = p_data.get("parse", {}).get("wikitext", {}).get("*", "")
                if wikitext:
                    gender, species, aliases, actors, bio = self._parse_wikitext(wikitext)
                    if bio:
                        description = bio
        except Exception as e:
            logger.debug("Failed parsing wikitext for %s/%s: %s", community, page_title, e)

        # 4. Fallback image resolution if pageimages didn't provide a thumbnail
        if not primary_image_url:
            candidate_files: list[str] = []
            if wikitext:
                m_img = re.search(r"\|\s*image\s*=\s*([^|\n}]+)", wikitext, re.IGNORECASE)
                if m_img:
                    raw_val = m_img.group(1).strip()
                    clean_file = re.sub(r"^\[\[(?:File|Image):|\]\]", "", raw_val).strip()
                    if clean_file and not clean_file.startswith("File:"):
                        clean_file = f"File:{clean_file}"
                    if clean_file:
                        candidate_files.append(clean_file)

            # Common naming conventions on video game wikis
            for pattern in (
                f"File:COE33 char icon {page_title}.png",
                f"File:COE33 {page_title}.jpg",
                f"File:COE33 {page_title.replace('-', ' ')}.jpg",
                f"File:COE33 {page_title}.png",
                f"File:Coe33 {page_title.lower()}.png",
                f"File:Coe33 {page_title.lower()}.jpg",
                f"File:{page_title}.png",
                f"File:{page_title}.jpg",
            ):
                if pattern not in candidate_files:
                    candidate_files.append(pattern)

            if candidate_files:
                pipe_candidates = urllib.parse.quote("|".join(candidate_files))
                cand_url = (
                    f"https://{community}.fandom.com/api.php?"
                    f"action=query&titles={pipe_candidates}&prop=imageinfo&iiprop=url|size&format=json"
                )
                try:
                    cand_resp = await client.get(cand_url, timeout=3.5)
                    if cand_resp.status_code == 200:
                        cand_data = cand_resp.json()
                        for c_page in cand_data.get("query", {}).get("pages", {}).values():
                            infos = c_page.get("imageinfo", [])
                            if infos and infos[0].get("url"):
                                cand_img_url = clean_fandom_image_url(infos[0]["url"])
                                if cand_img_url:
                                    primary_image_url = cand_img_url
                                    images_list.insert(
                                        0,
                                        FandomImage(
                                            url=cand_img_url,
                                            title=c_page.get("title", page_title),
                                            width=infos[0].get("width"),
                                            height=infos[0].get("height"),
                                            is_primary=True,
                                            caption=f"{page_title} official portrait",
                                        ),
                                    )
                                    break
                except Exception as e:
                    logger.debug("Failed querying candidate image files for %s: %s", page_title, e)

            # Fallback to first available gallery image if still None
            if not primary_image_url and images_list:
                primary_image_url = images_list[0].url
                images_list[0].is_primary = True

        return FandomCharacter(
            name=page_title,
            community=community,
            page_title=page_title,
            full_url=full_url,
            primary_image_url=primary_image_url,
            images=images_list,
            description=description,
            gender=gender,
            species=species,
            aliases=aliases,
            actors=actors,
        )

    def _parse_wikitext(
        self, text: str
    ) -> tuple[str | None, str | None, list[str], list[FandomActor], str | None]:
        """Extract gender, species, aliases, actors, and clean intro text from wikitext."""
        gender = None
        species = None
        aliases: list[str] = []
        actors: list[FandomActor] = []

        # Find gender
        m_gender = re.search(r"\|\s*gender\s*=\s*([^|\n}]+)", text, re.IGNORECASE)
        if m_gender:
            g_raw = re.sub(r"\[\[|\]\]", "", m_gender.group(1)).strip().lower()
            if "female" in g_raw:
                gender = "female"
            elif "male" in g_raw:
                gender = "male"

        # Find species
        m_species = re.search(r"\|\s*species\s*=\s*([^|\n}]+)", text, re.IGNORECASE)
        if m_species:
            s_raw = re.sub(r"\[\[|\]\]", "", m_species.group(1)).strip()
            if s_raw:
                species = s_raw.split("<")[0].strip()

        # Find aliases
        m_aliases = re.search(r"\|\s*aliases\s*=\s*([^|\n}]+)", text, re.IGNORECASE)
        if m_aliases:
            a_raw = (
                m_aliases.group(1)
                .replace("<br>", "\n")
                .replace("<br/>", "\n")
                .replace("<br />", "\n")
            )
            for line in a_raw.split("\n"):
                clean = re.sub(r"\[\[|\]\]|<[^>]+>", "", line).strip()
                if clean and clean not in aliases:
                    aliases.append(clean)

        # Find voice actors / cast members
        actor_pattern = (
            r"\n[^\S\r\n]*\|[^\S\r\n]*(portrayed[\s_]*by|voice[\s_]*actor|voiced[\s_]*by|voice|actor|"
            r"english[\s_]*voice|japanese[\s_]*voice)[^\S\r\n]*=[^\S\r\n]*(.*?)(?=\r?\n[^\S\r\n]*(?:\||\}\}))"
        )
        non_english_headers = (
            "german",
            "french",
            "italian",
            "spanish",
            "polish",
            "russian",
            "portuguese",
            "brazilian",
            "turkish",
            "greek",
            "latin",
            "korean",
            "chinese",
        )
        junk_names = {
            "n/a",
            "none",
            "unknown",
            "various",
            "tba",
            "tbd",
            "uncredited",
            "actor",
            "actors",
            "cast",
        }

        for match in re.finditer(actor_pattern, text, re.IGNORECASE | re.DOTALL):
            param_name = match.group(1).lower()
            raw_val = match.group(2).strip()
            chunks = re.split(r"<br\s*/?>|\n", raw_val, flags=re.IGNORECASE)
            current_lang = "Japanese" if "japanese" in param_name else "English"
            skip_subsequent = False

            for chunk in chunks:
                chunk = chunk.strip()
                if not chunk:
                    continue

                # Strip URLs, citations, refs, and external links
                clean = re.sub(r"https?://\S+", "", chunk)
                clean = re.sub(r"<ref[^>]*>.*?</ref>", "", clean, flags=re.DOTALL | re.IGNORECASE)
                clean = re.sub(r"<ref[^>]*/>", "", clean, flags=re.IGNORECASE)
                clean = re.sub(r"<[^>]+>", "", clean)
                clean = re.sub(r"\{\{WP\|([^}|]+)(?:\|[^}]+)?\}\}", r"\1", clean)
                clean = re.sub(r"\{\{[^}]*\}\}", "", clean)
                clean = re.sub(r"\[https?://[^\s\]]+\s*([^\]]*)\]", r"\1", clean)
                clean = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", clean)
                clean = re.sub(r"'{2,}", "", clean)

                # Check if this line is a language sub-header
                lower_clean = clean.lower()
                if any(h in lower_clean for h in non_english_headers) and any(
                    kw in lower_clean for kw in ("voice", "actor", "dub", ":")
                ):
                    skip_subsequent = True
                    continue
                if "english" in lower_clean and any(
                    kw in lower_clean for kw in ("voice", "actor", "dub", ":")
                ):
                    skip_subsequent = False
                    current_lang = "English"
                    continue
                if "japanese" in lower_clean and any(
                    kw in lower_clean for kw in ("voice", "actor", "dub", ":")
                ):
                    skip_subsequent = False
                    current_lang = "Japanese"
                    continue

                if skip_subsequent:
                    continue

                # Strip bullet points, asterisks, hashes
                clean = re.sub(r"^[\*\#\-\s•]+", "", clean)
                # Strip trailing notes: " - As Young Kratos...", " (young...)"
                clean = re.sub(r"\s+[\-–—]\s*.*$", "", clean)
                clean = re.sub(r"\s*\(.*?\)", "", clean)
                clean = clean.strip(" \t\r\n'\"[]():;,")

                # Validate clean name
                if not clean or len(clean) < 3 or len(clean) > 50:
                    continue
                if clean.lower() in junk_names:
                    continue
                if any(
                    kw in clean.lower()
                    for kw in ("voice actor", "voice actors", "actors", "cast", "dubbing")
                ):
                    continue
                if re.search(r"[\d/\\=_|@+<>^{}]", clean):
                    continue
                if not re.match(r"^[A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s\.\-']+$", clean):
                    continue
                if len(clean.split()) < 2:
                    continue

                lang = (
                    "Japanese"
                    if re.search(r"japanese|\(ja\)|\bjp\b", chunk, re.IGNORECASE)
                    else current_lang
                )

                if not any(a.name == clean for a in actors):
                    actors.append(FandomActor(name=clean, language=lang, role="cast"))
        # Extract intro paragraph (text between templates and the first == heading)
        cleaned = _strip_wiki_templates(text)
        parts = re.split(r"==+[^=]+==+", cleaned)
        intro = parts[0].strip() if parts else ""
        # Clean links, tags, and formatting
        intro = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", intro)
        intro = re.sub(r"'''?", "", intro)
        intro = re.sub(r"<ref[^>]*>.*?</ref>", "", intro, flags=re.DOTALL)
        intro = re.sub(r"<[^>]+>", "", intro)
        intro = re.sub(r"\(\s*\)", "", intro)  # remove empty parentheses from furigana
        intro = re.sub(r"\n\s*\n", "\n\n", intro).strip()

        bio = intro if len(intro) > 30 else None
        return gender, species, aliases, actors, bio
