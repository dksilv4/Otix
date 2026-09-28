"""VAPID configuration helpers for the push domain.

The public key is exposed by ``GET /api/v1/push/vapid-public-key``. The private
key signs pushes in ``apps.push.services.sender``.

Resolution order for the keypair:

1. Matching ``VAPID_PUBLIC_KEY`` / ``VAPID_PRIVATE_KEY`` environment variables
2. A previously auto-generated pair persisted under ``OTIX_DATA_DIR``
3. A freshly generated pair (persisted so restarts keep the same keys)

Browsers reject anything that is not a real uncompressed P-256 application
server key, so a string placeholder cannot be used for subscribe.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

_DEFAULT_VAPID_SUBJECT = "mailto:admin@otix.local"
_lock = threading.Lock()
_cached: tuple[str, str] | None = None


def _data_dir() -> Path:
    explicit = os.environ.get("OTIX_DATA_DIR")
    if explicit:
        path = Path(explicit)
    else:
        try:
            from django.conf import settings

            configured = getattr(settings, "OTIX_DATA_DIR", None)
            path = Path(configured) if configured else Path(settings.BASE_DIR) / "data"
        except Exception:  # noqa: BLE001 — settings may be unconfigured in isolation
            path = Path.cwd() / "data"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _keypair_path() -> Path:
    return _data_dir() / "vapid-keys.json"


def _env_keypair() -> tuple[str, str] | None:
    public = (os.environ.get("VAPID_PUBLIC_KEY") or "").strip()
    private = (os.environ.get("VAPID_PRIVATE_KEY") or "").strip()
    if public and private:
        return public, private
    return None


def _load_persisted() -> tuple[str, str] | None:
    path = _keypair_path()
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        public = (data.get("public_key") or "").strip()
        private = (data.get("private_key") or "").strip()
        if public and private:
            return public, private
    except Exception:  # noqa: BLE001 — corrupt file should fall through to regenerate
        logger.exception("failed to load VAPID keys from %s", path)
    return None


def _generate_and_persist() -> tuple[str, str]:
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid
    from py_vapid.utils import b64urlencode

    vapid = Vapid()
    vapid.generate_keys()
    public = b64urlencode(
        vapid.public_key.public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
    )
    private = b64urlencode(vapid.private_key.private_numbers().private_value.to_bytes(32, "big"))
    path = _keypair_path()
    path.write_text(json.dumps({"public_key": public, "private_key": private}, indent=2) + "\n")
    logger.info("generated VAPID keypair at %s", path)
    return public, private


def _resolved_keypair() -> tuple[str, str]:
    global _cached
    if _cached is not None:
        return _cached
    with _lock:
        if _cached is not None:
            return _cached
        pair = _env_keypair() or _load_persisted()
        if pair is None:
            pair = _generate_and_persist()
        _cached = pair
        return pair


def get_vapid_public_key() -> str:
    """Return the configured (or auto-generated) VAPID public key."""
    return _resolved_keypair()[0]


def get_vapid_private_key() -> str:
    """Return the configured (or auto-generated) VAPID private key."""
    return _resolved_keypair()[1]


def get_vapid_subject() -> str:
    """Return the VAPID ``sub`` claim (a ``mailto:`` or URL), with a dev default."""
    return os.environ.get("VAPID_SUBJECT") or _DEFAULT_VAPID_SUBJECT


def clear_vapid_cache() -> None:
    """Drop the in-process keypair cache (tests)."""
    global _cached
    with _lock:
        _cached = None
