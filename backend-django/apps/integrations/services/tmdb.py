"""TMDb account sync: ratings (import/export) + watchlist import.

Port of ``backend/otix/services/tmdb_rating_service.py`` behind a urllib
``_request`` leaf (patched in tests). Fetching a rated/watchlist page walks
TMDb's paginated ``/account/{id}/...`` lists; a non-200 / non-JSON page or a
network failure raises ``RuntimeError``/``URLError`` so the calling view answers
500 (mirrors the legacy router's generic catch). Per-item failures are counted
as ``skipped`` and never raise, matching the legacy service.

Matching is stage-1 only: a TMDB id resolves to a catalog ``MediaItem`` via an
existing ``tmdb`` ``ExternalID`` row filtered by ``media_type`` (movie vs show,
per the increment-19 convention so shared numeric ids never cross-point).
Unmatched items are reported as ``skipped`` — the legacy full TMDB catalog
sync (``_sync_tmdb_media``: fetch + seed with artwork) is DEFERRED to the
platform wave. Imported ratings use ``apps.media.services.rating.upsert_rating``
(keeps ``MediaItem.avg_rating``/``rating_count`` in sync); watchlist import adds
the ``owned`` interaction (the Django proxy for legacy ``is_in_library``).
Export writes each user rating back via the TMDB ``/movie|/tv/{id}/rating``
endpoints. The legacy auto-unlink on revoked session is deferred.
"""

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.contrib.contenttypes.models import ContentType

from apps.media.models import ExternalID, MediaItem
from apps.media.services.interaction import set_interaction
from apps.media.services.rating import upsert_rating
from apps.social.models import MediaItemRating, UserMediaInteraction

logger = logging.getLogger(__name__)

TMDB_API_BASE = "https://api.themoviedb.org/3"

SYNC_DIRECTIONS = {"disabled", "import", "export", "bidirectional"}

# provider endpoint kind -> (list suffix, otix media_type).
_RATED_KINDS = (("movies", "movie"), ("tv", "show"))
_WATCHLIST_KINDS = (("movies", "movie"), ("tv", "show"))

_EMPTY = {"imported": 0, "skipped": 0, "errors": None}


def _api_key() -> str:
    return (getattr(settings, "TMDB_API_KEY", "") or "").strip()


def _request(url: str, *, method: str = "GET", data: str | None = None, timeout: float = 30.0):
    """Raw urllib leaf: return ``(status_code, text)``; URLError propagates."""
    request = urllib.request.Request(url, method=method)
    if data is not None:
        request.data = data.encode("utf-8")
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")


def _media_content_type():
    return ContentType.objects.get_for_model(MediaItem)


def _list_url(kind: str, account_id: int, session_id: str, page: int) -> str:
    suffix = {
        "rated_movies": f"/account/{account_id}/rated/movies",
        "rated_tv": f"/account/{account_id}/rated/tv",
        "watchlist_movies": f"/account/{account_id}/watchlist/movies",
        "watchlist_tv": f"/account/{account_id}/watchlist/tv",
    }[kind]
    params = {
        "api_key": _api_key(),
        "session_id": session_id,
        "language": "en-US",
        "page": page,
    }
    if kind in ("rated_movies", "rated_tv"):
        params["sort_by"] = "created_at.desc"
    return f"{TMDB_API_BASE}{suffix}?{urllib.parse.urlencode(params)}"


def _fetch_list(kind: str, account_id: int, session_id: str, page: int) -> dict:
    """Fetch one TMDB list page; non-200 / non-JSON / network -> raise."""
    status, body = _request(_list_url(kind, account_id, session_id, page))
    if status != 200:
        raise RuntimeError(f"TMDb {kind} page {page} failed with HTTP {status}")
    try:
        data = json.loads(body)
    except ValueError as error:
        raise RuntimeError(f"TMDb {kind} page {page} was not JSON") from error
    if not isinstance(data, dict):
        raise RuntimeError(f"TMDb {kind} page {page} had an unexpected shape")
    return data


def _find_media_by_tmdb(tmdb_id: int, otix_type: str) -> MediaItem | None:
    """Resolve a TMDB id to a catalog MediaItem (stage-1 ExternalID match)."""
    row = (
        ExternalID.objects.filter(
            content_type=_media_content_type(),
            provider="tmdb",
            external_id=str(tmdb_id),
            media_type=otix_type,
        )
        .values("object_id")
        .first()
    )
    if row is None:
        return None
    return MediaItem.objects.filter(pk=row["object_id"]).first()


def _tmdb_rating_to_score(rating) -> int:
    """Convert a TMDb rating (0.5-10, half steps) to an Otix 1-10 score."""
    return max(1, min(10, round(float(rating))))


