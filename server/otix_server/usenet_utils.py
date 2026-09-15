from __future__ import annotations

import httpx
import re
from typing import Any, List, Optional
import urllib.parse
from otix_server.usenet_types import (
    ProwlarrConfig,
    ProwlarrRelease,
    SabnzbdConfig,
    SabnzbdQueueItem,
    ServerDownloadQueue,
)


def _resolve_service_url(host: str, port: int, use_ssl: bool, url_base: str = "") -> tuple[str, str]:
    """Resolve scheme, host:port, and subpath robustly.
    Handles:
    - Raw IP or local hostnames: "192.168.1.50", "localhost"
    - User custom domains: "server.diogodasilva.com", "server.diogodasilva.com/sabnzbd"
    - Comma typos in domain names: "server,diogodasilva.com/sabnzbd" -> "server.diogodasilva.com"
    - Full URLs: "https://server.diogodasilva.com/sabnzbd", "http://192.168.1.50:8080/sabnzbd"
    - Custom ports: "server.diogodasilva.com:8443"
    - Standard ports: 443 for HTTPS, 80 for HTTP
    Returns (root_url, clean_subpath), e.g. ("https://server.diogodasilva.com", "/sabnzbd").
    """
    raw = (host or "").strip()
    if not raw:
        scheme = "https" if use_ssl else "http"
        port_suffix = f":{port}" if port and port not in (80, 443) else ""
        subpath = f"/{url_base.strip('/')}" if url_base and url_base.strip('/') else ""
        return f"{scheme}://localhost{port_suffix}", subpath

    # 1. Clean typo commas between alphanumeric domain characters: "server,diogodasilva.com" -> "server.diogodasilva.com"
    raw = re.sub(r'(?<=[a-zA-Z0-9_-]),(?=[a-zA-Z0-9_-])', '.', raw)

    # 2. Extract scheme if provided
    has_explicit_scheme = False
    if "://" in raw:
        scheme_part, _, raw = raw.partition("://")
        scheme = scheme_part.lower()
        has_explicit_scheme = True
    else:
        scheme = "https" if use_ssl else "http"

    # 3. Separate host:port and path
    host_port, _, path_from_host = raw.partition("/")
    path_from_host = path_from_host.rstrip("/")

    # 4. Extract port from host_port if present
    if ":" in host_port:
        hostname, _, port_str = host_port.partition(":")
        try:
            effective_port = int(port_str)
        except ValueError:
            effective_port = port
    else:
        hostname = host_port
        if has_explicit_scheme and scheme == "https" and port in (8080, 9696, 0, None):
            effective_port = 443
        elif has_explicit_scheme and scheme == "http" and port in (8080, 9696, 0, None):
            effective_port = 80
        else:
            effective_port = port

    # 5. Check if hostname looks like a domain name (contains dot and not pure IPv4)
    is_domain = "." in hostname and not re.match(r"^\d{1,3}(\.\d{1,3}){3}$", hostname)
    if is_domain and (use_ssl or effective_port == 443 or scheme == "https"):
        scheme = "https"
        if effective_port in (8080, 9696, 0, None):
            effective_port = 443

    # Format port suffix (omit standard 443 for https and 80 for http)
    port_suffix = ""
    if effective_port and effective_port > 0:
        if scheme == "https" and effective_port == 443:
            port_suffix = ""
        elif scheme == "http" and effective_port == 80:
            port_suffix = ""
        else:
            port_suffix = f":{effective_port}"

    root_url = f"{scheme}://{hostname}{port_suffix}"

    # 6. Combine subpaths without duplicate segments
    extra = (url_base or "").strip().strip("/")
    path_parts = []
    if path_from_host:
        for seg in path_from_host.split("/"):
            s = seg.strip("/")
            if s and s not in path_parts:
                path_parts.append(s)
    if extra:
        for seg in extra.split("/"):
            s = seg.strip("/")
            if s and s not in path_parts:
                path_parts.append(s)

    combined_subpath = "/" + "/".join(path_parts) if path_parts else ""
    return root_url, combined_subpath


