"""Usenet/Prowlarr/SABnzbd runtime for the Django backend node."""

from __future__ import annotations

import re
import urllib.parse
from typing import Any

import httpx


def _resolve_service_url(
    host: str, port: int, use_ssl: bool, url_base: str = ""
) -> tuple[str, str]:
    raw = (host or "").strip()
    if not raw:
        scheme = "https" if use_ssl else "http"
        port_suffix = f":{port}" if port and port not in (80, 443) else ""
        subpath = f"/{url_base.strip('/')}" if url_base and url_base.strip("/") else ""
        return f"{scheme}://localhost{port_suffix}", subpath

    raw = re.sub(r"(?<=[a-zA-Z0-9_-]),(?=[a-zA-Z0-9_-])", ".", raw)
    has_explicit_scheme = False
    if "://" in raw:
        scheme_part, _, raw = raw.partition("://")
        scheme = scheme_part.lower()
        has_explicit_scheme = True
    else:
        scheme = "https" if use_ssl else "http"

    host_port, _, path_from_host = raw.partition("/")
    path_from_host = path_from_host.rstrip("/")
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

    is_domain = "." in hostname and not re.match(r"^\d{1,3}(\.\d{1,3}){3}$", hostname)
    if is_domain and (use_ssl or effective_port == 443 or scheme == "https"):
        scheme = "https"
        if effective_port in (8080, 9696, 0, None):
            effective_port = 443

    port_suffix = ""
    if effective_port and effective_port > 0:
        if not (scheme == "https" and effective_port == 443) and not (
            scheme == "http" and effective_port == 80
        ):
            port_suffix = f":{effective_port}"

    root_url = f"{scheme}://{hostname}{port_suffix}"
    extra = (url_base or "").strip().strip("/")
    path_parts: list[str] = []
    for source in (path_from_host, extra):
        if not source:
            continue
        for seg in source.split("/"):
            cleaned = seg.strip("/")
            if cleaned and cleaned not in path_parts:
                path_parts.append(cleaned)
    combined = "/" + "/".join(path_parts) if path_parts else ""
    return root_url, combined


def _cfg_map(raw: dict | None) -> dict[str, Any]:
    data = raw if isinstance(raw, dict) else {}
    return {
        "host": data.get("host") or "127.0.0.1",
        "port": int(data.get("port") or 0) or 0,
        "use_ssl": bool(data.get("use_ssl") or data.get("useSsl")),
        "url_base": data.get("url_base") or data.get("urlBase") or "",
        "api_key": data.get("api_key") or data.get("apiKey") or "",
        "category": data.get("category") or "",
    }


def sabnzbd_url(cfg: dict, mode: str, extra: dict | None = None) -> str:
    mapped = _cfg_map(cfg)
    root, subpath = _resolve_service_url(
        mapped["host"], mapped["port"] or 8080, mapped["use_ssl"], mapped["url_base"]
    )
    params = {"mode": mode, "output": "json"}
    if mapped["api_key"]:
        params["apikey"] = mapped["api_key"]
    if extra:
        params.update(extra)
    return f"{root}{subpath}/api?{urllib.parse.urlencode(params)}"


def prowlarr_base(cfg: dict) -> str:
    mapped = _cfg_map(cfg)
    root, subpath = _resolve_service_url(
        mapped["host"], mapped["port"] or 9696, mapped["use_ssl"], mapped["url_base"]
    )
    return f"{root}{subpath}"


def search_prowlarr(cfg: dict, query: str, categories: list[int] | None = None) -> list[dict]:
    base = prowlarr_base(cfg)
    api_key = _cfg_map(cfg)["api_key"]
    if not api_key or not query.strip():
        return []
    params: list[tuple[str, str]] = [
        ("query", query.strip()),
        ("type", "search"),
        ("limit", "100"),
    ]
    for category in categories or [1000, 4000]:
        params.append(("categories", str(int(category))))
    headers = {"X-Api-Key": api_key}
    try:
        with httpx.Client(timeout=20.0, verify=False) as client:
            resp = client.get(f"{base}/api/v1/search", params=params, headers=headers)
            if resp.status_code != 200:
                return []
            items = resp.json()
    except Exception:
        return []
    if not isinstance(items, list):
        return []
    releases: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        download_url = str(
            item.get("downloadUrl") or item.get("magnetUrl") or item.get("infoUrl") or ""
        )
        releases.append(
            {
                "title": title,
                "download_url": download_url,
                "size": int(item.get("size") or 0),
                "indexer": item.get("indexer") or item.get("indexerName") or "",
                "protocol": item.get("protocol") or "usenet",
                "publish_date": item.get("publishDate") or item.get("publish_date") or "",
                "guid": item.get("guid") or item.get("id") or "",
                "seeders": item.get("seeders"),
                "age": item.get("age"),
                "categories": item.get("categories") or [],
            }
        )
    return releases


