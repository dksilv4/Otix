from __future__ import annotations

import asyncio
import concurrent.futures
import hashlib
import json
import sys

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


def _do_embed_sync(q: str) -> list[float] | None:
    """Run embedding in a subprocess so a native crash (onnxruntime segfault)
    doesn't take down the API worker."""
    from otix.services.embedding_service import EmbeddingService

    try:
        import asyncio

        return asyncio.run(EmbeddingService().embed(q, purpose="query"))
    except Exception:
        return None


# Shared process pool for embedding — one extra process, keeps ONNX native
# code isolated from the main uvicorn workers.
_embed_pool = concurrent.futures.ProcessPoolExecutor(max_workers=1)


async def _embed_query(q: str) -> list[float] | None:
    """Generate an embedding. Checks Redis cache first; on miss, runs
    embedding in a subprocess and caches the result."""
    redis = await get_redis()
    emb_key = _embedding_cache_key(q)
    cached = await redis.get(emb_key)
    if cached:
        return json.loads(cached)

    loop = asyncio.get_running_loop()
    try:
        embedding = await loop.run_in_executor(_embed_pool, _do_embed_sync, q)
        if embedding:
            await redis.set(emb_key, json.dumps(embedding), ex=EMBEDDING_CACHE_TTL)
        return embedding
    except (concurrent.futures.process.BrokenProcessPool, Exception):
        # Subprocess crashed (onnx segfault, OOM, etc.) — disable embedding
        # for the rest of this worker's lifetime by replacing the pool with
        # a no-op stub.
        _embed_pool.shutdown(wait=False)
        return None
