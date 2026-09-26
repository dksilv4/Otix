#!/usr/bin/env python3
"""
Otix Admin Distributed Compute Worker (Turbo Edition: Media-Grouped + Theme Analyzer + Wikidata Offload).

A high-performance pipelined runner that allows administrators to use their
workstations (e.g. 16-thread Ryzen 7 9800X3D) to offload:
1. Media-grouped artwork processing: evaluates all candidates locally and uploads ONLY winners
   for General, Dark, Light, and Textless UI contexts (saving 70-80% VM disk space).
2. Artwork theme classification (guess_white, guess_black, guess_colorful, guess_multicolor, guess_gray).
3. Public Wikidata & Wikipedia metadata enrichment (game voice cast, characters, crew, and movie distributors).

Usage:
    python scripts/admin_worker.py --server http://84.8.154.67:8000 --username worker --password worker --threads 16 --batch-size 20
"""

import argparse
import getpass
import io
import os
import queue
import signal
import sys
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx
from PIL import Image

# Ensure Windows terminal doesn't crash on Unicode characters or charmap encoding
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


class Colors:
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    GRAY = "\033[90m"
    MAGENTA = "\033[95m"
    BOLD = "\033[1m"
    RESET = "\033[0m"


def print_banner(
    server: str,
    workers: int,
    batch_size: int,
    task: str = "artwork",
    model_name: str = "BAAI/bge-m3",
):
    print(
        f"\n{Colors.CYAN}{Colors.BOLD}=================================================================={Colors.RESET}"
    )
    print(
        f"{Colors.CYAN}{Colors.BOLD}   OTIX DISTRIBUTED WORKER (TURBO + MEDIA-GROUPED + EMBEDDINGS)   {Colors.RESET}"
    )
    print(
        f"{Colors.CYAN}{Colors.BOLD}=================================================================={Colors.RESET}"
    )
    print(f"  {Colors.BOLD}Server URL:{Colors.RESET}       {server}")
    print(f"  {Colors.BOLD}Task Mode:{Colors.RESET}        {task.upper()}")
    if task in ("artwork", "both"):
        print(f"  {Colors.BOLD}Worker Threads:{Colors.RESET}   {workers} (pipelined streaming)")
        print(
            f"  {Colors.BOLD}Artwork Mode:{Colors.RESET}     Media-Grouped Winner-Only (70-80% storage saved)"
        )
        print(
            f"  {Colors.BOLD}Metadata Offload:{Colors.RESET} Public Wikidata Cast, Characters & Distributors"
        )
    if task in ("embeddings", "both"):
        print(
            f"  {Colors.BOLD}Embedding Model:{Colors.RESET}  {model_name} (1024-dim dense vectors)"
        )
    print(f"  {Colors.BOLD}Batch Size:{Colors.RESET}       {batch_size} items/claim")
    print(
        f"  {Colors.BOLD}Auth Mode:{Colors.RESET}        Zero-Trust Admin Compute with Auto-Refresh"
    )
    print(
        f"{Colors.CYAN}------------------------------------------------------------------{Colors.RESET}\n"
    )


# Theme classification constants matching backend color_analyzer service
_NEUTRAL_SAT = 0.12
_DARK_LIGHTNESS = 0.28
_LIGHT_LIGHTNESS = 0.75
_MULTICOLOR_CHROMATIC_MIN = 0.5
_HUE_BIN_COUNT = 12
_HUE_BIN_MIN_SHARE = 0.08
_HUE_DOMINANT_MAX = 0.8

_LOGO_THEME_RANK = {
    "dark": {
        "guess_white": 2,
        "guess_colorful": 1,
        "guess_multicolor": 1,
        "guess_gray": 1,
        "guess_black": 0,
        None: 1,
    },
    "light": {
        "guess_black": 2,
        "guess_colorful": 1,
        "guess_multicolor": 1,
        "guess_gray": 1,
        "guess_white": 0,
        None: 1,
    },
}

_BACKDROP_THEME_RANK = {
    "dark": {
        "guess_black": 2,
        "guess_colorful": 1,
        "guess_multicolor": 1,
        "guess_gray": 1,
        "guess_white": 0,
        None: 1,
    },
    "light": {
        "guess_white": 2,
        "guess_colorful": 1,
        "guess_multicolor": 1,
        "guess_gray": 1,
        "guess_black": 0,
        None: 1,
    },
}


def _rgb_to_hsl(r: int, g: int, b: int) -> Tuple[float, float, float]:
    """Convert an 8-bit RGB pixel to HSL (h in 0..360, s/l in 0..1)."""
    rn, gn, bn = r / 255.0, g / 255.0, b / 255.0
    mx = max(rn, gn, bn)
    mn = min(rn, gn, bn)
    delta = mx - mn
    l_val = (mx + mn) / 2.0
    if delta == 0:
        return 0.0, 0.0, l_val
    s_val = delta / (2.0 - mx - mn) if l_val > 0.5 else delta / (mx + mn)
    if mx == rn:
        h_val = ((gn - bn) / delta + (6.0 if gn < bn else 0.0)) / 6.0
    elif mx == gn:
        h_val = ((bn - rn) / delta + 2.0) / 6.0
    else:
        h_val = ((rn - gn) / delta + 4.0) / 6.0
    return h_val * 360.0, s_val, l_val


def _relative_luminance(r: int, g: int, b: int) -> float:
    """ITU-R BT.709 perceived luminance in 0..1."""
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0


