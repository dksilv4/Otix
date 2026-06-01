FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN pip install --no-cache-dir httpx structlog

COPY bots/ /app/bots/

RUN mkdir -p /app/logs

ENV PYTHONPATH=/app \
    BOT_API_BASE_URL=http://api:8000/api \
    BOT_COUNT=1000 \
    BOT_DELAY_MIN=3 \
    BOT_DELAY_MAX=15 \
    BOT_STARTUP_STAGGER=30 \
    BOT_HTTP_POOL_LIMIT=300 \
    BOT_HTTP_POOL_PER_HOST=200 \
    BOT_LOG_DIR=/app/logs \
    BOT_LOG_LEVEL=INFO

CMD ["python", "-m", "bots.runner"]
