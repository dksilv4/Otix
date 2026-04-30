"""Celery worker entry point.

Start a worker that consumes from a specific set of queues.

Usage:
    OTIX_WORKER_TYPE=fast  celery -A otix.infrastructure.celery.app worker -Q tmdb,steam -c 6
    OTIX_WORKER_TYPE=slow  celery -A otix.infrastructure.celery.app worker -Q igdb,fanart,control,default -c 2
    OTIX_WORKER_TYPE=ccu   celery -A otix.infrastructure.celery.app worker -Q steam_ccu -c 1

Or via the CLI:
    python -m cmd.worker.main --worker-type fast
"""

from __future__ import annotations

import argparse
import sys

from otix.infrastructure.celery import app
from otix.infrastructure.config import settings
from otix.infrastructure.logging import setup_logging


def main() -> None:
    setup_logging()

    parser = argparse.ArgumentParser(description="Otix Celery worker")
    parser.add_argument(
        "--worker-type",
        choices=["fast", "slow", "ccu"],
        default=None,
        help="Worker type (fast, slow, ccu). Auto-detected from OTIX_WORKER_TYPE env if not set.",
    )
    parser.add_argument(
        "--queues",
        default=None,
        help="Comma-separated queue names (overrides worker-type defaults)",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=None,
        help="Worker concurrency (overrides defaults)",
    )
    args = parser.parse_args()

    # Determine worker type
    import os

    worker_type = args.worker_type or os.environ.get("OTIX_WORKER_TYPE", "fast")

    # Resolve queues and concurrency
    if args.queues:
        queues = args.queues
        concurrency = args.concurrency or 4
    elif worker_type == "fast":
        queues = "tmdb,steam"
        concurrency = args.concurrency or settings.celery_worker_fast_concurrency
    elif worker_type == "slow":
        queues = "igdb,fanart,control,default"
        concurrency = args.concurrency or settings.celery_worker_slow_concurrency
    elif worker_type == "ccu":
        queues = "steam_ccu"
        concurrency = args.concurrency or settings.celery_worker_ccu_concurrency
    else:
        queues = "default"
        concurrency = 1

    # Launch the worker
    argv = [
        "worker",
        "-Q",
        queues,
        "-c",
        str(concurrency),
        "-n",
        f"otix-{worker_type}@%h",
        "--loglevel",
        "INFO",
    ]
    sys.argv = ["celery"] + argv
    app.start()


if __name__ == "__main__":
    main()
