"""VAPID configuration helpers for the push domain.

The public key is exposed by ``GET /api/v1/push/vapid-public-key``. The legacy
backend (``backend/otix/services/vapid.py``) reads ``VAPID_PUBLIC_KEY`` from the
environment and, when unset, auto-generates a real keypair with ``pywebpush``
and persists it to ``OTIX_DATA_DIR``. This rewrite exposes both halves: the
public key (with a documented dev placeholder) and the private key/subject used
to sign pushes in ``apps.push.services.sender``. Auto-generation of an unset
keypair is still deferred — set ``VAPID_PUBLIC_KEY``/``VAPID_PRIVATE_KEY``
explicitly to enable real delivery.
"""

import os

# Public keys are not secret, so a static dev fallback is safe here. Production
# should set VAPID_PUBLIC_KEY so the value matches the private key that signs pushes.
_FALLBACK_VAPID_PUBLIC_KEY = "dev-placeholder-vapid-public-key"
_DEFAULT_VAPID_SUBJECT = "mailto:admin@otix.local"


def get_vapid_public_key() -> str:
    """Return the configured VAPID public key, or the dev placeholder."""
    return os.environ.get("VAPID_PUBLIC_KEY") or _FALLBACK_VAPID_PUBLIC_KEY


def get_vapid_private_key() -> str:
    """Return the configured VAPID private key, or ``""`` when unset.

    An empty value disables push sending (a benign no-op) — the dev default.
    """
    return os.environ.get("VAPID_PRIVATE_KEY", "")


def get_vapid_subject() -> str:
    """Return the VAPID ``sub`` claim (a ``mailto:`` or URL), with a dev default."""
    return os.environ.get("VAPID_SUBJECT") or _DEFAULT_VAPID_SUBJECT
