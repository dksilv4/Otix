FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md config.example.yaml ./
COPY otix_server/ ./otix_server/

RUN pip install --no-cache-dir .

EXPOSE 8000

ENV CONFIG_PATH="/app/config.yaml"

CMD ["python", "-m", "otix_server.main"]