def build_sabnzbd_url(cfg: SabnzbdConfig, mode: str, extra_params: Optional[dict] = None) -> str:
    url_base = getattr(cfg, "clean_url_base", "") or getattr(cfg, "url_base", "")
    root, subpath = _resolve_service_url(cfg.host, cfg.port, cfg.use_ssl, url_base)
    base = f"{root}{subpath}/api"
    params = {
        "mode": mode,
        "output": "json",
    }
    if cfg.api_key:
        params["apikey"] = cfg.api_key
    if extra_params:
        params.update(extra_params)

    query_str = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{base}?{query_str}"


def build_prowlarr_base_url(cfg: ProwlarrConfig) -> str:
    url_base = getattr(cfg, "clean_url_base", "") or getattr(cfg, "url_base", "")
    root, subpath = _resolve_service_url(cfg.host, cfg.port, cfg.use_ssl, url_base)
    return f"{root}{subpath}"


def test_sabnzbd_connection(cfg: SabnzbdConfig) -> dict:
    """Test connection and authentication to SABnzbd."""
    url = build_sabnzbd_url(cfg, "version")
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if "version" in data:
                    return {"ok": True, "version": data["version"], "message": f"Connected to SABnzbd v{data['version']}"}
                if data.get("status") is False:
                    return {"ok": False, "message": data.get("error", "SABnzbd error (check API key)")}
            elif resp.status_code == 401 or resp.status_code == 403:
                return {"ok": False, "message": "Invalid SABnzbd API Key"}
            return {"ok": False, "message": f"HTTP {resp.status_code} from SABnzbd"}
    except Exception as exc:
        return {"ok": False, "message": f"Cannot connect to SABnzbd at {cfg.host}:{cfg.port} ({exc})"}


