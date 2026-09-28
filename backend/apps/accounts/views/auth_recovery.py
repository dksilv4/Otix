"""Recovery + 2FA endpoints: password reset, email verify, TOTP lifecycle.

Status/shape parity with the frozen FastAPI contract. 2FA write endpoints
require a bearer access token; the TOTP *login* step is public and consumes the
stateless challenge token issued by a password login.
"""

from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response

from apps.accounts.models import PURPOSE_PASSWORD_RESET, PURPOSE_VERIFY_EMAIL
from apps.accounts.serializers.auth import (
    ForgotPasswordSerializer,
    ResetPasswordSerializer,
    TwoFactorDisableSerializer,
    TwoFactorEnableSerializer,
    TwoFactorLoginVerifySerializer,
    VerifyEmailSerializer,
)
from apps.accounts.services import sessions as session_service
from apps.accounts.services import totp
from apps.accounts.services.action_tokens import (
    ActionTokenError,
    consume_action_token,
    create_action_token,
)
from apps.accounts.services.cookies import set_refresh_cookie
from apps.accounts.services.mail import send_action_email
from apps.accounts.services.tokens import TokenError, decode_token

User = get_user_model()


def _message_response(message: str) -> Response:
    return Response({"message": message}, status=status.HTTP_200_OK)


# ── TOTP / 2FA ──────────────────────────────────────────────────────────────


class TwoFactorSetupView(GenericAPIView):
    """Generate a TOTP secret + provisioning URI + QR (does not enable yet)."""

    def post(self, request, *args, **kwargs):
        user = request.user
        if user.two_factor_enabled:
            return Response(
                {"detail": "2FA is already enabled. Disable it first to set up again."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        secret = totp.generate_secret()
        user.two_factor_secret = secret
        user.save(update_fields=("two_factor_secret",))
        uri = totp.provisioning_uri(user, secret)
        return Response(
            {"secret": secret, "provisioning_uri": uri, "qr_code_svg": totp.qr_code_svg(uri)},
            status=status.HTTP_200_OK,
        )


class TwoFactorEnableView(GenericAPIView):
    """Verify a setup code and turn 2FA on for the account."""

    serializer_class = TwoFactorEnableSerializer

    def post(self, request, *args, **kwargs):
        user = request.user
        if user.two_factor_enabled:
            return Response(
                {"detail": "2FA is already enabled"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not totp.verify_code(user.two_factor_secret, serializer.validated_data["code"]):
            return Response(
                {"detail": "Invalid verification code. Make sure you've set up 2FA first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.two_factor_enabled = True
        user.save(update_fields=("two_factor_enabled",))
        return _message_response("Two-factor authentication enabled successfully")


class TwoFactorDisableView(GenericAPIView):
    """Confirm the current password and disable 2FA (secret cleared)."""

    serializer_class = TwoFactorDisableSerializer

    def post(self, request, *args, **kwargs):
        user = request.user
        if not user.two_factor_enabled:
            return Response(
                {"detail": "2FA is not enabled"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not user.check_password(serializer.validated_data["password"]):
            return Response(
                {"detail": "Incorrect password"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.two_factor_enabled = False
        user.two_factor_secret = None
        user.save(update_fields=("two_factor_enabled", "two_factor_secret"))
        return _message_response("Two-factor authentication disabled successfully")


class TwoFactorLoginVerifyView(GenericAPIView):
    """Complete a 2FA login with the challenge token + a TOTP code."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = TwoFactorLoginVerifySerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            payload = decode_token(data["challenge_token"])
        except TokenError:
            payload = None
        if payload is None or payload.get("type") != "2fa_challenge":
            return self._invalid()
        user = User.objects.filter(pk=payload.get("sub")).first()
        if (
            user is None
            or not user.is_active
            or not user.two_factor_enabled
            or not totp.verify_code(user.two_factor_secret, data["code"])
        ):
            return self._invalid()
        access, refresh = session_service.begin_session(user, request)
        response = Response(
            {"access_token": access, "token_type": "bearer"},
            status=status.HTTP_200_OK,
        )
        set_refresh_cookie(response, refresh)
        return response

    def _invalid(self) -> Response:
        return Response(
            {"detail": "Invalid or expired challenge token or verification code"},
            status=status.HTTP_400_BAD_REQUEST,
        )


# ── Password reset ──────────────────────────────────────────────────────────


class ForgotPasswordView(GenericAPIView):
    """Request a reset link. Always 200 (no account enumeration)."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = ForgotPasswordSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower()
        user = User.objects.filter(email__iexact=email).first()
        if user is not None and user.is_active and user.email:
            try:
                raw = create_action_token(user, PURPOSE_PASSWORD_RESET)
                send_action_email(user.email, "Password Reset", "/auth/reset-password", raw)
            except Exception:
                # Mailing is fire-and-forget; never surface SMTP failure here.
                pass
        return _message_response("If the email exists, a reset link has been sent")


class ResetPasswordView(GenericAPIView):
    """Consume a reset token and set a new password (logs out all devices)."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = ResetPasswordSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            user = consume_action_token(data["token"], PURPOSE_PASSWORD_RESET)
        except ActionTokenError:
            return Response(
                {"detail": "Invalid or expired reset token"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(data["password"])
        user.save()
        session_service.logout(user)
        return _message_response("Password reset successfully")


# ── Email verification ──────────────────────────────────────────────────────


class VerifyEmailSendView(GenericAPIView):
    """(Re)send the verification email to the authenticated user."""

    def post(self, request, *args, **kwargs):
        user = request.user
        if user.is_verified:
            return Response(
                {"detail": "Email already verified"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.email:
            return Response(
                {"detail": "No email address on account to verify"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        raw = create_action_token(user, PURPOSE_VERIFY_EMAIL)
        send_action_email(user.email, "Email Verification", "/auth/verify-email", raw)
        return _message_response("Verification email sent")


class VerifyEmailView(GenericAPIView):
    """Consume a verification token and mark the email verified."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = VerifyEmailSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = consume_action_token(serializer.validated_data["token"], PURPOSE_VERIFY_EMAIL)
        except ActionTokenError:
            return Response(
                {"detail": "Invalid or expired verification token"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.is_verified = True
        user.save(update_fields=("is_verified",))
        return _message_response("Email verified successfully")
