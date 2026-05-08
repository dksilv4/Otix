from __future__ import annotations

import asyncio
import threading

import structlog

from otix.infrastructure.config import settings

logger = structlog.get_logger(__name__)


class EmbeddingService:
    """Generate text embeddings with a local FastEmbed model.

    The model is loaded lazily and cached for the process lifetime. Inference
    runs in a thread executor to avoid blocking the asyncio event loop.

    No API keys or network calls needed — the model downloads once, then runs
    entirely on CPU via ONNX.
    """

    _model: object | None = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._model_name = settings.embedding_model

    def _get_model(self):
        """Thread-safe lazy-load of the FastEmbed model."""
        if self._model is None:
            with self._lock:
                if self._model is None:
                    from fastembed import TextEmbedding

                    logger.info("loading embedding model", model=self._model_name)
                    self._model = TextEmbedding(model_name=self._model_name)
                    logger.info("embedding model loaded", model=self._model_name)
        return self._model

    async def embed(self, text: str) -> list[float]:
        """Generate an embedding vector for a single text."""
        if not text.strip():
            raise ValueError("Cannot embed empty text")

        embeddings = await asyncio.to_thread(self._embed_sync, [text])
        return embeddings[0]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts."""
        if not texts:
            return []

        return await asyncio.to_thread(self._embed_sync, texts)

    def _embed_sync(self, texts: list[str]) -> list[list[float]]:
        """Run FastEmbed inference (synchronous, called via thread executor)."""
        model = self._get_model()
        embeddings = list(model.embed(texts))
        return [[float(x) for x in emb] for emb in embeddings]

    def build_embedding_text(self, item) -> str:
        """Build the text to embed for a media item.

        Concatenates title, overview, genres, and key people (directors + top cast).
        """
        parts = [item.title]
        if item.overview:
            parts.append(item.overview)

        if hasattr(item, "genres") and item.genres:
            genre_names = [
                mg.genre.name for mg in item.genres if mg.genre and mg.genre.name
            ]
            if genre_names:
                parts.append(" ".join(genre_names))

        if hasattr(item, "credits") and item.credits:
            people_names = [
                mc.person.name
                for mc in item.credits
                if mc.person and mc.person.name and mc.role in ("director", "cast")
            ][:10]
            if people_names:
                parts.append(" ".join(people_names))

        return " ".join(parts)