def send_nzb_to_sabnzbd(cfg: dict, *, nzb_url: str, title: str = "", category: str = "") -> dict:
    mapped = _cfg_map(cfg)
    params = {"name": nzb_url, "nzbname": title or "Otix download"}
    cat = category or mapped.get("category") or ""
    if cat:
        params["cat"] = cat
    url = sabnzbd_url(cfg, "addurl", params)
    try:
        with httpx.Client(timeout=30.0, verify=False) as client:
            resp = client.get(url)
            data = resp.json() if resp.content else {}
    except Exception as exc:
        return {"status": False, "error": str(exc)}
    if isinstance(data, dict) and data.get("status") is False:
        return {"status": False, "error": data.get("error") or "SABnzbd rejected NZB"}
    nzo_ids = []
    if isinstance(data, dict):
        nzo_ids = data.get("nzo_ids") or data.get("nzoIds") or []
    nzo_id = nzo_ids[0] if isinstance(nzo_ids, list) and nzo_ids else ""
    return {"status": True, "nzo_id": nzo_id, "title": title or "Otix download"}


def fetch_sabnzbd_queue(cfg: dict) -> dict:
    url = sabnzbd_url(cfg, "queue")
    try:
        with httpx.Client(timeout=10.0, verify=False) as client:
            resp = client.get(url)
            data = resp.json() if resp.content else {}
    except Exception:
        return {"status": "Idle", "speed": "0 B/s", "items": [], "time_left": ""}
    queue = data.get("queue") if isinstance(data, dict) else {}
    if not isinstance(queue, dict):
        queue = {}
    slots = queue.get("slots") or []
    items = []
    for slot in slots if isinstance(slots, list) else []:
        if not isinstance(slot, dict):
            continue
        items.append(
            {
                "nzo_id": slot.get("nzo_id") or slot.get("nzoId") or "",
                "filename": slot.get("filename") or slot.get("name") or "",
                "status": slot.get("status") or "",
                "percentage": float(slot.get("percentage") or 0),
                "size": slot.get("size") or slot.get("mb") or "",
                "sizeleft": slot.get("sizeleft") or slot.get("mbleft") or "",
                "timeleft": slot.get("timeleft") or "",
                "category": slot.get("cat") or slot.get("category") or "",
            }
        )
    return {
        "status": queue.get("status") or "Idle",
        "speed": queue.get("speed") or "0 B/s",
        "items": items,
        "time_left": queue.get("timeleft") or queue.get("time_left") or "",
    }


def fetch_sabnzbd_history(cfg: dict, limit: int = 50) -> dict:
    url = sabnzbd_url(cfg, "history", {"limit": str(limit)})
    try:
        with httpx.Client(timeout=10.0, verify=False) as client:
            resp = client.get(url)
            data = resp.json() if resp.content else {}
    except Exception:
        return {"slots": [], "total": 0}
    history = data.get("history") if isinstance(data, dict) else {}
    if not isinstance(history, dict):
        history = {}
    slots = history.get("slots") or []
    out = []
    for slot in slots if isinstance(slots, list) else []:
        if not isinstance(slot, dict):
            continue
        out.append(
            {
                "nzo_id": slot.get("nzo_id") or slot.get("nzoId") or "",
                "name": slot.get("name") or slot.get("filename") or "",
                "status": slot.get("status") or "",
                "size": slot.get("bytes") or slot.get("size") or 0,
                "completed": slot.get("completed") or slot.get("completed_at") or "",
                "fail_message": slot.get("fail_message") or slot.get("failMessage") or "",
                "category": slot.get("category") or slot.get("cat") or "",
            }
        )
    return {"slots": out, "total": len(out)}


def delete_sabnzbd_slot(cfg: dict, nzo_id: str) -> dict:
    url = sabnzbd_url(cfg, "queue", {"name": "delete", "value": nzo_id})
    try:
        with httpx.Client(timeout=10.0, verify=False) as client:
            resp = client.get(url)
            data = resp.json() if resp.content else {}
    except Exception as exc:
        return {"status": False, "error": str(exc)}
    return data if isinstance(data, dict) else {"status": True}


def pause_sabnzbd_queue(cfg: dict) -> dict:
    url = sabnzbd_url(cfg, "pause")
    try:
        with httpx.Client(timeout=10.0, verify=False) as client:
            client.get(url)
    except Exception as exc:
        return {"status": False, "error": str(exc)}
    return {"status": "ok"}


def resume_sabnzbd_queue(cfg: dict) -> dict:
    url = sabnzbd_url(cfg, "resume")
    try:
        with httpx.Client(timeout=10.0, verify=False) as client:
            client.get(url)
    except Exception as exc:
        return {"status": False, "error": str(exc)}
    return {"status": "ok"}


def fetch_prowlarr_indexers(cfg: dict) -> list:
    base = prowlarr_base(cfg)
    api_key = _cfg_map(cfg)["api_key"]
    if not api_key:
        return []
    try:
        with httpx.Client(timeout=10.0, verify=False) as client:
            resp = client.get(f"{base}/api/v1/indexer", headers={"X-Api-Key": api_key})
            if resp.status_code != 200:
                return []
            items = resp.json()
            return items if isinstance(items, list) else []
    except Exception:
        return []
