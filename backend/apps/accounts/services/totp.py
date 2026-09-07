"""TOTP (2FA) helpers for the auth slice.

pyotp is used for base32 secret generation and code verification with a ±1
step window (30 s each, matching legacy). The QR code is rendered as inline SVG
via the pure-Python ``qrcode`` package (no Pillow needed).
"""

from __future__ import annotations

import io

import pyotp
import qrcode
from qrcode.image.svg import SvgPathImage

from apps.accounts.models import User

ISSUER = "Otix"
TOTP_PERIOD = 30
TOTP_WINDOW = 1


def generate_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(user: User, secret: str) -> str:
    """otpauth:// URI the user scans with their authenticator app."""
    name = user.email or user.username
    return pyotp.totp.TOTP(secret).provisioning_uri(name=name, issuer_name=ISSUER)


def verify_code(secret: str | None, code: str) -> bool:
    """Accept the current or an adjacent 30-second step."""
    if not secret:
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=TOTP_WINDOW)


def qr_code_svg(uri: str) -> str:
    """Render the provisioning URI as an inline SVG data string."""
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=1,
    )
    qr.add_data(uri)
    qr.make(fit=True)
    image = qr.make_image(image_factory=SvgPathImage)
    buffer = io.BytesIO()
    image.save(buffer)
    return buffer.getvalue().decode("utf-8")
