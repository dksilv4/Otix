# TODO: Review this file
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.user import User
from otix.lib.totp import generate_qr_svg, generate_totp_secret, totp_provisioning_uri, verify_totp
from otix.services.auth.auth_service import verify_password


class TwoFactorService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def setup(self, user: User) -> dict:
        """Generate a new TOTP secret and provisioning info for *user*.

        Does NOT enable 2FA — the user must call enable() with a valid code first.
        """
        secret = generate_totp_secret()
        user.two_factor_secret = secret
        await self.session.flush()

        uri = totp_provisioning_uri(secret, user.email)
        return {
            "secret": secret,
            "provisioning_uri": uri,
            "qr_code_svg": generate_qr_svg(uri),
        }

    async def enable(self, user: User, code: str) -> bool:
        """Verify *code* against the user's pending secret and enable 2FA."""
        if not user.two_factor_secret:
            return False
        if not verify_totp(user.two_factor_secret, code):
            return False
        user.two_factor_enabled = True
        await self.session.flush()
        return True

    async def disable(self, user: User, password: str) -> bool:
        """Disable 2FA after verifying the user's password."""
        if not user.two_factor_enabled:
            return False
        if not verify_password(password, user.hashed_password):
            return False
        user.two_factor_enabled = False
        user.two_factor_secret = None
        await self.session.flush()
        return True
