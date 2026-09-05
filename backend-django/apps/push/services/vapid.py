"""VAPID configuration helpers for the push domain.

The public key is exposed by ``GET /api/v1/push/vapid-public-key``. The legacy
backend (``backend/otix/services/vapid.py``) reads ``VAPID_PUBLIC_KEY`` from the
environment and, when unset, auto-generates a real keypair with ``pywebpush``
and persists it to ``OTIX_DATA_DIR``. That generation path needs the
``pywebpush`` dependency and a writable key store, both deferred for the Django
rewrite; this wave only exposes the (non-secret) public half of the pair. An
unconfigured environment therefore gets a documented dev placeholder instead of
an auto-generated key.
"""

import os

# Public keys are not secret, so a static dev fallback is safe here. Production
# should set VAPID_PUBLIC_KEY so the value matches the private key that will
# sign pushes once sending is ported.
_FALLBACK_VAPID_PUBLIC_KEY = "dev-placeholder-vapid-public-key"


def get_vapid_public_key() -> str:
    """Return the configured VAPID public key, or the dev placeholder."""
    return os.environ.get("VAPID_PUBLIC_KEY") or _FALLBACK_VAPID_PUBLIC_KEY
