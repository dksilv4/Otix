# TODO: Review this file
from __future__ import annotations

import asyncio
import hashlib
import json

from otix.infrastructure.redis import get_redis

SEARCH_CACHE_TTL = 30
EMBEDDING_CACHE_TTL = 300


def _cache_key(
    q: str,
    media_type: str | None,
    sort_by: str | None,
    page: int,
    page_size: int,
    exclude_adult: bool = True,
) -> str:
    raw = f"{q.lower().strip()}:{media_type or ''}:{sort_by or ''}:{page}:{page_size}:adult{0 if exclude_adult else 1}"
    return f"search:{hashlib.sha256(raw.encode()).hexdigest()[:16]}"


def _embedding_cache_key(q: str) -> str:
    return f"emb:{hashlib.sha256(q.lower().strip().encode()).hexdigest()[:16]}"


async def _embed_query(q: str) -> list[float] | None:
    """Generate an embedding. Checks Redis cache first; on miss, generates
    in background so next search with same query uses the cached value."""
    redis = await get_redis()
    emb_key = _embedding_cache_key(q)
    cached = await redis.get(emb_key)
    if cached:
        return json.loads(cached)

    async def _generate_and_cache():
        try:
            from otix.services.embedding_service import EmbeddingService

            embedding = await EmbeddingService().embed(q, purpose="query")
            if embedding:
                await redis.set(emb_key, json.dumps(embedding), ex=EMBEDDING_CACHE_TTL)
        except Exception:
            pass

    asyncio.create_task(_generate_and_cache())
    return None