def _classify_transparent_graphic(image: Image.Image) -> str | None:
    """Classify logos or transparent icons based on visible pixels."""
    if image.mode != "RGBA":
        image = image.convert("RGBA")

    image = image.resize((64, 64), resample=Image.Resampling.BILINEAR)
    raw_pixels = list(image.getdata())

    visible = [(r, g, b) for r, g, b, a in raw_pixels if a >= 128]
    if not visible:
        return None
    total = len(visible)

    black = white = gray = dark_color = light_color = colorful = 0
    hue_bins = [0] * _HUE_BIN_COUNT
    chromatic = 0

    for r, g, b in visible:
        h, s, l_val = _rgb_to_hsl(r, g, b)
        if s < _NEUTRAL_SAT:
            if l_val < _DARK_LIGHTNESS:
                black += 1
            elif l_val > _LIGHT_LIGHTNESS:
                white += 1
            else:
                gray += 1
        else:
            chromatic += 1
            hue_bins[int(h // (360.0 / _HUE_BIN_COUNT)) % _HUE_BIN_COUNT] += 1
            if l_val < _DARK_LIGHTNESS:
                dark_color += 1
            elif l_val > _LIGHT_LIGHTNESS:
                light_color += 1
            else:
                colorful += 1

    dark = (black + dark_color) / total
    light = (white + light_color) / total
    gray_ratio = gray / total
    colorful_ratio = colorful / total
    chromatic_ratio = chromatic / total

    if chromatic_ratio >= _MULTICOLOR_CHROMATIC_MIN and chromatic > 0:
        shares = [c / chromatic for c in hue_bins if c > 0]
        dominant = max(shares)
        distinct = sum(1 for s in shares if s >= _HUE_BIN_MIN_SHARE)
        if distinct >= 2 and dominant <= _HUE_DOMINANT_MAX:
            return "guess_multicolor"

    ratios = {
        "guess_black": dark,
        "guess_white": light,
        "guess_gray": gray_ratio,
        "guess_colorful": colorful_ratio,
    }
    best = max(ratios, key=ratios.get)
    if ratios[best] >= 0.5:
        return best

    if colorful_ratio >= 0.35 and colorful_ratio >= max(dark, light, gray_ratio):
        return "guess_colorful"
    if dark >= 0.3 and dark >= light:
        return "guess_black"
    if light >= 0.3:
        return "guess_white"
    if gray_ratio >= 0.3:
        return "guess_gray"
    return "guess_gray"


def _classify_opaque_image(image: Image.Image, asset_type: str) -> str | None:
    """Classify backdrops or posters based on perceived luminance and color."""
    if image.mode != "RGB":
        image = image.convert("RGB")

    image = image.resize((64, 64), resample=Image.Resampling.BILINEAR)
    raw_pixels = list(image.getdata())
    if not raw_pixels:
        return None

    total = len(raw_pixels)
    total_lum = 0.0
    total_sat = 0.0

    for r, g, b in raw_pixels:
        total_lum += _relative_luminance(r, g, b)
        _, s, _ = _rgb_to_hsl(r, g, b)
        total_sat += s

    avg_lum = total_lum / total
    avg_sat = total_sat / total

    if asset_type in ("backdrop", "textless_backdrop"):
        if avg_lum < 0.35:
            return "guess_black"
        if avg_lum > 0.65:
            return "guess_white"
    else:  # poster, textless_poster, icon
        if avg_lum < 0.30:
            return "guess_black"
        if avg_lum > 0.70:
            return "guess_white"

    if avg_sat > 0.25:
        return "guess_colorful"
    return "guess_gray"


def classify_theme(image: Image.Image, asset_type: str = "logo") -> str:
    """Classify artwork into standard Otix theme contrast labels."""
    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)

    if asset_type in ("logo", "icon") and has_alpha:
        if image.mode != "RGBA":
            image = image.convert("RGBA")
        alphas = [a for _, _, _, a in image.getdata()]
        if any(a < 250 for a in alphas):
            return _classify_transparent_graphic(image) or "guess_gray"

    if asset_type in ("logo", "icon"):
        return _classify_transparent_graphic(image) or "guess_gray"

    return _classify_opaque_image(image, asset_type) or "guess_gray"


def extract_dominant_color(img: Image.Image) -> str:
    """Extract a dominant color hex string (#RRGGBB) from an image."""
    try:
        small = img.copy().convert("RGB")
        small.thumbnail((50, 50), Image.Resampling.BOX)
        quantized = small.quantize(colors=8, method=Image.Quantize.FASTOCTREE)
        palette = quantized.getpalette()
        color_counts = sorted(quantized.getcolors(50 * 50) or [], key=lambda x: x[0], reverse=True)
        if color_counts and palette:
            dominant_idx = color_counts[0][1]
            r = palette[dominant_idx * 3]
            g = palette[dominant_idx * 3 + 1]
            b = palette[dominant_idx * 3 + 2]
            return f"#{r:02x}{g:02x}{b:02x}"
    except Exception:
        pass
    return "#333333"


class WikidataResolver:
    """Public, unauthenticated Wikidata and Wikipedia resolver."""

    SPARQL_URL = "https://query.wikidata.org/sparql"
    WIKIDATA_API = "https://www.wikidata.org/w/api.php"
    USER_AGENT = "OtixWorker/1.0 (https://github.com/dksilv4/Otix; admin@otix.media)"

    def __init__(self):
        limits = httpx.Limits(max_keepalive_connections=16, max_connections=32)
        self.client = httpx.Client(
            headers={"User-Agent": self.USER_AGENT},
            timeout=15.0,
            limits=limits,
            follow_redirects=True,
        )

    def sparql_query(self, query: str) -> List[Dict[str, Any]]:
        try:
            resp = self.client.get(
                self.SPARQL_URL,
                params={"query": query, "format": "json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("results", {}).get("bindings", [])
        except Exception:
            pass
        return []

    def resolve_game_qid(
        self, steam_id: Optional[str], igdb_id: Optional[str], title: str
    ) -> Optional[str]:
        # 1. By Steam ID (P1733)
        if steam_id:
            q = f'SELECT ?item WHERE {{ ?item wdt:P1733 "{steam_id}" . }} LIMIT 1'
            bindings = self.sparql_query(q)
            if bindings:
                return bindings[0]["item"]["value"].split("/")[-1]

        # 2. By IGDB ID (P5794)
        if igdb_id:
            q = f'SELECT ?item WHERE {{ ?item wdt:P5794 "{igdb_id}" . }} LIMIT 1'
            bindings = self.sparql_query(q)
            if bindings:
                return bindings[0]["item"]["value"].split("/")[-1]

        # 3. By Title Search
        if title:
            try:
                resp = self.client.get(
                    self.WIKIDATA_API,
                    params={
                        "action": "wbsearchentities",
                        "search": title,
                        "type": "item",
                        "language": "en",
                        "limit": 5,
                        "format": "json",
                    },
                )
                if resp.status_code == 200:
                    results = resp.json().get("search", [])
                    for res in results:
                        desc = (res.get("description") or "").lower()
                        if any(
                            k in desc
                            for k in ("video game", "game", "action game", "rpg", "shooter")
                        ):
                            return res.get("id")
                    if results:
                        return results[0].get("id")
            except Exception:
                pass
        return None

    def fetch_entities(self, qids: List[str]) -> Dict[str, Any]:
        if not qids:
            return {}
        entities: Dict[str, Any] = {}
        # Fetch in chunks of 50
        for i in range(0, len(qids), 50):
            chunk = qids[i : i + 50]
            try:
                resp = self.client.get(
                    self.WIKIDATA_API,
                    params={
                        "action": "wbgetentities",
                        "ids": "|".join(chunk),
                        "props": "labels|claims|sitelinks",
                        "languages": "en",
                        "format": "json",
                    },
                )
                if resp.status_code == 200:
                    data = resp.json().get("entities", {})
                    entities.update(data)
            except Exception:
                pass
        return entities

    def resolve_game_credits(
        self, steam_id: Optional[str], igdb_id: Optional[str], title: str
    ) -> Dict[str, Any]:
        qid = self.resolve_game_qid(steam_id, igdb_id, title)
        if not qid:
            return {}

        entities = self.fetch_entities([qid])
        game_entity = entities.get(qid, {})
        claims = game_entity.get("claims", {})

        # Fandom ID (P6262)
        fandom_id = None
        p6262 = claims.get("P6262", [])
        if p6262:
            fid_val = p6262[0].get("mainsnak", {}).get("datavalue", {}).get("value")
            if isinstance(fid_val, str):
                fandom_id = fid_val

        # Characters (P674)
        char_qids = [
            c["mainsnak"]["datavalue"]["value"]["id"]
            for c in claims.get("P674", [])
            if c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
        ]

        # Cast: P725 (voice actor), P161 (cast), P175 (performer)
        cast_claims = claims.get("P725", []) + claims.get("P161", []) + claims.get("P175", [])
        raw_cast_pairs: List[Tuple[str, Optional[str], Optional[str]]] = []
        for c in cast_claims:
            aid = c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
            if not aid:
                continue
            quals = c.get("qualifiers", {})
            p4633 = quals.get("P4633", [])
            p453 = quals.get("P453", [])
            role_str = p4633[0].get("datavalue", {}).get("value") if p4633 else None
            role_qid = p453[0].get("datavalue", {}).get("value", {}).get("id") if p453 else None
            if role_qid and role_qid not in char_qids:
                char_qids.append(role_qid)
            raw_cast_pairs.append((aid, role_str, role_qid))

        # Crew: Directors (P57), Screenwriters (P58), Composers (P86)
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

        actor_ids = [p[0] for p in raw_cast_pairs]
        needed_qids = list(set(char_qids + actor_ids + director_ids + writer_ids + composer_ids))
        detail_map = self.fetch_entities(needed_qids)

        # Build characters list
        characters = []
        for cid in char_qids:
            cdata = detail_map.get(cid, {})
            c_name = cdata.get("labels", {}).get("en", {}).get("value")
            if not c_name:
                continue
            c_claims = cdata.get("claims", {})
            char_img = None
            p18 = c_claims.get("P18", [])
            if p18:
                file_name = p18[0].get("mainsnak", {}).get("datavalue", {}).get("value")
                if file_name:
                    char_img = f"https://commons.wikimedia.org/wiki/Special:FilePath/{urllib.parse.quote(file_name)}"
            w_title = cdata.get("sitelinks", {}).get("enwiki", {}).get("title")

            characters.append(
                {
                    "character_name": c_name,
                    "wikidata_id": cid,
                    "wikipedia_title": w_title,
                    "photo_url": char_img,
                }
            )

        # Build cast
        cast = []
        for aid, role_str, role_qid in raw_cast_pairs:
            adata = detail_map.get(aid, {})
            aname = adata.get("labels", {}).get("en", {}).get("value")
            if not aname:
                continue
            cname = role_str
            if not cname and role_qid:
                cname = detail_map.get(role_qid, {}).get("labels", {}).get("en", {}).get("value")
            if not cname:
                cname = "Cast"
            photo_url = None
            p18 = adata.get("claims", {}).get("P18", [])
            if p18:
                fn = p18[0].get("mainsnak", {}).get("datavalue", {}).get("value")
                if fn:
                    photo_url = f"https://commons.wikimedia.org/wiki/Special:FilePath/{urllib.parse.quote(fn)}"
            cast.append(
                {
                    "person_name": aname,
                    "character_name": cname,
                    "photo_url": photo_url,
                }
            )

        # Build crew
        crew = []
        for d_id in director_ids:
            ddata = detail_map.get(d_id, {})
            dname = ddata.get("labels", {}).get("en", {}).get("value")
            if dname:
                crew.append({"person_name": dname, "role": "director"})
        for w_id in writer_ids:
            wdata = detail_map.get(w_id, {})
            wname = wdata.get("labels", {}).get("en", {}).get("value")
            if wname:
                crew.append({"person_name": wname, "role": "writer"})
        for cmp_id in composer_ids:
            cdata = detail_map.get(cmp_id, {})
            cmpname = cdata.get("labels", {}).get("en", {}).get("value")
            if cmpname:
                crew.append({"person_name": cmpname, "role": "composer"})

        return {
            "cast": cast,
            "crew": crew,
            "characters": characters,
            "fandom_id": fandom_id,
        }

    def resolve_movie_distributors(
        self, imdb_id: Optional[str], tmdb_id: Optional[str]
    ) -> List[Dict[str, Any]]:
        selector = None
        if imdb_id and imdb_id.startswith("tt"):
            selector = f'VALUES ?imdb {{ "{imdb_id}" }} ?film wdt:P345 ?imdb .'
        elif tmdb_id and tmdb_id.isdigit():
            selector = f'VALUES ?tmdbId {{ "{int(tmdb_id)}" }} ?film wdt:P4947 ?tmdbId .'
        if not selector:
            return []

        sparql = f"""
        SELECT ?dist ?distLabel ?tmdbCompany WHERE {{
          {selector}
          ?film wdt:P750 ?dist .
          OPTIONAL {{ ?dist wdt:P4985 ?tmdbCompany }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
        }}
        """
        bindings = self.sparql_query(sparql)
        distributors = []
        seen = set()
        for b in bindings:
            name = (b.get("distLabel") or {}).get("value")
            if not name:
                continue
            raw_tmdb = (b.get("tmdbCompany") or {}).get("value")
            tmdb_comp_id = int(raw_tmdb) if raw_tmdb and raw_tmdb.isdigit() else None
            key = (name, tmdb_comp_id)
            if key not in seen:
                seen.add(key)
                distributors.append({"name": name, "tmdb_company_id": tmdb_comp_id})
        return distributors


class AdminComputeWorker:
    def __init__(
        self,
        server_url: str,
        token: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        concurrency: int = 16,
        batch_size: int = 20,
        webp_quality: int = 85,
    ):
        self.server_url = server_url.rstrip("/")
        self.token = token
        self.username = username
        self.password = password
        self.concurrency = concurrency
        self.batch_size = batch_size
        self.webp_quality = webp_quality
        self.running = True

        # Telemetry & Stats
        self.total_media_processed = 0
        self.total_candidates_evaluated = 0
        self.total_winners_uploaded = 0
        self.total_bytes_uploaded = 0
        self.total_enrichments = 0
        self.processed_media_ids: Set[int] = set()
        self.stats_lock = threading.Lock()
        self.start_time = time.time()

        # High-throughput connection pooled HTTP clients
        limits = httpx.Limits(
            max_keepalive_connections=64, max_connections=128, keepalive_expiry=30.0
        )
        self.http_client = httpx.Client(timeout=25.0, follow_redirects=True, limits=limits)
        self.wikidata = WikidataResolver()
        self.auth_lock = threading.RLock()

    def authenticate(self, silent: bool = False):
        """Authenticates with the server and ensures the user is an admin."""
        if not self.token:
            if not self.username:
                self.username = input("Enter admin username or email: ").strip()
            if not self.password:
                self.password = getpass.getpass("Enter admin password: ")

            # Clear expired Authorization header so DRF doesn't reject login endpoint
            self.http_client.headers.pop("Authorization", None)

            login_url = f"{self.server_url}/api/v1/auth/login"
            if not silent:
                print(f"{Colors.GRAY}Authenticating with {login_url}...{Colors.RESET}")
            resp = self.http_client.post(
                login_url,
                json={"identity": self.username, "password": self.password},
            )
            if resp.status_code != 200:
                print(
                    f"{Colors.RED}Authentication failed (HTTP {resp.status_code}): {resp.text}{Colors.RESET}"
                )
                sys.exit(1)

            data = resp.json()
            if data.get("two_factor_required"):
                code = input("Two-Factor Authentication required. Enter TOTP code: ").strip()
                tfa_resp = self.http_client.post(
                    f"{self.server_url}/api/v1/auth/2fa/login-verify",
                    json={"challenge_token": data["challenge_token"], "code": code},
                )
                if tfa_resp.status_code != 200:
                    print(f"{Colors.RED}2FA verification failed: {tfa_resp.text}{Colors.RESET}")
                    sys.exit(1)
                self.token = tfa_resp.json()["access_token"]
            else:
                self.token = data.get("access_token")

        self.http_client.headers["Authorization"] = f"Bearer {self.token}"

        if not silent:
            me_resp = self.http_client.get(f"{self.server_url}/api/v1/auth/me")
            if me_resp.status_code == 200:
                user_data = me_resp.json()
                is_staff = user_data.get("is_admin", False) or user_data.get("is_staff", False)
                username = user_data.get("username", "Admin")
                if not is_staff:
                    print(
                        f"{Colors.RED}Error: User '{username}' is not a staff/admin user.{Colors.RESET}"
                    )
                    sys.exit(1)
                print(f"{Colors.GREEN}[OK] Authenticated as admin '{username}'{Colors.RESET}")

    def authenticated_request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Executes an authenticated HTTP request, automatically refreshing tokens on 401."""
        resp = self.http_client.request(method, url, **kwargs)
        if resp.status_code == 401:
            with self.auth_lock:
                self.token = None
                self.authenticate(silent=True)
            resp = self.http_client.request(method, url, **kwargs)
        return resp

    def claim_media_jobs(self) -> List[Dict[str, Any]]:
        """Claim a batch of candidate media items and their candidate artwork."""
        claim_url = f"{self.server_url}/api/v1/media/admin/compute/claim"
        try:
            resp = self.authenticated_request(
                "POST",
                claim_url,
                json={"batch_size": self.batch_size, "group_by_media": True},
            )
            if resp.status_code == 401:
                # Token expired: auto-relogin
                self.token = None
                self.authenticate(silent=True)
                return self.claim_media_jobs()

            if resp.status_code != 200:
                return []

            data = resp.json()
            jobs = data.get("media_jobs", [])
            with self.stats_lock:
                return [j for j in jobs if j.get("media_item_id") not in self.processed_media_ids]
        except Exception as exc:
            print(f"{Colors.YELLOW}Claim error: {exc}{Colors.RESET}")
            return []

    def release_leases(self, asset_ids: List[int], media_ids: Optional[List[int]] = None):
        """Releases claim locks on non-winning assets and media rows."""
        payload = {}
        if asset_ids:
            payload["asset_ids"] = asset_ids
        if media_ids:
            payload["media_ids"] = media_ids
        if not payload:
            return
        try:
            self.authenticated_request(
                "POST",
                f"{self.server_url}/api/v1/media/admin/compute/release",
                json=payload,
            )
        except Exception:
            pass

    def _download_and_transcode_asset(self, asset: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Download asset, compute theme classification and WebP transcoding."""
        aid = asset["asset_id"]
        url = asset.get("url")
        asset_type = asset.get("asset_type", "poster")

        if not url or url.lower().split("?", 1)[0].endswith(".svg"):
            return None

        try:
            dl_resp = self.http_client.get(url, timeout=12.0)
            if dl_resp.status_code != 200 or not dl_resp.content:
                return None
            raw_bytes = dl_resp.content

            with Image.open(io.BytesIO(raw_bytes)) as img:
                width, height = img.size
                theme_guess = classify_theme(img, asset_type)
                hex_color = extract_dominant_color(img)

                buf = io.BytesIO()
                target_img = (
                    img.convert("RGBA") if img.mode in ("RGBA", "LA", "P") else img.convert("RGB")
                )
                target_img.save(buf, format="WEBP", quality=self.webp_quality, method=4)
                webp_bytes = buf.getvalue()

                return {
                    "asset_id": aid,
                    "asset_type": asset_type,
                    "url": url,
                    "theme_guess": theme_guess,
                    "hex_color": hex_color,
                    "width": width,
                    "height": height,
                    "webp_bytes": webp_bytes,
                    "original_asset": asset,
                }
        except Exception:
            return None

    def pick_media_winners(
        self, candidate_assets: List[Dict[str, Any]], processed_map: Dict[int, Dict[str, Any]]
    ) -> Set[int]:
        """Selects the winning asset IDs for general, dark, light, and textless contexts."""
        winners: Set[int] = set()

        # Group candidates by asset_type
        by_type: Dict[str, List[Dict[str, Any]]] = {}
        for a in candidate_assets:
            atype = a.get("asset_type", "poster")
            by_type.setdefault(atype, []).append(a)

            # Keep explicitly pinned or flagged assets
            if a.get("keep_local") or a.get("selected_context"):
                winners.add(a["asset_id"])

        for atype, assets in by_type.items():
            for context in ("general", "dark", "light"):
                best_cand = None
                best_rank = (-1, -1, -1, -1, 0)  # (pin_rank, theme_rank, score, area, -pk)

                for a in assets:
                    aid = a["asset_id"]
                    proc = processed_map.get(aid)
                    guess = proc["theme_guess"] if proc else None
                    width = proc["width"] if proc else 0
                    height = proc["height"] if proc else 0
                    area = width * height

                    # 1. Pinned context rank
                    sel_ctx = a.get("selected_context")
                    pin_rank = 0
                    if sel_ctx == context:
                        pin_rank = 3
                    elif context in ("dark", "light") and sel_ctx == "general":
                        pin_rank = 2

                    # 2. Theme contrast rank
                    theme_rank = 0
                    if context in ("dark", "light"):
                        if atype in ("logo", "icon"):
                            theme_rank = _LOGO_THEME_RANK[context].get(guess, 1)
                        elif atype in ("backdrop", "textless_backdrop"):
                            theme_rank = _BACKDROP_THEME_RANK[context].get(guess, 1)

                    # 3. Score
                    score = a.get("score") or 0

                    cand_rank = (pin_rank, theme_rank, score, area, -aid)
                    if best_cand is None or cand_rank > best_rank:
                        best_cand = aid
                        best_rank = cand_rank

                if best_cand is not None:
                    winners.add(best_cand)

        return winners

    def process_media_item(self, media_job: Dict[str, Any]):
        """Processes a single media item: downloads candidates, picks winners, uploads & enriches."""
        mid = media_job["media_item_id"]
        title = media_job.get("title", f"Media #{mid}")
        mtype = media_job.get("media_type", "movie")
        needs_enrichment = media_job.get("needs_enrichment", False)
        ext_ids = media_job.get("external_ids", {})
        candidates = media_job.get("assets", [])

        # Filter unmirrored candidate assets
        unmirrored = [
            a
            for a in candidates
            if not a.get("is_mirrored")
            and a.get("url")
            and not a.get("url", "").lower().split("?", 1)[0].endswith(".svg")
        ]

        # 1. Download & analyze candidate images in parallel
        processed_map: Dict[int, Dict[str, Any]] = {}
        if unmirrored:
            with ThreadPoolExecutor(max_workers=min(len(unmirrored), 8)) as pool:
                futures = {
                    pool.submit(self._download_and_transcode_asset, a): a["asset_id"]
                    for a in unmirrored
                }
                for f in as_completed(futures):
                    res = f.result()
                    if res:
                        processed_map[res["asset_id"]] = res

        # 2. Select winners across General, Dark, Light, Textless
        winning_ids = self.pick_media_winners(candidates, processed_map)
        winning_unmirrored = [aid for aid in winning_ids if aid in processed_map]
        non_winning_ids = [a["asset_id"] for a in unmirrored if a["asset_id"] not in winning_ids]

        # 3. Upload WINNERS only
        uploaded_count = 0
        uploaded_bytes = 0
        for aid in winning_unmirrored:
            item = processed_map[aid]
            files = {"file": ("asset.webp", item["webp_bytes"], "image/webp")}
            data = {"asset_id": str(aid), "color_guess": item["theme_guess"]}
            try:
                sub_resp = self.authenticated_request(
                    "POST",
                    f"{self.server_url}/api/v1/media/admin/compute/submit",
                    data=data,
                    files=files,
                )
                if sub_resp.status_code == 200:
                    uploaded_count += 1
                    uploaded_bytes += len(item["webp_bytes"])
            except Exception:
                pass

        # 4. Release NON-WINNERS to free redis leases and conserve server storage
        if non_winning_ids:
            self.release_leases(asset_ids=non_winning_ids)

        # 5. Public Wikidata Enrichment
        enrichment_summary = ""
        if needs_enrichment:
            enrichment_payload: Dict[str, Any] = {"media_item_id": mid}
            if mtype == "game":
                g_credits = self.wikidata.resolve_game_credits(
                    steam_id=ext_ids.get("steam"),
                    igdb_id=ext_ids.get("igdb"),
                    title=title,
                )
                if g_credits:
                    enrichment_payload.update(g_credits)
                    enrichment_summary = (
                        f" (Wikidata: {len(g_credits.get('characters', []))} chars, "
                        f"{len(g_credits.get('cast', []))} cast, {len(g_credits.get('crew', []))} crew)"
                    )
            elif mtype in ("movie", "show"):
                distributors = self.wikidata.resolve_movie_distributors(
                    imdb_id=ext_ids.get("imdb"),
                    tmdb_id=ext_ids.get("tmdb"),
                )
                if distributors:
                    enrichment_payload["distributors"] = distributors
                    enrichment_summary = f" (Wikidata: {len(distributors)} distributors)"

            if len(enrichment_payload) > 1:
                try:
                    e_resp = self.authenticated_request(
                        "POST",
                        f"{self.server_url}/api/v1/media/admin/compute/enrichment",
                        json=enrichment_payload,
                    )
                    if e_resp.status_code == 200:
                        with self.stats_lock:
                            self.total_enrichments += 1
                except Exception:
                    pass

        # Keep media lease in Redis until its 300s TTL expires to prevent the server
        # from re-offering this already-evaluated media item on subsequent claims.
        with self.stats_lock:
            self.processed_media_ids.add(mid)
            self.total_media_processed += 1
            self.total_candidates_evaluated += len(unmirrored)
            self.total_winners_uploaded += uploaded_count
            self.total_bytes_uploaded += uploaded_bytes

        saved_pct = 0
        if len(unmirrored) > 0:
            saved_pct = int((1.0 - (uploaded_count / len(unmirrored))) * 100)

        elapsed = time.time() - self.start_time
        mb_up = uploaded_bytes / (1024 * 1024)
        print(
            f"{Colors.GREEN}[+ Media #{mid} ({mtype})]{Colors.RESET} {Colors.BOLD}{title}{Colors.RESET} | "
            f"Evaluated: {len(unmirrored)} -> {uploaded_count} winners ({Colors.CYAN}{saved_pct}% disk saved{Colors.RESET}) | "
            f"{mb_up:.2f} MB{enrichment_summary}",
            flush=True,
        )

    def run(self):
        self.authenticate()
        print(
            f"\n{Colors.GREEN}[+] Worker online. Starting media-grouped processing loop with {self.concurrency} threads...{Colors.RESET}\n"
        )

        while self.running:
            media_jobs = self.claim_media_jobs()
            if not media_jobs:
                print(
                    f"{Colors.GRAY}[*] Queue empty or all media leased. Waiting 10s...{Colors.RESET}",
                    flush=True,
                )
                time.sleep(10)
                continue

            # Process media jobs concurrently
            with ThreadPoolExecutor(
                max_workers=min(len(media_jobs), max(1, self.concurrency // 2))
            ) as pool:
                futures = {
                    pool.submit(self.process_media_item, m): m["media_item_id"] for m in media_jobs
                }
                for f in as_completed(futures):
                    try:
                        f.result()
                    except Exception as exc:
                        mid = futures[f]
                        self.release_leases(asset_ids=[], media_ids=[mid])
                        print(f"{Colors.RED}[!] Media #{mid} error: {exc}{Colors.RESET}", flush=True)

            # Telemetry Summary
            elapsed = time.time() - self.start_time
            media_rate = self.total_media_processed / elapsed if elapsed > 0 else 0
            mb_total = self.total_bytes_uploaded / (1024 * 1024)
            saved_total_pct = 0
            if self.total_candidates_evaluated > 0:
                saved_total_pct = int(
                    (1.0 - (self.total_winners_uploaded / self.total_candidates_evaluated)) * 100
                )

            print(
                f"\n{Colors.CYAN}--- Progress: {self.total_media_processed} media items | "
                f"{self.total_winners_uploaded}/{self.total_candidates_evaluated} assets uploaded "
                f"({saved_total_pct}% storage saved) | {mb_total:.1f} MB uploaded | "
                f"{self.total_enrichments} Wikidata enrichments | {media_rate:.2f} media/s ---{Colors.RESET}\n",
                flush=True,
            )


class EmbeddingWorker:
    """Dedicated GPU-accelerated embedding worker using BAAI/bge-m3."""

    def __init__(
        self,
        server_url: str,
        token: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        batch_size: int = 100,
        model_name: str = "BAAI/bge-m3",
        gpu_batch_size: int = 64,
        sleep_between_batches: float = 0.0,
        low_priority: bool = False,
    ):
        self.server_url = server_url.rstrip("/")
        self.token = token
        self.username = username
        self.password = password
        self.batch_size = batch_size
        self.model_name = model_name
        self.gpu_batch_size = gpu_batch_size
        self.sleep_between_batches = sleep_between_batches
        self.low_priority = low_priority

        self.running = True
        self.client = httpx.Client(timeout=90.0)
        self.auth_lock = threading.RLock()
        self.start_time = time.time()
        self.total_embedded = 0
        self.batch_count = 0
        self.total_catalog: Optional[int] = None
        self.remaining_catalog: Optional[int] = None
        self.model = None
        self.device = "cpu"

    def refresh_stats(self):
        try:
            resp = self.authenticated_request(
                "GET", f"{self.server_url}/api/v1/media/admin/compute/stats"
            )
            if resp.status_code == 200:
                data = resp.json()
                self.total_catalog = data.get("catalog_total", self.total_catalog)
                self.remaining_catalog = data.get("embeddings_pending", self.remaining_catalog)
        except Exception:
            pass

    def authenticate(self):
        with self.auth_lock:
            if self.token:
                self.client.headers["Authorization"] = f"Bearer {self.token}"
                return

            if not self.username:
                self.username = input("Enter admin username or email: ").strip()
            if not self.password:
                self.password = getpass.getpass("Enter admin password: ").strip()

            login_url = f"{self.server_url}/api/v1/auth/login"
            self.client.headers.pop("Authorization", None)
            try:
                resp = self.client.post(
                    login_url, json={"identity": self.username, "password": self.password}
                )
                if resp.status_code != 200:
                    print(
                        f"{Colors.RED}[!] Authentication failed (HTTP {resp.status_code}): {resp.text}{Colors.RESET}"
                    )
                    sys.exit(1)

                data = resp.json()
                token = (
                    data.get("access_token")
                    or data.get("token")
                    or (data.get("tokens") or {}).get("access")
                )
                if not token:
                    print(f"{Colors.RED}[!] Could not parse access token: {data}{Colors.RESET}")
                    sys.exit(1)

                self.token = token
                self.client.headers["Authorization"] = f"Bearer {self.token}"
                print(
                    f"{Colors.GREEN}[+] Authenticated successfully as {self.username}{Colors.RESET}"
                )
            except Exception as exc:
                print(f"{Colors.RED}[!] Auth connection error: {exc}{Colors.RESET}")
                sys.exit(1)

    def authenticated_request(self, method: str, url: str, **kwargs) -> httpx.Response:
        try:
            resp = self.client.request(method, url, **kwargs)
        except Exception:
            time.sleep(1)
            resp = self.client.request(method, url, **kwargs)

        if resp.status_code == 401 and self.username and self.password:
            with self.auth_lock:
                self.token = None
                self.authenticate()
            resp = self.client.request(method, url, **kwargs)
        return resp

    def init_model(self):
        print(f"\n{Colors.CYAN}[*] Initializing embedding model {self.model_name}...{Colors.RESET}")
        try:
            import torch
            from sentence_transformers import SentenceTransformer

            if torch.cuda.is_available():
                self.device = "cuda"
                gpu_name = torch.cuda.get_device_name(0)
                vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
                print(
                    f"{Colors.GREEN}[+] GPU: {gpu_name} ({vram_gb:.1f} GB VRAM) — Hardware Acceleration ACTIVE{Colors.RESET}"
                )
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                self.device = "mps"
                print(
                    f"{Colors.GREEN}[+] Apple Silicon GPU (Metal/MPS) detected — Hardware Acceleration ACTIVE{Colors.RESET}"
                )
            else:
                self.device = "cpu"
                print(f"{Colors.YELLOW}[!] GPU/MPS not available, falling back to CPU{Colors.RESET}")

            self.model = SentenceTransformer(self.model_name, device=self.device)
            # Cap max_seq_length to 2048 tokens to prevent massive attention VRAM spikes on long synopses
            if hasattr(self.model, "max_seq_length") and self.model.max_seq_length > 2048:
                self.model.max_seq_length = 2048
            print(
                f"{Colors.GREEN}[+] Model {self.model_name} loaded successfully on {self.device.upper()}! (max_seq_len={getattr(self.model, 'max_seq_length', 'default')}){Colors.RESET}\n"
            )
        except Exception as exc:
            print(f"{Colors.RED}[!] Failed to load model {self.model_name}: {exc}{Colors.RESET}")
            raise

    def claim_jobs(self) -> List[Dict[str, Any]]:
        claim_url = f"{self.server_url}/api/v1/media/admin/compute/claim"
        for try_batch in [
            self.batch_size,
            max(self.batch_size * 2, 400),
            max(self.batch_size * 5, 800),
        ]:
            try:
                resp = self.authenticated_request(
                    "POST",
                    claim_url,
                    json={"task": "embeddings", "batch_size": try_batch},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if "remaining" in data:
                        self.remaining_catalog = data.get("remaining")
                    if "total_catalog" in data:
                        self.total_catalog = data.get("total_catalog")
                    items = data.get("items", [])
                    if items:
                        if len(items) > self.batch_size:
                            excess = items[self.batch_size :]
                            items = items[: self.batch_size]
                            excess_ids = [x["media_item_id"] for x in excess]
                            self.release_leases(excess_ids)
                        return items
                else:
                    print(
                        f"{Colors.RED}[!] Claim error (HTTP {resp.status_code}): {resp.text[:200]}{Colors.RESET}",
                        flush=True,
                    )
                    return []
            except Exception as exc:
                print(f"{Colors.RED}[!] Claim network error: {exc}{Colors.RESET}", flush=True)
                return []
        return []

    def submit_embeddings(self, embeddings: List[Dict[str, Any]]) -> bool:
        sub_url = f"{self.server_url}/api/v1/media/admin/compute/embeddings"
        CHUNK_SIZE = 50
        all_ok = True
        for i in range(0, len(embeddings), CHUNK_SIZE):
            chunk = embeddings[i : i + CHUNK_SIZE]
            try:
                resp = self.authenticated_request(
                    "POST",
                    sub_url,
                    json={"embeddings": chunk},
                )
                if resp.status_code != 200:
                    print(
                        f"{Colors.RED}[!] Submit chunk error (HTTP {resp.status_code}): {resp.text[:200]}{Colors.RESET}",
                        flush=True,
                    )
                    all_ok = False
            except Exception as exc:
                print(f"{Colors.RED}[!] Submit network error: {exc}{Colors.RESET}", flush=True)
                all_ok = False
        return all_ok

    def release_leases(self, embedding_ids: List[int]):
        if not embedding_ids:
            return
        try:
            self.authenticated_request(
                "POST",
                f"{self.server_url}/api/v1/media/admin/compute/release",
                json={"embedding_ids": embedding_ids},
            )
        except Exception:
            pass

    def run(self):
        if self.low_priority:
            try:
                import ctypes

                # BELOW_NORMAL_PRIORITY_CLASS = 0x00004000
                ctypes.windll.kernel32.SetPriorityClass(
                    ctypes.windll.kernel32.GetCurrentProcess(), 0x00004000
                )
                print(
                    f"{Colors.GREEN}[+] Process priority set to Below Normal (Gaming Mode active){Colors.RESET}"
                )
            except Exception:
                pass

        self.authenticate()
        self.refresh_stats()
        self.init_model()

        rem_banner = ""
        if self.remaining_catalog is not None:
            rem_banner = f", Pending: {self.remaining_catalog:,}"

        print(
            f"{Colors.GREEN}[+] Embedding worker online. Claim batch size: {self.batch_size}, GPU encode batch: {self.gpu_batch_size}{rem_banner}{Colors.RESET}\n"
        )

        while self.running:
            if self.batch_count > 0 and self.batch_count % 20 == 0:
                self.refresh_stats()

            jobs = self.claim_jobs()
            if not jobs:
                print(
                    f"{Colors.GRAY}[*] All catalog media items are embedded or currently leased. Waiting 15s...{Colors.RESET}",
                    flush=True,
                )
                time.sleep(15)
                continue

            t0 = time.time()
            texts = [j["text"] for j in jobs]
            media_ids = [j["media_item_id"] for j in jobs]

            # GPU batch encoding with automatic OOM recovery
            try:
                vectors = self.model.encode(
                    texts,
                    batch_size=self.gpu_batch_size,
                    normalize_embeddings=True,
                    show_progress_bar=False,
                )
            except Exception as exc:
                print(f"{Colors.RED}[!] GPU encode failed: {exc}{Colors.RESET}", flush=True)
                try:
                    import torch

                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                    elif hasattr(torch, "mps") and hasattr(torch.mps, "empty_cache"):
                        torch.mps.empty_cache()
                except Exception:
                    pass
                # Automatic retry with conservative batch size (16)
                try:
                    print(
                        f"{Colors.YELLOW}[*] Retrying batch with conservative GPU batch size (16)...{Colors.RESET}",
                        flush=True,
                    )
                    vectors = self.model.encode(
                        texts,
                        batch_size=16,
                        normalize_embeddings=True,
                        show_progress_bar=False,
                    )
                except Exception as exc2:
                    print(
                        f"{Colors.RED}[!] Fallback encode also failed: {exc2}{Colors.RESET}",
                        flush=True,
                    )
                    self.release_leases(media_ids)
                    time.sleep(5)
                    continue

            payload = [
                {
                    "media_item_id": mid,
                    "vector": vec.tolist() if hasattr(vec, "tolist") else list(vec),
                }
                for mid, vec in zip(media_ids, vectors)
            ]

            success = self.submit_embeddings(payload)
            if success:
                batch_sec = time.time() - t0
                self.total_embedded += len(jobs)
                self.batch_count += 1
                if self.remaining_catalog is not None:
                    self.remaining_catalog = max(0, self.remaining_catalog - len(jobs))
                rate = len(jobs) / batch_sec if batch_sec > 0 else 0
                elapsed = time.time() - self.start_time
                avg_rate = self.total_embedded / elapsed if elapsed > 0 else 0

                vram_str = ""
                try:
                    import torch

                    if self.device == "cuda" and torch.cuda.is_available():
                        vram_mb = torch.cuda.memory_allocated() / (1024 * 1024)
                        vram_str = f" | VRAM: {vram_mb:.0f} MB"
                    elif self.device == "mps" and hasattr(torch, "mps") and hasattr(torch.mps, "current_allocated_memory"):
                        mps_mb = torch.mps.current_allocated_memory() / (1024 * 1024)
                        vram_str = f" | Metal RAM: {mps_mb:.0f} MB"
                except Exception:
                    pass

                rem_str = ""
                if self.remaining_catalog is not None:
                    if self.total_catalog and self.total_catalog > 0:
                        pct_done = (
                            (self.total_catalog - self.remaining_catalog) / self.total_catalog
                        ) * 100
                        rem_str = f" | {Colors.YELLOW}Remaining: {self.remaining_catalog:,} / {self.total_catalog:,} ({pct_done:.1f}% done){Colors.RESET}"
                    else:
                        rem_str = (
                            f" | {Colors.YELLOW}Remaining: {self.remaining_catalog:,}{Colors.RESET}"
                        )

                print(
                    f"{Colors.GREEN}[+ Embeddings]{Colors.RESET} Processed {len(jobs)} items in {batch_sec:.2f}s "
                    f"({Colors.CYAN}{rate:.1f} items/s{Colors.RESET}){rem_str} | Session: {self.total_embedded} "
                    f"({avg_rate:.1f} avg/s){vram_str}",
                    flush=True,
                )

                if self.sleep_between_batches > 0:
                    time.sleep(self.sleep_between_batches)
            else:
                self.release_leases(media_ids)


def main():
    parser = argparse.ArgumentParser(
        description="Otix Distributed Compute Worker (Turbo Media-Grouped + Embeddings)"
    )
    parser.add_argument(
        "--server", type=str, default="http://84.8.154.67:8000", help="Otix central server base URL"
    )
    parser.add_argument("--token", type=str, default=None, help="Admin JWT access token (optional)")
    parser.add_argument("--username", type=str, default=None, help="Admin username or email")
    parser.add_argument("--password", type=str, default=None, help="Admin password")
    parser.add_argument(
        "--task",
        choices=["artwork", "embeddings", "both"],
        default="artwork",
        help="Task mode: artwork, embeddings, or both",
    )
    parser.add_argument(
        "--threads", type=int, default=16, help="Worker threads for artwork processing (default 16)"
    )
    parser.add_argument(
        "--batch-size", type=int, default=500, help="Batch size of items per claim (default 500)"
    )
    parser.add_argument(
        "--webp-quality", type=int, default=85, help="WebP compression quality (default 85)"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="BAAI/bge-m3",
        help="Embedding model name (default BAAI/bge-m3)",
    )
    parser.add_argument(
        "--gpu-batch-size",
        type=int,
        default=32,
        help="Batch size for GPU model.encode (default 32)",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.0,
        help="Seconds to pause between batches to minimize GPU contention while gaming (default 0.0)",
    )
    parser.add_argument(
        "--low-priority",
        action="store_true",
        help="Set process priority to below-normal on Windows to avoid foreground game stutter",
    )
    args = parser.parse_args()

    print_banner(args.server, args.threads, args.batch_size, task=args.task, model_name=args.model)

    active_workers = []

    if args.task in ("artwork", "both"):
        artwork_worker = AdminComputeWorker(
            server_url=args.server,
            token=args.token,
            username=args.username,
            password=args.password,
            concurrency=args.threads,
            batch_size=args.batch_size,
            webp_quality=args.webp_quality,
        )
        active_workers.append(artwork_worker)

    if args.task in ("embeddings", "both"):
        embed_worker = EmbeddingWorker(
            server_url=args.server,
            token=args.token,
            username=args.username,
            password=args.password,
            batch_size=args.batch_size,
            model_name=args.model,
            gpu_batch_size=args.gpu_batch_size,
            sleep_between_batches=args.sleep,
            low_priority=args.low_priority,
        )
        active_workers.append(embed_worker)

    def handle_sigint(sig, frame):
        print(f"\n{Colors.YELLOW}[*] Shutting down workers gracefully...{Colors.RESET}")
        for w in active_workers:
            w.running = False
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_sigint)

    if len(active_workers) == 1:
        active_workers[0].run()
    else:
        # Run both in separate threads
        threads = []
        for w in active_workers:
            t = threading.Thread(target=w.run, daemon=True)
            t.start()
            threads.append(t)
        for t in threads:
            t.join()


if __name__ == "__main__":
    main()
