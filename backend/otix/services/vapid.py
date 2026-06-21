from __future__ import annotations

import json
import os
from pathlib import Path

from pywebpush import _VapidUtil  # noqa: PLC2701 — private but stable for key generation


def _ensure_vapid_keys() -> tuple[str, str]:
    private = os.environ.get("VAPID_PRIVATE_KEY")
    public = os.environ.get("VAPID_PUBLIC_KEY")

    if private and public:
        return private, public

    # Auto-generate on first boot
    keys = _VapidUtil.generate_vapid_keys()
    private = keys["private_key"]
    public = keys["public_key"]

    # Persist to user data dir for restart survival
    data_dir = os.environ.get("OTIX_DATA_DIR", "/var/lib/otix")
    key_file = Path(data_dir) / "vapid.json"
    key_file.parent.mkdir(parents=True, exist_ok=True)
    if not key_file.exists():
        key_file.write_text(json.dumps({"private_key": private, "public_key": public}))

    return private, public


vapid_private_key, vapid_public_key = _ensure_vapid_keys()


def get_vapid_public_key() -> str:
    return vapid_public_key
