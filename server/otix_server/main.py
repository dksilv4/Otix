from __future__ import annotations

import argparse
import asyncio
import os
from pathlib import Path
import sys

import uvicorn

from otix_server.api import app
from otix_server.config import load_config
from otix_server.heartbeat import announce_heartbeat


def cli():
    parser = argparse.ArgumentParser(description="Otix Standalone Game & Save Server")
    parser.add_argument("action", nargs="?", default="start", choices=["start", "scan", "help"])
    parser.add_argument("--config", "-c", default="config.yaml", help="Path to config.yaml file")
    args = parser.parse_args()

    os.environ["CONFIG_PATH"] = str(Path(args.config).resolve())

    config = load_config(args.config)

    if args.action == "scan":
        from otix_server.indexer import StorageIndexer
        indexer = StorageIndexer([lib.model_dump() for lib in config.game_libraries])
        files = indexer.scan_all()
        print(f"[Scan] Found {len(files)} installer files across {len(config.game_libraries)} libraries:")
        for f in files:
            print(f"  - [{f.library_name}] {f.filename} ({f.filesize / 1024 / 1024:.1f} MB)")
        sys.exit(0)

    print("=" * 60)
    print(f"🚀 Launching Otix Game & Save Server: '{config.server.name}'")
    print(f"   Listening on: http://{config.server.host}:{config.server.port}")
    print(f"   Config Path: {args.config}")
    print(f"   Auth Token: {'Configured' if config.server.auth_token else 'None'}")
    print("=" * 60)

    # Start background heartbeat if enabled
    if config.server.enable_heartbeat:
        try:
            loop = asyncio.get_event_loop()
            loop.create_task(announce_heartbeat(config))
        except Exception:
            pass

    uvicorn.run(
        app,
        host=config.server.host,
        port=config.server.port,
        log_level="info",
    )


if __name__ == "__main__":
    cli()
