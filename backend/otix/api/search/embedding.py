from __future__ import annotations

import asyncio
import concurrent.futures
import hashlib
import json
import sys

import structlog

from otix.api.ttl import TTL
from otix.infrastructure.redis import get_redis

logger = structlog.get_logger(__name__)


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


def _grouped_cache_key(q: str, media_type_limit: int, exclude_adult: bool) -> str:
    raw = f"search:grouped:{q.lower().strip()}:{media_type_limit}:adult{0 if exclude_adult else 1}"
    return f"search:grouped:{hashlib.sha256(raw.encode()).hexdigest()[:16]}"


def _embedding_cache_key(q: str) -> str:
    return f"emb:{hashlib.sha256(q.lower().strip().encode()).hexdigest()[:16]}"


def _suggestions_cache_key(q: str, limit: int, media_type: str | None, exclude_adult: bool) -> str:
    raw = f"suggest:{q.lower().strip()}:{limit}:{media_type or ''}:adult{0 if exclude_adult else 1}"
    return f"suggest:{hashlib.sha256(raw.encode()).hexdigest()[:16]}"


def _poll_query_hash(q: str, media_type: str | None) -> str:
    raw = f"{q.lower().strip()}:{media_type or ''}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _do_embed_sync(q: str) -> list[float] | None:
    """Run embedding in a subprocess so a native crash (onnxruntime segfault)
    doesn't take down the API worker."""
    from otix.services.embedding_service import EmbeddingService

    try:
        return asyncio.run(EmbeddingService().embed(q, purpose="query"))
    except Exception:
        logger.exception("embedding_sync_failed", query=q)
        return None


# Shared process pool for embedding — one extra process, keeps ONNX native
# code isolated from the main uvicorn workers.
_embed_pool: concurrent.futures.ProcessPoolExecutor | None = None


def _get_pool() -> concurrent.futures.ProcessPoolExecutor:
    global _embed_pool
    if _embed_pool is None:
        _embed_pool = concurrent.futures.ProcessPoolExecutor(max_workers=1)
    return _embed_pool


def _replace_pool() -> concurrent.futures.ProcessPoolExecutor:
    """Replace a dead/broken process pool with a fresh one."""
    global _embed_pool
    try:
        if _embed_pool is not None:
            _embed_pool.shutdown(wait=False)
    except Exception:
        pass
    _embed_pool = concurrent.futures.ProcessPoolExecutor(max_workers=1)
    return _embed_pool


async def _embed_query(q: str) -> list[float] | None:
    """Generate an embedding. Checks Redis cache first; on miss, runs
    embedding in a subprocess and caches the result."""
    redis = await get_redis()
    emb_key = _embedding_cache_key(q)
    cached = await redis.get(emb_key)
    if cached:
        return json.loads(cached)

    pool = _get_pool()
    loop = asyncio.get_running_loop()
    try:
        embedding = await asyncio.wait_for(
            loop.run_in_executor(pool, _do_embed_sync, q),
            timeout=120.0,  # first call includes model download, can take minutes
        )
        if embedding:
            await redis.set(emb_key, json.dumps(embedding), ex=TTL["SEARCH"]["EMBEDDING"])
        return embedding
    except asyncio.TimeoutError:
        logger.warning("query embedding timed out, recreating pool", query=q)
        _replace_pool()  # kill the stuck subprocess so next call gets a fresh one
        return None
    except (concurrent.futures.process.BrokenProcessPool, Exception):
        logger.exception("embedding pool crashed, recreating")
        _replace_pool()
        return None


async def get_embedding(q: str) -> list[float] | None:
    """Public wrapper around _embed_query — ensures a single embedding
    is shared across all parallel search branches (grouped search, etc.)."""
    return await _embed_query(q)