def _import_rated_lists(user, account_id: int, session_id: str, result: dict) -> None:
    for kind, otix_type in _RATED_KINDS:
        page = 1
        while True:
            data = _fetch_list(f"rated_{kind}", account_id, session_id, page)
            results = data.get("results") or []
            if not results:
                break
            for entry in results:
                try:
                    rating = entry.get("rating")
                    tmdb_id = entry.get("id")
                    if not isinstance(rating, (int, float)) or not isinstance(tmdb_id, int):
                        continue
                    media = _find_media_by_tmdb(tmdb_id, otix_type)
                    if media is None:
                        result["skipped"] += 1
                        continue
                    upsert_rating(user, media.pk, _tmdb_rating_to_score(rating))
                    result["imported"] += 1
                except Exception:
                    logger.exception("tmdb rating import failed for %s", entry.get("id"))
                    result["skipped"] += 1
            if page >= int(data.get("total_pages") or 0):
                break
            page += 1
            time.sleep(0.25)


def _rate_url(kind: str, tmdb_id: int, session_id: str) -> str:
    params = {"api_key": _api_key(), "session_id": session_id}
    return f"{TMDB_API_BASE}/{kind}/{tmdb_id}/rating?{urllib.parse.urlencode(params)}"


def _rate_tmdb(kind: str, tmdb_id: int, value: float, session_id: str) -> None:
    status, _ = _request(
        _rate_url(kind, tmdb_id, session_id), method="POST", data=json.dumps({"value": value})
    )
    if status not in (200, 201):
        raise RuntimeError(f"TMDb {kind} rating write failed with HTTP {status}")


def _export_otix_ratings(user, session_id: str, result: dict) -> None:
    ratings = MediaItemRating.objects.filter(user=user).select_related("media_item")
    for rating in ratings:
        try:
            media = rating.media_item
            otix_type = media.media_type
            if otix_type not in ("movie", "show"):
                result["skipped"] += 1
                continue
            external = (
                ExternalID.objects.filter(
                    content_type=_media_content_type(),
                    provider="tmdb",
                    object_id=media.pk,
                    media_type=otix_type,
                )
                .values("external_id")
                .first()
            )
            if external is None:
                result["skipped"] += 1
                continue
            kind = "tv" if otix_type == "show" else "movie"
            _rate_tmdb(kind, int(external["external_id"]), float(rating.score), session_id)
            result["exported"] += 1
        except Exception:
            logger.exception("tmdb rating export failed for %s", rating.pk)
            result["skipped"] += 1


def sync_tmdb_ratings(user, direction: str) -> dict:
    """Import and/or export the user's TMDb ratings per ``direction``."""
    result = {"direction": direction, "imported": 0, "exported": 0, "skipped": 0, "errors": None}
    if direction not in SYNC_DIRECTIONS:
        result["errors"] = [f"Invalid direction: {direction}"]
        return result
    if direction == "disabled":
        return result
    if not user.tmdb_account_id or not user.tmdb_session_id:
        result["errors"] = ["TMDb account not linked"]
        return result
    account_id = user.tmdb_account_id
    session_id = user.tmdb_session_id
    if direction in ("import", "bidirectional"):
        _import_rated_lists(user, account_id, session_id, result)
    if direction in ("export", "bidirectional"):
        _export_otix_ratings(user, session_id, result)
    return result


def import_tmdb_watchlist(user) -> dict:
    """Import the user's TMDb watchlist items into their Otix library."""
    result = dict(_EMPTY)
    if not user.tmdb_account_id or not user.tmdb_session_id:
        result["errors"] = ["TMDb account not linked"]
        return result
    account_id = user.tmdb_account_id
    session_id = user.tmdb_session_id
    for kind, otix_type in _WATCHLIST_KINDS:
        page = 1
        while True:
            data = _fetch_list(f"watchlist_{kind}", account_id, session_id, page)
            results = data.get("results") or []
            if not results:
                break
            for entry in results:
                try:
                    tmdb_id = entry.get("id")
                    if not isinstance(tmdb_id, int):
                        continue
                    media = _find_media_by_tmdb(tmdb_id, otix_type)
                    if media is None:
                        result["skipped"] += 1
                        continue
                    if UserMediaInteraction.objects.filter(
                        user=user, media_item_id=media.pk, interaction_type="owned"
                    ).exists():
                        result["skipped"] += 1
                        continue
                    set_interaction(user, media.pk, "owned")
                    result["imported"] += 1
                except Exception:
                    logger.exception("tmdb watchlist import failed for %s", entry.get("id"))
                    result["skipped"] += 1
            if page >= int(data.get("total_pages") or 0):
                break
            page += 1
            time.sleep(0.25)
    return result
