from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
import httpx

from otix_server.arr_types import (
    ArrConnectionTestResult,
    ArrQueueRecord,
    ArrQueueResponse,
    QualityProfile,
    RadarrConfig,
    RadarrInstance,
    RadarrMovie,
    RootFolder,
    SonarrConfig,
    SonarrInstance,
    SonarrSeries,
)

logger = logging.getLogger(__name__)


def build_arr_base_url(host: str, port: int, use_ssl: bool, url_base: str) -> str:
    """Build sanitized base URL for Radarr/Sonarr instances."""
    raw_host = (host or "").strip()
    clean_subpath = (url_base or "").strip().strip("/")
    path_suffix = f"/{clean_subpath}" if clean_subpath else ""

    if raw_host.startswith("http://") or raw_host.startswith("https://"):
        parsed = urlparse(raw_host)
        scheme = parsed.scheme
        netloc = parsed.netloc
        existing_path = parsed.path.rstrip("/")
        if clean_subpath and not existing_path.endswith(clean_subpath):
            existing_path = f"{existing_path}/{clean_subpath}".rstrip("/")
        return f"{scheme}://{netloc}{existing_path}"

    cleaned_host = raw_host.replace(",", ".").rstrip("/")
    if "/" in cleaned_host:
        parts = cleaned_host.split("/", 1)
        host_domain = parts[0]
        extra_path = "/" + parts[1].strip("/")
        if clean_subpath and not extra_path.endswith(clean_subpath):
            extra_path = f"{extra_path}/{clean_subpath}".rstrip("/")
        scheme = "https" if use_ssl else "http"
        return f"{scheme}://{host_domain}{extra_path}"

    scheme = "https" if use_ssl else "http"
    if ":" in cleaned_host:
        return f"{scheme}://{cleaned_host}{path_suffix}"
    return f"{scheme}://{cleaned_host}:{port}{path_suffix}"


def _get_client_timeout() -> httpx.Timeout:
    return httpx.Timeout(15.0, connect=10.0)


def _format_arr_error_response(resp: httpx.Response) -> str:
    try:
        data = resp.json()
        if isinstance(data, list):
            messages = [
                item.get("errorMessage")
                for item in data
                if isinstance(item, dict) and item.get("errorMessage")
            ]
            if messages:
                return "; ".join(messages)
        elif isinstance(data, dict):
            msg = data.get("message") or data.get("error") or data.get("detail")
            if msg:
                return str(msg)
    except Exception:
        pass
    return resp.text or str(resp.status_code)


# ── Radarr Client Functions ─────────────────────────────────────────────

def test_radarr_connection(config: RadarrConfig | RadarrInstance) -> ArrConnectionTestResult:
    """Test connection to Radarr system/status endpoint."""
    if not config.api_key:
        return ArrConnectionTestResult(ok=False, message="Radarr API key is missing")

    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/system/status"
    headers = {"X-Api-Key": config.api_key}

    try:
        with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                version = data.get("version", "unknown")
                return ArrConnectionTestResult(
                    ok=True,
                    version=version,
                    message=f"Connected to Radarr v{version}",
                )
            elif resp.status_code in (401, 403):
                return ArrConnectionTestResult(ok=False, message="Invalid Radarr API key")
            return ArrConnectionTestResult(ok=False, message=f"HTTP {resp.status_code} from Radarr")
    except Exception as exc:
        return ArrConnectionTestResult(ok=False, message=f"Cannot connect to Radarr: {exc}")


def fetch_radarr_root_folders(config: RadarrConfig | RadarrInstance) -> List[RootFolder]:
    """Fetch root folders configured in Radarr."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/rootfolder"
    headers = {"X-Api-Key": config.api_key}

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.get(url, headers=headers)
        resp.raise_for_status()
        items = resp.json() or []
        return [
            RootFolder(
                id=item.get("id", 0),
                path=item.get("path", ""),
                free_space=item.get("freeSpace"),
            )
            for item in items
        ]


def fetch_radarr_quality_profiles(config: RadarrConfig | RadarrInstance) -> List[QualityProfile]:
    """Fetch quality profiles configured in Radarr."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/qualityprofile"
    headers = {"X-Api-Key": config.api_key}

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.get(url, headers=headers)
        resp.raise_for_status()
        items = resp.json() or []
        return [
            QualityProfile(id=item.get("id", 0), name=item.get("name", "Unknown"))
            for item in items
        ]