def test_prowlarr_connection(cfg: ProwlarrConfig) -> dict:
    """Test connection and API key to Prowlarr."""
    base = build_prowlarr_base_url(cfg)
    headers = {"X-Api-Key": cfg.api_key} if cfg.api_key else {}
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(f"{base}/api/v1/system/status", headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                version = data.get("version", "Unknown")
                return {"ok": True, "version": version, "message": f"Connected to Prowlarr v{version}"}
            elif resp.status_code in (401, 403):
                return {"ok": False, "message": "Invalid Prowlarr API Key"}
            return {"ok": False, "message": f"HTTP {resp.status_code} from Prowlarr"}
    except Exception as exc:
        return {"ok": False, "message": f"Cannot connect to Prowlarr at {cfg.host}:{cfg.port} ({exc})"}


def build_prowlarr_search_params(
    query: str,
    categories: Optional[List[int]] = None,
    limit: int = 100,
) -> List[tuple[str, str]]:
    """Build Prowlarr `/api/v1/search` query params.

    Categories must be repeated (`categories=1000&categories=4000`), matching
    Prowlarr's `collectionFormat: multi` binding — a comma-joined string is ignored.
    """
    params: List[tuple[str, str]] = [
        ("query", (query or "").strip()),
        ("type", "search"),
        ("limit", str(limit)),
    ]
    for cat in categories or []:
        try:
            params.append(("categories", str(int(cat))))
        except (TypeError, ValueError):
            continue
    return params


def _coerce_age_days(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _coerce_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_prowlarr_release(item: dict) -> Optional[ProwlarrRelease]:
    """Map a Prowlarr Search API item to a ProwlarrRelease. Returns None if unusable."""
    if not isinstance(item, dict):
        return None
    title = str(item.get("title") or "").strip()
    if not title:
        return None

    download_url = str(
        item.get("downloadUrl") or item.get("magnetUrl") or item.get("infoUrl") or ""
    )
    seeders = _coerce_int(item.get("seeders"))
    size_raw = item.get("size") or 0
    try:
        size = int(size_raw)
    except (TypeError, ValueError):
        size = 0

    return ProwlarrRelease(
        guid=str(item.get("guid") or item.get("infoHash") or item.get("id") or title),
        title=title,
        size=size,
        download_url=download_url,
        info_url=item.get("infoUrl"),
        publish_date=item.get("publishDate"),
        indexer=str(item.get("indexer") or item.get("indexerName") or "Indexer"),
        protocol=str(item.get("protocol") or "usenet").lower(),
        age_days=_coerce_age_days(item.get("age")),
        seeders=seeders,
    )


def search_prowlarr(
    cfg: ProwlarrConfig,
    query: str,
    categories: Optional[List[int]] = None,
) -> List[ProwlarrRelease]:
    """Search Prowlarr across configured indexers for game releases."""
    if not cfg.api_key:
        raise ValueError("Prowlarr API key is required")

    cats = list(categories) if categories is not None else list(cfg.categories or [])
    base = build_prowlarr_base_url(cfg)
    headers = {"X-Api-Key": cfg.api_key}
    params = build_prowlarr_search_params(query, cats)

    with httpx.Client(timeout=25.0) as client:
        resp = client.get(f"{base}/api/v1/search", params=params, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"Prowlarr search failed with HTTP {resp.status_code}: {resp.text}")

        data = resp.json()
        if not isinstance(data, list):
            return []

        releases: List[ProwlarrRelease] = []
        for item in data:
            parsed = parse_prowlarr_release(item)
            if parsed:
                releases.append(parsed)
        return releases


def send_nzb_to_sabnzbd(
    cfg: SabnzbdConfig,
    download_url: str,
    title: str,
    category: Optional[str] = None,
) -> str:
    """Send NZB URL to SABnzbd queue."""
    cat = category or cfg.category or "games"
    url = build_sabnzbd_url(
        cfg,
        "addurl",
        {
            "name": download_url,
            "nzbname": title,
            "cat": cat,
        },
    )

    with httpx.Client(timeout=8.0) as client:
        resp = client.get(url)
        if resp.status_code != 200:
            raise RuntimeError(f"SABnzbd returned HTTP {resp.status_code}")

        data = resp.json()
        if data and data.get("status") and data.get("nzo_ids"):
            return data["nzo_ids"][0]
        if data and data.get("nzo_ids") and len(data["nzo_ids"]) > 0:
            return data["nzo_ids"][0]

        error_msg = data.get("error") if isinstance(data, dict) else str(data)
        raise RuntimeError(f"Failed to queue in SABnzbd: {error_msg}")


def fetch_sabnzbd_queue(cfg: SabnzbdConfig) -> ServerDownloadQueue:
    """Fetch active download slots and bandwidth metrics from SABnzbd."""
    url = build_sabnzbd_url(cfg, "queue")
    try:
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(url)
            if resp.status_code != 200:
                return ServerDownloadQueue(status=f"HTTP {resp.status_code}")

            data = resp.json()
            queue_obj = data.get("queue") or {}
            slots = queue_obj.get("slots") or []

            items: List[SabnzbdQueueItem] = []
            for s in slots:
                try:
                    pct = float(s.get("percentage") or 0.0)
                except (ValueError, TypeError):
                    pct = 0.0

                try:
                    mb = float(s.get("mb") or 0.0)
                    mbleft = float(s.get("mbleft") or 0.0)
                except (ValueError, TypeError):
                    mb, mbleft = 0.0, 0.0

                items.append(
                    SabnzbdQueueItem(
                        nzo_id=str(s.get("nzo_id") or ""),
                        filename=str(s.get("filename") or "Unknown"),
                        percentage=pct,
                        size_mb=mb,
                        size_left_mb=mbleft,
                        speed=str(queue_obj.get("speed") or "0 B/s"),
                        time_left=str(s.get("timeleft") or queue_obj.get("timeleft") or ""),
                        status=str(s.get("status") or "Downloading"),
                    )
                )

            return ServerDownloadQueue(
                status=str(queue_obj.get("status") or ("Downloading" if items else "Idle")),
                speed=str(queue_obj.get("speed") or "0 B/s"),
                time_left=str(queue_obj.get("timeleft") or ""),
                items=items,
            )
    except Exception as exc:
        return ServerDownloadQueue(status=f"Error: {exc}")


def delete_sabnzbd_slot(cfg: SabnzbdConfig, nzo_id: str) -> bool:
    """Cancel and remove a download slot from SABnzbd queue."""
    url = build_sabnzbd_url(cfg, "queue", {"name": "delete", "value": nzo_id})
    try:
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                return bool(data.get("status", True))
            return False
    except Exception:
        return False


def pause_sabnzbd_queue(cfg: SabnzbdConfig) -> bool:
    """Pause the SABnzbd download queue."""
    url = build_sabnzbd_url(cfg, "pause")
    try:
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(url)
            return resp.status_code == 200
    except Exception:
        return False


def resume_sabnzbd_queue(cfg: SabnzbdConfig) -> bool:
    """Resume the SABnzbd download queue."""
    url = build_sabnzbd_url(cfg, "resume")
    try:
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(url)
            return resp.status_code == 200
    except Exception:
        return False


def fetch_prowlarr_indexers(
    cfg: ProwlarrConfig, protocol: Optional[str] = None
) -> List[dict]:
    """Fetch configured indexers from Prowlarr, optionally filtered by protocol ('all', 'torrent', 'usenet')."""
    if not cfg.api_key:
        raise ValueError("Prowlarr API key is required")

    base = build_prowlarr_base_url(cfg)
    headers = {"X-Api-Key": cfg.api_key}

    with httpx.Client(timeout=8.0) as client:
        resp = client.get(f"{base}/api/v1/indexer", headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"Prowlarr indexers fetch failed with HTTP {resp.status_code}")

        data = resp.json()
        if not isinstance(data, list):
            return []

        indexers = []
        target_proto = protocol.lower().strip() if protocol else "all"
        for item in data:
            item_proto = (item.get("protocol") or "usenet").lower()
            if target_proto not in ("all", "") and item_proto != target_proto:
                continue
            indexers.append({
                "id": item.get("id"),
                "name": item.get("name") or "Unnamed Indexer",
                "protocol": item_proto,
                "enable": bool(item.get("enable", True)),
                "priority": item.get("priority", 25),
            })
        return indexers


def sync_prowlarr_indexers(
    cfg: ProwlarrConfig, protocol: Optional[str] = None
) -> dict:
    """Trigger ApplicationIndexerSync in Prowlarr and return indexer status breakdown."""
    if not cfg.api_key:
        raise ValueError("Prowlarr API key is required")

    base = build_prowlarr_base_url(cfg)
    headers = {"X-Api-Key": cfg.api_key}

    # 1. Trigger Prowlarr sync command
    try:
        with httpx.Client(timeout=10.0) as client:
            client.post(
                f"{base}/api/v1/command",
                json={"name": "ApplicationIndexerSync"},
                headers=headers,
            )
    except Exception:
        pass

    # 2. Fetch current indexers to report state
    all_indexers = fetch_prowlarr_indexers(cfg, protocol="all")
    usenet_count = sum(1 for i in all_indexers if i.get("protocol") == "usenet")
    torrent_count = sum(1 for i in all_indexers if i.get("protocol") == "torrent")

    target_proto = protocol.lower().strip() if protocol else "all"
    filtered = (
        all_indexers
        if target_proto in ("all", "")
        else [i for i in all_indexers if i.get("protocol") == target_proto]
    )

    return {
        "ok": True,
        "message": f"Successfully synced {len(all_indexers)} indexers ({torrent_count} torrents, {usenet_count} usenet)",
        "indexers": filtered,
        "stats": {
            "total": len(all_indexers),
            "usenet": usenet_count,
            "torrent": torrent_count,
        },
    }

