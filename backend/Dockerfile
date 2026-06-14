# ── Build stage ──
FROM python:3.12-slim AS builder

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY . .
RUN pip install --no-cache-dir . \
    && pip cache purge

# ── Runtime stage ──
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /app /app

# Pre-download the ONNX embedding model so it doesn't fail at runtime.
# If this fails (e.g. no HF_TOKEN or network issues), the model will be
# downloaded lazily when embeddings are first used.
ARG HF_TOKEN
ENV HF_TOKEN=${HF_TOKEN}
ENV FASTEMBED_CACHE_PATH=/app/.fastembed_cache
RUN python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='BAAI/bge-large-en-v1.5')" || echo "Model download skipped — will download at runtime"

# TODO GPU: Set OTIX_EMBEDDING_API_URL to a GPU embedding server (Ollama/TEI)
# to use Qwen3-Embedding-8B instead of the CPU ONNX model.
# Example: OTIX_EMBEDDING_API_URL=http://ollama:11434/api/embed

EXPOSE 8000

# Run migrations then start uvicorn — prevents schema-drift issues when
# the lifespan handler's async migration call is suppressed or fails.
CMD ["bash", "entrypoints/start-api.sh"]