def fetch_radarr_movies(config: RadarrConfig | RadarrInstance) -> List[RadarrMovie]:
    """Fetch all movies in Radarr library."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/movie"
    headers = {"X-Api-Key": config.api_key}

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.get(url, headers=headers)
        resp.raise_for_status()
        items = resp.json() or []
        movies: List[RadarrMovie] = []
        for item in items:
            movies.append(
                RadarrMovie(
                    id=item.get("id", 0),
                    title=item.get("title", ""),
                    year=item.get("year"),
                    tmdb_id=item.get("tmdbId"),
                    imdb_id=item.get("imdbId"),
                    overview=item.get("overview"),
                    monitored=item.get("monitored", True),
                    has_file=item.get("hasFile", False),
                    path=item.get("path"),
                    size_on_disk=item.get("sizeOnDisk"),
                    status=item.get("status"),
                    images=item.get("images") or [],
                )
            )
        return movies


def lookup_radarr_movie(config: RadarrConfig, term: str) -> List[Dict[str, Any]]:
    """Search/lookup movies in Radarr (by title or tmdbId)."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/movie/lookup"
    headers = {"X-Api-Key": config.api_key}
    params = {"term": term}

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        return resp.json() or []


def add_radarr_movie(config: RadarrConfig, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Add a movie to Radarr with monitoring and auto-search."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/movie"
    headers = {"X-Api-Key": config.api_key, "Content-Type": "application/json"}

    # Default fallback quality profile and root folder from config if not provided in payload
    root_folder = (
        payload.get("root_folder_path")
        or payload.get("rootFolderPath")
        or config.root_folder_path
    )
    if not root_folder:
        folders = fetch_radarr_root_folders(config)
        root_folder = folders[0].path if folders else None
    if not root_folder:
        raise ValueError("No Radarr root folder path configured")

    quality_profile = (
        payload.get("quality_profile_id")
        or payload.get("qualityProfileId")
        or config.quality_profile_id
    )
    if not quality_profile:
        profiles = fetch_radarr_quality_profiles(config)
        quality_profile = profiles[0].id if profiles else 1

    final_payload = {
        "title": payload.get("title"),
        "tmdbId": payload.get("tmdb_id") or payload.get("tmdbId"),
        "year": payload.get("year"),
        "qualityProfileId": quality_profile,
        "rootFolderPath": root_folder,
        "monitored": payload.get("monitored", True),
        "minimumAvailability": payload.get("minimum_availability")
        or payload.get("minimumAvailability")
        or config.minimum_availability
        or "announced",
        "addOptions": {
            "searchForMovie": payload.get("search_for_movie", True)
            if "search_for_movie" in payload
            else payload.get("searchForMovie", True),
        },
    }

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.post(url, headers=headers, json=final_payload)
        if resp.is_error:
            err_msg = _format_arr_error_response(resp)
            raise ValueError(f"Radarr rejected movie request: {err_msg}")
        return resp.json()


def fetch_radarr_queue(
    config: RadarrConfig, page: int = 1, page_size: int = 50
) -> ArrQueueResponse:
    """Fetch active download queue from Radarr."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/queue"
    headers = {"X-Api-Key": config.api_key}
    params = {"page": page, "pageSize": page_size, "includeUnknownMovieItems": "true"}

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json() or {}
        raw_records = data.get("records") or []
        records: List[ArrQueueRecord] = []
        for r in raw_records:
            movie = r.get("movie") or {}
            records.append(
                ArrQueueRecord(
                    id=r.get("id", 0),
                    title=r.get("title") or movie.get("title") or "Unknown",
                    status=r.get("status", "Unknown"),
                    tracked_download_status=r.get("trackedDownloadStatus"),
                    size=float(r.get("size", 0.0)),
                    size_left=float(r.get("sizeleft", 0.0)),
                    timeleft=r.get("timeleft"),
                    estimated_completion_time=r.get("estimatedCompletionTime"),
                    protocol=r.get("protocol"),
                    download_client=r.get("downloadClient"),
                    indexer=r.get("indexer"),
                    output_path=r.get("outputPath"),
                    error_message=r.get("errorMessage"),
                    tmdb_id=movie.get("tmdbId") or r.get("tmdbId"),
                    tvdb_id=movie.get("tvdbId") or r.get("tvdbId"),
                )
            )
        return ArrQueueResponse(
            page=data.get("page", 1),
            page_size=data.get("pageSize", page_size),
            total_records=data.get("totalRecords", len(records)),
            records=records,
        )


def delete_radarr_queue_item(
    config: RadarrConfig, queue_id: int, remove_from_client: bool = True, blocklist: bool = False
) -> bool:
    """Remove download from Radarr queue."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/queue/{queue_id}"
    headers = {"X-Api-Key": config.api_key}
    params = {
        "removeFromClient": str(remove_from_client).lower(),
        "blocklist": str(blocklist).lower(),
    }

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.delete(url, headers=headers, params=params)
        return resp.status_code in (200, 204)


def fetch_radarr_history(
    config: RadarrConfig, page: int = 1, page_size: int = 50
) -> Dict[str, Any]:
    """Fetch download/import history from Radarr."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/history"
    headers = {"X-Api-Key": config.api_key}
    params = {"page": page, "pageSize": page_size, "sortKey": "date", "sortDirection": "descending"}

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        return resp.json() or {}


# ── Sonarr Client Functions ─────────────────────────────────────────────

def test_sonarr_connection(config: SonarrConfig) -> ArrConnectionTestResult:
    """Test connection to Sonarr system/status endpoint."""
    if not config.api_key:
        return ArrConnectionTestResult(ok=False, message="Sonarr API key is missing")

    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/system/status"
    headers = {"X-Api-Key": config.api_key}

    try:
        with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                version = data.get("version", "unknown")
                return ArrConnectionTestResult(
                    ok=True,
                    version=version,
                    message=f"Connected to Sonarr v{version}",
                )
            elif resp.status_code in (401, 403):
                return ArrConnectionTestResult(ok=False, message="Invalid Sonarr API key")
            return ArrConnectionTestResult(ok=False, message=f"HTTP {resp.status_code} from Sonarr")
    except Exception as exc:
        return ArrConnectionTestResult(ok=False, message=f"Cannot connect to Sonarr: {exc}")


def fetch_sonarr_root_folders(config: SonarrConfig) -> List[RootFolder]:
    """Fetch root folders configured in Sonarr."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/rootfolder"
    headers = {"X-Api-Key": config.api_key}

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.get(url, headers=headers)
        resp.raise_for_status()
        items = resp.json() or []
        return [
            RootFolder(
                id=item.get("id", 0),
                path=item.get("path", ""),
                free_space=item.get("freeSpace"),
            )
            for item in items
        ]


def fetch_sonarr_quality_profiles(config: SonarrConfig) -> List[QualityProfile]:
    """Fetch quality profiles configured in Sonarr."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/qualityprofile"
    headers = {"X-Api-Key": config.api_key}

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.get(url, headers=headers)
        resp.raise_for_status()
        items = resp.json() or []
        return [
            QualityProfile(id=item.get("id", 0), name=item.get("name", "Unknown"))
            for item in items
        ]


def fetch_sonarr_series(config: SonarrConfig) -> List[SonarrSeries]:
    """Fetch all series in Sonarr library."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/series"
    headers = {"X-Api-Key": config.api_key}

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.get(url, headers=headers)
        resp.raise_for_status()
        items = resp.json() or []
        series_list: List[SonarrSeries] = []
        for item in items:
            series_list.append(
                SonarrSeries(
                    id=item.get("id", 0),
                    title=item.get("title", ""),
                    year=item.get("year"),
                    tvdb_id=item.get("tvdbId"),
                    tmdb_id=item.get("tmdbId"),
                    imdb_id=item.get("imdbId"),
                    overview=item.get("overview"),
                    monitored=item.get("monitored", True),
                    episode_count=(item.get("statistics") or {}).get("totalEpisodeCount"),
                    episode_file_count=(item.get("statistics") or {}).get("episodeFileCount"),
                    status=item.get("status"),
                    path=item.get("path"),
                    network=item.get("network"),
                    images=item.get("images") or [],
                )
            )
        return series_list


def lookup_sonarr_series(config: SonarrConfig, term: str) -> List[Dict[str, Any]]:
    """Search/lookup series in Sonarr (by title or tvdbId)."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/series/lookup"
    headers = {"X-Api-Key": config.api_key}
    params = {"term": term}

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        return resp.json() or []


def _match_sonarr_lookup(results: List[Dict[str, Any]], tmdb_id: Any) -> Optional[Dict[str, Any]]:
    if not results:
        return None
    for item in results:
        if item.get("tmdbId") is not None and str(item.get("tmdbId")) == str(tmdb_id):
            return item
    return results[0]


def resolve_sonarr_add_target(config: SonarrConfig, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve title/year/tvdbId for an add, using a TMDB lookup when needed."""
    tvdb_id = payload.get("tvdb_id") or payload.get("tvdbId")
    tmdb_id = payload.get("tmdb_id") or payload.get("tmdbId")
    title = payload.get("title")
    year = payload.get("year")

    if tvdb_id:
        return {"title": title, "tvdb_id": int(tvdb_id), "year": year}

    if not tmdb_id:
        raise ValueError("tvdb_id or tmdb_id is required")

    match = _match_sonarr_lookup(lookup_sonarr_series(config, f"tmdb:{tmdb_id}"), tmdb_id)
    if (not match or match.get("tvdbId") is None) and title:
        match = _match_sonarr_lookup(lookup_sonarr_series(config, str(title)), tmdb_id)
    if not match or match.get("tvdbId") is None:
        raise ValueError(f"Could not resolve Sonarr series for TMDB id {tmdb_id}")

    return {
        "title": title or match.get("title"),
        "tvdb_id": int(match["tvdbId"]),
        "year": year or match.get("year"),
    }


def add_sonarr_series(config: SonarrConfig, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Add a series to Sonarr with monitoring and auto-search."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/series"
    headers = {"X-Api-Key": config.api_key, "Content-Type": "application/json"}
    resolved = resolve_sonarr_add_target(config, payload)
    root_folder = (
        payload.get("root_folder_path")
        or payload.get("rootFolderPath")
        or config.root_folder_path
    )
    if not root_folder:
        folders = fetch_sonarr_root_folders(config)
        root_folder = folders[0].path if folders else None
    if not root_folder:
        raise ValueError("No Sonarr root folder path configured")

    quality_profile = (
        payload.get("quality_profile_id")
        or payload.get("qualityProfileId")
        or config.quality_profile_id
    )
    if not quality_profile:
        profiles = fetch_sonarr_quality_profiles(config)
        quality_profile = profiles[0].id if profiles else 1

    final_payload = {
        "title": resolved["title"],
        "tvdbId": resolved["tvdb_id"],
        "year": resolved["year"],
        "qualityProfileId": quality_profile,
        "rootFolderPath": root_folder,
        "monitored": payload.get("monitored", True),
        "seasonFolder": payload.get("season_folder", True)
        if "season_folder" in payload
        else payload.get("seasonFolder", config.season_folder),
        "seriesType": payload.get("series_type")
        or payload.get("seriesType")
        or config.series_type
        or "standard",
        "addOptions": {
            "searchForMissingEpisodes": payload.get("search_for_missing_episodes", True)
            if "search_for_missing_episodes" in payload
            else payload.get("searchForMissingEpisodes", True),
        },
    }

    if config.language_profile_id is not None:
        final_payload["languageProfileId"] = config.language_profile_id

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.post(url, headers=headers, json=final_payload)
        if resp.is_error:
            err_msg = _format_arr_error_response(resp)
            raise ValueError(f"Sonarr rejected series request: {err_msg}")
        return resp.json()


def fetch_sonarr_queue(
    config: SonarrConfig, page: int = 1, page_size: int = 50
) -> ArrQueueResponse:
    """Fetch active download queue from Sonarr."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/queue"
    headers = {"X-Api-Key": config.api_key}
    params = {"page": page, "pageSize": page_size, "includeUnknownSeriesItems": "true"}

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json() or {}
        raw_records = data.get("records") or []
        records: List[ArrQueueRecord] = []
        for r in raw_records:
            series = r.get("series") or {}
            records.append(
                ArrQueueRecord(
                    id=r.get("id", 0),
                    title=r.get("title") or series.get("title") or "Unknown",
                    status=r.get("status", "Unknown"),
                    tracked_download_status=r.get("trackedDownloadStatus"),
                    size=float(r.get("size", 0.0)),
                    size_left=float(r.get("sizeleft", 0.0)),
                    timeleft=r.get("timeleft"),
                    estimated_completion_time=r.get("estimatedCompletionTime"),
                    protocol=r.get("protocol"),
                    download_client=r.get("downloadClient"),
                    indexer=r.get("indexer"),
                    output_path=r.get("outputPath"),
                    error_message=r.get("errorMessage"),
                    tmdb_id=series.get("tmdbId") or r.get("tmdbId"),
                    tvdb_id=series.get("tvdbId") or r.get("tvdbId"),
                )
            )
        return ArrQueueResponse(
            page=data.get("page", 1),
            page_size=data.get("pageSize", page_size),
            total_records=data.get("totalRecords", len(records)),
            records=records,
        )


def delete_sonarr_queue_item(
    config: SonarrConfig, queue_id: int, remove_from_client: bool = True, blocklist: bool = False
) -> bool:
    """Remove download from Sonarr queue."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/queue/{queue_id}"
    headers = {"X-Api-Key": config.api_key}
    params = {
        "removeFromClient": str(remove_from_client).lower(),
        "blocklist": str(blocklist).lower(),
    }

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.delete(url, headers=headers, params=params)
        return resp.status_code in (200, 204)


def fetch_sonarr_history(
    config: SonarrConfig, page: int = 1, page_size: int = 50
) -> Dict[str, Any]:
    """Fetch download/import history from Sonarr."""
    base = build_arr_base_url(config.host, config.port, config.use_ssl, config.url_base)
    url = f"{base}/api/v3/history"
    headers = {"X-Api-Key": config.api_key}
    params = {"page": page, "pageSize": page_size, "sortKey": "date", "sortDirection": "descending"}

    with httpx.Client(timeout=_get_client_timeout(), verify=False) as client:
        resp = client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        return resp.json() or {}
