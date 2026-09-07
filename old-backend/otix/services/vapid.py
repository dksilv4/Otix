from __future__ import annotations

import json
import os
from pathlib import Path

from pywebpush import Vapid01


def _ensure_vapid_keys() -> tuple[str, str]:
    private = os.environ.get("VAPID_PRIVATE_KEY")
    public = os.environ.get("VAPID_PUBLIC_KEY")

    if private and public:
        return private, public

    # Check persisted file before generating new keys
    data_dir = os.environ.get("OTIX_DATA_DIR", "/var/lib/otix")
    key_file = Path(data_dir) / "vapid.json"
    key_file.parent.mkdir(parents=True, exist_ok=True)

    if key_file.exists():
        saved = json.loads(key_file.read_text())
        return saved["private_key"], saved["public_key"]

    # Auto-generate on first boot using public API
    v = Vapid01()
    v.generate_keys()
    private = v.private_pem().decode()
    public = v.public_pem().decode()
    key_file.write_text(json.dumps({"private_key": private, "public_key": public}))

    return private, public


vapid_private_key, vapid_public_key = _ensure_vapid_keys()


def get_vapid_public_key() -> str:
    return vapid_public_key
