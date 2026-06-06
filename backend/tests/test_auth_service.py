"""Tests for AuthService and TwoFactorService — register, login, 2FA, token refresh, email verification, password reset, and TOTP setups."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from datetime import date, datetime, timezone, timedelta

from jose import jwt
from otix.domain.user import User, RefreshToken, AuthActionToken, AuthActionType
from otix.infrastructure.config import settings
from otix.services.auth.auth_service import AuthService, hash_password
from otix.services.auth.two_factor_service import TwoFactorService


@pytest.fixture
def auth_service(mock_db_session: AsyncMock) -> AuthService:
    return AuthService(mock_db_session)


@pytest.fixture
def two_factor_service(mock_db_session: AsyncMock) -> TwoFactorService:
    return TwoFactorService(mock_db_session)


def _make_user(user_id: str, email: str, username: str, hashed_password: str = "hashed") -> User:
    u = User(
        email=email,
        username=username,
        hashed_password=hashed_password,
        is_admin=False,
    )
    u.id = user_id
    u.is_active = True
    return u


class TestAuthRegistration:
    async def test_register_success(self, auth_service: AuthService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None  # No existing user

        user = await auth_service.register("test@example.com", "testuser", "securepass", date(1990, 1, 1))

        assert user.email == "test@example.com"
        assert user.username == "testuser"
        assert user.hashed_password != "securepass"  # Must be hashed
        mock_db_session.add.assert_called_once_with(user)
        mock_db_session.flush.assert_awaited()

    async def test_register_email_taken(self, auth_service: AuthService, mock_db_session: AsyncMock):
        existing = _make_user("user-1", "test@example.com", "otheruser")
        mock_db_session.scalar.return_value = existing

        with pytest.raises(ValueError, match="Email already registered"):
            await auth_service.register("test@example.com", "testuser", "securepass", date(1990, 1, 1))

    async def test_register_username_taken(self, auth_service: AuthService, mock_db_session: AsyncMock):
        existing = _make_user("user-1", "other@example.com", "testuser")
        mock_db_session.scalar.return_value = existing

        with pytest.raises(ValueError, match="Username already taken"):
            await auth_service.register("test@example.com", "testuser", "securepass", date(1990, 1, 1))


class TestAuthLogin:
    @patch("otix.services.auth.auth_service.verify_password", return_value=True)
    @patch("otix.services.session_service.SessionService.create_session", new_callable=AsyncMock)
    async def test_login_success(
        self,
        mock_create_session: AsyncMock,
        mock_verify_password: MagicMock,
        auth_service: AuthService,
        mock_db_session: AsyncMock,
    ):
        user = _make_user("user-123", "test@example.com", "testuser")
        # Return user for select
        mock_db_session.scalar.return_value = user
        mock_create_session.return_value = "session-key-xyz"

        result = await auth_service.login("test@example.com", "correctpass")

        assert result is not None
        access, refresh, logged_user = result
        assert access is not None
        assert refresh is not None
        assert logged_user == user
        assert user.last_login_at is not None
        mock_db_session.add.assert_called_once()  # RefreshToken should be added

    async def test_login_user_not_found(self, auth_service: AuthService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None
        result = await auth_service.login("nonexistent@example.com", "password")
        assert result is None

    @patch("otix.services.auth.auth_service.verify_password", return_value=False)
    async def test_login_wrong_password(
        self,
        mock_verify: MagicMock,
        auth_service: AuthService,
        mock_db_session: AsyncMock,
    ):
        user = _make_user("user-123", "test@example.com", "testuser")
        mock_db_session.scalar.return_value = user

        result = await auth_service.login("test@example.com", "wrongpass")
        assert result is None

    @patch("otix.services.auth.auth_service.verify_password", return_value=True)
    async def test_login_2fa_enabled_challenge(
        self,
        mock_verify: MagicMock,
        auth_service: AuthService,
        mock_db_session: AsyncMock,
    ):
        user = _make_user("user-123", "test@example.com", "testuser")
        user.two_factor_enabled = True
        mock_db_session.scalar.return_value = user

        access, challenge, logged_user = await auth_service.login("test@example.com", "pass")
        assert access is None
        assert challenge is not None
        assert logged_user == user


class TestVerify2FALogin:
    @patch("otix.lib.totp.verify_totp", return_value=True)
    @patch("otix.services.session_service.SessionService.create_session", new_callable=AsyncMock)
    async def test_verify_2fa_success(
        self,
        mock_create_session: AsyncMock,
        mock_verify_totp: MagicMock,
        auth_service: AuthService,
        mock_db_session: AsyncMock,
    ):
        user = _make_user("user-123", "test@example.com", "testuser")
        user.two_factor_enabled = True
        user.two_factor_secret = "secret-key"
        mock_db_session.scalar.return_value = user
        mock_create_session.return_value = "session-key-xyz"

        now = datetime.now(timezone.utc)
        payload = {"sub": "user-123", "type": "2fa_challenge", "iat": now, "exp": now + timedelta(minutes=5)}
        token = jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")

        result = await auth_service.verify_2fa_login(token, "123456")
        assert result is not None
        access, refresh, logged_user = result
        assert access is not None
        assert refresh is not None
        assert logged_user == user


class TestTokenRefresh:
    @patch("otix.services.session_service.SessionService.touch_session", new_callable=AsyncMock)
    async def test_refresh_success_rotating(self, mock_touch: AsyncMock, auth_service: AuthService, mock_db_session: AsyncMock):
        user = _make_user("user-123", "test@example.com", "testuser")
        rt = RefreshToken(user_id="user-123", jti="jti-123", expires_at=datetime.now(timezone.utc) + timedelta(days=1))

        mock_db_session.scalar.side_effect = [
            rt,    # RefreshToken check
            user,  # User check
        ]

        now = datetime.now(timezone.utc)
        payload = {"sub": "user-123", "jti": "jti-123", "type": "refresh", "session_key": "sess-1", "iat": int(now.timestamp())}
        token = jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")

        # Force rotate_refresh_tokens settings
        with patch.object(settings, "rotate_refresh_tokens", True):
            result = await auth_service.refresh(token)
            assert result is not None
            access, new_refresh, refreshed_user = result
            assert access is not None
            assert new_refresh is not None
            assert refreshed_user == user
            assert rt.revoked_at is not None
            mock_touch.assert_called_once_with("sess-1")

    async def test_refresh_token_reuse_revokes_all(self, auth_service: AuthService, mock_db_session: AsyncMock):
        user = _make_user("user-123", "test@example.com", "testuser")
        # Already revoked token
        rt = RefreshToken(user_id="user-123", jti="jti-123", expires_at=datetime.now(timezone.utc) + timedelta(days=1))
        rt.revoked_at = datetime.now(timezone.utc)

        mock_db_session.scalar.return_value = rt

        # Setup execute for revoke all tokens query
        mock_result = MagicMock()
        mock_result.scalars.return_value = [rt]
        mock_db_session.execute.return_value = mock_result

        now = datetime.now(timezone.utc)
        payload = {"sub": "user-123", "jti": "jti-123", "type": "refresh", "iat": int(now.timestamp())}
        token = jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")

        result = await auth_service.refresh(token)
        assert result is None
        mock_db_session.execute.assert_called()


class TestEmailVerification:
    async def test_create_email_verification(self, auth_service: AuthService, mock_db_session: AsyncMock):
        user = _make_user("user-123", "test@example.com", "testuser")

        # mock _invalidate_existing_tokens execute
        mock_db_session.execute.return_value = MagicMock(scalars=MagicMock(return_value=[]))

        token = await auth_service.create_email_verification(user)
        assert token is not None
        mock_db_session.add.assert_called_once()  # AuthActionToken added

    async def test_verify_email_success(self, auth_service: AuthService, mock_db_session: AsyncMock):
        user = _make_user("user-123", "test@example.com", "testuser")
        user.is_verified = False
        action = AuthActionToken(user_id="user-123", purpose=AuthActionType.VERIFY_EMAIL.value, token_hash="hash-123", expires_at=datetime.now(timezone.utc) + timedelta(hours=1))

        mock_db_session.scalar.side_effect = [
            action,  # AuthActionToken
            user,    # User
        ]

        # Token mock helper
        with patch("otix.services.auth.auth_service.hash_token", return_value="hash-123"):
            res = await auth_service.verify_email("token-val")
            assert res is True
            assert user.is_verified is True
            assert action.used_at is not None


class TestPasswordReset:
    async def test_reset_password_success(self, auth_service: AuthService, mock_db_session: AsyncMock):
        user = _make_user("user-123", "test@example.com", "testuser")
        action = AuthActionToken(user_id="user-123", purpose=AuthActionType.PASSWORD_RESET.value, token_hash="hash-123", expires_at=datetime.now(timezone.utc) + timedelta(hours=1))

        mock_db_session.scalar.side_effect = [
            action,  # AuthActionToken
            user,    # User
        ]
        mock_db_session.execute.return_value = MagicMock(scalars=MagicMock(return_value=[]))

        with patch("otix.services.auth.auth_service.hash_token", return_value="hash-123"):
            res = await auth_service.reset_password("token-val", "newpassword")
            assert res is True
            assert user.hashed_password != "hashed"
            assert action.used_at is not None


class TestTwoFactorService:
    async def test_setup_2fa(self, two_factor_service: TwoFactorService, mock_db_session: AsyncMock):
        user = _make_user("user-123", "test@example.com", "testuser")

        result = await two_factor_service.setup(user)
        assert "secret" in result
        assert "provisioning_uri" in result
        assert "qr_code_svg" in result
        assert user.two_factor_secret == result["secret"]

    @patch("otix.services.auth.two_factor_service.verify_totp", return_value=True)
    async def test_enable_success(self, mock_verify: MagicMock, two_factor_service: TwoFactorService, mock_db_session: AsyncMock):
        user = _make_user("user-123", "test@example.com", "testuser")
        user.two_factor_secret = "secret-123"

        res = await two_factor_service.enable(user, "123456")
        assert res is True
        assert user.two_factor_enabled is True

    @patch("otix.services.auth.two_factor_service.verify_password", return_value=True)
    async def test_disable_success(self, mock_verify_pw: MagicMock, two_factor_service: TwoFactorService, mock_db_session: AsyncMock):
        user = _make_user("user-123", "test@example.com", "testuser")
        user.two_factor_enabled = True
        user.two_factor_secret = "secret-123"

        res = await two_factor_service.disable(user, "correctpassword")
        assert res is True
        assert user.two_factor_enabled is False
        assert user.two_factor_secret is None

    async def test_enable_no_secret(self, two_factor_service: TwoFactorService, mock_db_session: AsyncMock):
        user = _make_user("user-123", "test@example.com", "testuser")
        res = await two_factor_service.enable(user, "123456")
        assert res is False

    @patch("otix.services.auth.two_factor_service.verify_totp", return_value=False)
    async def test_enable_wrong_code(self, mock_verify: MagicMock, two_factor_service: TwoFactorService, mock_db_session: AsyncMock):
        user = _make_user("user-123", "test@example.com", "testuser")
        user.two_factor_secret = "secret-123"
        res = await two_factor_service.enable(user, "123456")
        assert res is False

    async def test_disable_not_enabled(self, two_factor_service: TwoFactorService, mock_db_session: AsyncMock):
        user = _make_user("user-123", "test@example.com", "testuser")
        res = await two_factor_service.disable(user, "password")
        assert res is False

    @patch("otix.services.auth.two_factor_service.verify_password", return_value=False)
    async def test_disable_wrong_password(self, mock_verify_pw: MagicMock, two_factor_service: TwoFactorService, mock_db_session: AsyncMock):
        user = _make_user("user-123", "test@example.com", "testuser")
        user.two_factor_enabled = True
        res = await two_factor_service.disable(user, "wrongpassword")
        assert res is False
