"""Request/response serializers for the real-auth slice.

These are hand-rolled plain serializers (not ModelSerializers): auth payloads
are narrow wire contracts, not model views, and the write paths delegate to
services. Response bodies keep the exact field names the legacy FastAPI
contract exposes so client parsing is unchanged.
"""

from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    identity = serializers.CharField(max_length=255, trim_whitespace=False)
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class TwoFactorCodeField(serializers.CharField):
    def __init__(self, **kwargs):
        kwargs.setdefault("max_length", 6)
        kwargs.setdefault("min_length", 6)
        kwargs.setdefault("trim_whitespace", False)
        super().__init__(**kwargs)


class TwoFactorEnableSerializer(serializers.Serializer):
    code = TwoFactorCodeField()


class TwoFactorDisableSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class TwoFactorLoginVerifySerializer(serializers.Serializer):
    challenge_token = serializers.CharField(trim_whitespace=False)
    code = TwoFactorCodeField()


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField(trim_whitespace=False)
    password = serializers.CharField(min_length=8, max_length=128)


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField(trim_whitespace=False)


class SessionSerializer(serializers.Serializer):
    session_key = serializers.CharField()
    ip_address = serializers.CharField(allow_null=True)
    user_agent = serializers.CharField()
    last_seen_at = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField()
