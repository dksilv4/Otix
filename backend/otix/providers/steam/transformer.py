"""Steam API response → domain data extraction.

Pure functions. Extracts structured values from Steam store API responses
so the hydrator only handles persistence.
"""

from __future__ import annotations

from otix.lib.types import JSONValue


def extract_developers(store_data: dict[str, JSONValue]) -> list[str] | None:
    developers = store_data.get("developers")
    if isinstance(developers, list) and developers:
        return [str(d) for d in developers if d]
    return None


def extract_publishers(store_data: dict[str, JSONValue]) -> list[str] | None:
    publishers = store_data.get("publishers")
    if isinstance(publishers, list) and publishers:
        return [str(p) for p in publishers if p]
    return None


def extract_price(store_data: dict[str, JSONValue]) -> dict[str, JSONValue] | None:
    """Extract price info: {currency, initial, final, discount_percent}."""
    price = store_data.get("price_overview")
    if not isinstance(price, dict):
        return None
    return {
        "currency": str(price.get("currency", "")),
        "initial": int(price.get("initial", 0)),
        "final": int(price.get("final", 0)),
        "discount_percent": int(price.get("discount_percent", 0)),
    }


def extract_recommendations(store_data: dict[str, JSONValue]) -> int | None:
    recs = store_data.get("recommendations")
    if isinstance(recs, dict):
        total = recs.get("total")
        if isinstance(total, (int, float)):
            return int(total)
    return None


def extract_review_summary(store_data: dict[str, JSONValue]) -> str | None:
    """Steam review summary: 'Overwhelmingly Positive', 'Very Positive', etc."""
    summary = store_data.get("review_summary")
    if isinstance(summary, str) and summary:
        return summary
    return None


def extract_review_data(reviews_json: dict[str, JSONValue]) -> tuple[str, int, int] | None:
    """Extract (review_score_desc, review_score, total_reviews) from Steam reviews API.

    review_score is scaled 1-10 from the API; we convert to 0-100.
    """
    qs = reviews_json.get("query_summary")
    if not isinstance(qs, dict):
        return None
    desc = qs.get("review_score_desc")
    score = qs.get("review_score")
    total = qs.get("total_reviews")
    if isinstance(desc, str) and isinstance(score, (int, float)) and isinstance(total, (int, float)):
        return str(desc), int(score) * 10, int(total)
    return None


def extract_review_score(store_data: dict[str, JSONValue]) -> tuple[int, int] | None:
    """Returns (review_score, total_reviews) from Steam user reviews."""
    score = store_data.get("review_score")
    count = store_data.get("total_reviews")
    if isinstance(score, (int, float)) and isinstance(count, (int, float)):
        return int(score), int(count)
    return None


def extract_metacritic(store_data: dict[str, JSONValue]) -> tuple[int, str] | None:
    """Returns (score, url) from Steam's metacritic block."""
    mc = store_data.get("metacritic")
    if isinstance(mc, dict):
        score = mc.get("score")
        url = mc.get("url")
        if isinstance(score, (int, float)):
            return int(score), str(url or "")
    return None


def extract_screenshot_urls(store_data: dict[str, JSONValue]) -> list[str]:
    """Extract full-size screenshot URLs from Steam store data."""
    screenshots = store_data.get("screenshots")
    if not isinstance(screenshots, list):
        return []
    urls: list[str] = []
    for s in screenshots:
        if isinstance(s, dict):
            url = s.get("path_full")
            if isinstance(url, str) and url:
                urls.append(url)
    return urls


def extract_movie_data(store_data: dict[str, JSONValue]) -> list[dict[str, str]]:
    """Extract video entries: [{name, thumbnail, webm_url}, ...]."""
    movies = store_data.get("movies")
    if not isinstance(movies, list):
        return []
    result: list[dict[str, str]] = []
    for m in movies:
        if not isinstance(m, dict):
            continue
        name = m.get("name")
        thumbnail = m.get("thumbnail")
        webm = m.get("webm")
        if isinstance(webm, dict):
            url = webm.get("max") or webm.get("480") or ""
        else:
            url = ""
        if isinstance(name, str) and url:
            result.append({
                "name": str(name),
                "thumbnail": str(thumbnail or ""),
                "url": str(url),
            })
    return result
