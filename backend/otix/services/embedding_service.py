from __future__ import annotations

import asyncio
import threading

import structlog

from otix.infrastructure.config import settings

logger = structlog.get_logger(__name__)

# BGE models use asymmetric instruction prefixes: queries get the instruction,
# documents are embedded as-is. This aligns query embeddings with the document
# embedding space for better retrieval.
_BGE_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "


class EmbeddingService:
    """Generate text embeddings for semantic search and recommendations.

    Default: FastEmbed with BGE-large-en-v1.5 running locally on CPU via ONNX.

    TODO GPU: When settings.embedding_api_url is set, POST to an Ollama/TEI
    server instead of using fastembed. Supports Qwen3-Embedding-8B and any
    OpenAI-compatible embedding API. Implementation sketch:
        - Check settings.embedding_api_url in __init__
        - If set, _embed_sync sends HTTP POST with {"model": "...", "input": texts}
        - Returns embeddings from JSON response
        - Keeps the same purpose/instruction prefix logic as the CPU path
    """

    _model: object | None = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._model_name = settings.embedding_model
        self._dimension = settings.embedding_dimension

    def _get_model(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    from fastembed import TextEmbedding

                    logger.info("loading embedding model", model=self._model_name)
                    self._model = TextEmbedding(model_name=self._model_name, dim=self._dimension)
                    logger.info("embedding model loaded", model=self._model_name)
        return self._model

    async def embed(self, text: str, purpose: str = "document") -> list[float]:
        """Generate an embedding for a single text.

        Args:
            text: The text to embed.
            purpose: "query" adds an instruction prefix for asymmetric search;
                     "document" embeds the text as-is.
        """
        if not text.strip():
            raise ValueError("Cannot embed empty text")

        embeddings = await asyncio.to_thread(self._embed_sync, [text], purpose)
        return embeddings[0]

    async def embed_batch(self, texts: list[str], purpose: str = "document") -> list[list[float]]:
        """Generate embeddings for multiple texts in a single inference call."""
        if not texts:
            return []

        return await asyncio.to_thread(self._embed_sync, texts, purpose)

    def _embed_sync(self, texts: list[str], purpose: str = "document") -> list[list[float]]:
        model = self._get_model()
        prefixed = [_apply_instruction(t, purpose) for t in texts]
        embeddings = list(model.embed(prefixed))
        return [[float(x) for x in emb] for emb in embeddings]

    def build_embedding_text(self, item) -> str:
        """Build the text to embed for a media item.

        Concatenates title, overview, genres, and key people (directors + top cast).
        With 512+ token context, includes more cast members than before.
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
            ]
            if people_names:
                parts.append(" ".join(people_names))

        return " ".join(parts)


def _apply_instruction(text: str, purpose: str) -> str:
    """Apply model-specific instruction prefix for asymmetric embedding.

    Queries get the instruction prefix so they align with the document
    embedding space. Documents are embedded as-is.
    """
    if purpose == "query":
        return _BGE_QUERY_INSTRUCTION + text
    return text


def is_embedding_stale(old_overview: str | None, new_overview: str | None) -> bool:
    """Check if the overview changed enough to warrant re-embedding.

    Returns True when the old overview's meaning is no longer substantially
    present in the new text. An expanded overview (adding detail) is fine;
    a complete rewrite is not. A typo fix or minor edit is ignored.
    """
    if old_overview == new_overview:
        return False
    if old_overview is None or new_overview is None:
        return True
    old_words = set(old_overview.lower().split())
    new_words = set(new_overview.lower().split())
    if not old_words:
        return bool(new_words)
    containment = len(old_words & new_words) / len(old_words)
    return containment < 0.7
