# TODO: Review this file
"""Pure-Python TOTP implementation (RFC 6238).

HMAC-SHA1, 6-digit codes, 30-second time step.
No external OTP library required.
"""

from __future__ import annotations

import base64
import hmac
import io
import secrets
import time
from hashlib import sha1

import qrcode
import qrcode.image.svg


def generate_totp_secret() -> str:
    """Generate a 160-bit base32-encoded TOTP secret (no padding)."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _hotp(key: bytes, counter: int, digits: int = 6) -> str:
    counter_bytes = counter.to_bytes(8, "big")
    mac = hmac.digest(key, counter_bytes, sha1)
    offset = mac[-1] & 0x0F
    binary = (mac[offset] & 0x7F) << 24
    binary |= mac[offset + 1] << 16
    binary |= mac[offset + 2] << 8
    binary |= mac[offset + 3]
    return str(binary % (10**digits)).zfill(digits)


def verify_totp(secret: str, code: str, window: int = 1) -> bool:
    """Verify a TOTP code against *secret*.

    *window* controls how many time steps before/after the current step to
    accept (default 1 = ±30s tolerance).
    """
    try:
        key = base64.b32decode(secret.upper() + "=" * (-len(secret) % 8))
    except Exception:
        return False

    if len(code) != 6 or not code.isdigit():
        return False

    counter = int(time.time() // 30)

    # Compare in constant-time
    expected = _hotp(key, counter).encode()
    provided = code.encode()
    if len(expected) != len(provided):
        return False
    result = 0
    for a, b in zip(expected, provided):
        result |= a ^ b
    if result == 0:
        return True

    # Check adjacent windows
    for offset in range(1, window + 1):
        for c in (counter - offset, counter + offset):
            candidate = _hotp(key, c).encode()
            match = 0
            for a, b in zip(candidate, provided):
                match |= a ^ b
            if match == 0:
                return True

    return False


def totp_provisioning_uri(secret: str, email: str, issuer: str = "Otix") -> str:
    """Build an otpauth:// URI for QR code generation."""
    from urllib.parse import quote

    return f"otpauth://totp/{quote(issuer)}:{quote(email)}?secret={secret}&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period=30"


def generate_qr_svg(uri: str) -> str:
    """Generate an inline SVG data URI for the given otpauth:// URI."""
    factory = qrcode.image.svg.SvgPathImage
    img = qrcode.make(uri, image_factory=factory)
    buf = io.BytesIO()
    img.save(buf)
    svg_str = buf.getvalue().decode()
    return f"data:image/svg+xml;base64,{base64.b64encode(svg_str.encode()).decode()}"
