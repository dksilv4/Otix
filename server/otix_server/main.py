from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

import uvicorn

from otix_server.api import app
from otix_server.config import load_config

def cli():
    parser = argparse.ArgumentParser(description="Otix Standalone Game & Save Server")
    parser.add_argument("action", nargs="?", default="start", choices=["start", "scan", "help"])
    parser.add_argument("--config", "-c", default="config.yaml", help="Path to config.yaml file")
    parser.add_argument("--reload", action="store_true", default=False, help="Enable auto-reload")
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

    should_reload = args.reload or os.getenv("ENABLE_RELOAD", "false").lower() in ("true", "1", "yes")

    print("=" * 60)
    try:
        print(f"🚀 Launching Otix Game & Save Server: '{config.server.name}'")
    except UnicodeEncodeError:
        print(f"[Otix] Launching Otix Game & Save Server: '{config.server.name}'")
    print(f"   Listening on: http://{config.server.host}:{config.server.port}")
    print(f"   Config Path: {args.config}")
    print(f"   Auth Token: {'Configured' if config.server.auth_token else 'None'}")
    print(f"   Auto Reload: {'Enabled' if should_reload else 'Disabled'}")
    print("=" * 60)

    if should_reload:
        uvicorn.run(
            "otix_server.api:app",
            host=config.server.host,
            port=config.server.port,
            reload=True,
            reload_dirs=[str(Path(__file__).parent)],
            log_level="info",
        )
    else:
        uvicorn.run(
            app,
            host=config.server.host,
            port=config.server.port,
            log_level="info",
        )


if __name__ == "__main__":
    cli()
