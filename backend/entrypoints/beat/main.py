"""Celery beat scheduler entry point.

Usage:
    celery -A otix.infrastructure.celery.app beat --loglevel INFO
"""

from __future__ import annotations

import sys

from otix.infrastructure.celery import app
from otix.infrastructure.logging import setup_logging


def main() -> None:
    setup_logging()
    sys.argv = ["celery", "beat", "--loglevel", "INFO"]
    app.start()


if __name__ == "__main__":
    main()
