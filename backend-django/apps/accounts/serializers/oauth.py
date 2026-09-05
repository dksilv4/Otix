"""OAuth callback serializers (link callbacks carry ``{code, state}``)."""

from rest_framework import serializers


class OAuthCallbackSerializer(serializers.Serializer):
    """Body of a link/login callback: the IdP's code + the state we issued."""

    code = serializers.CharField(allow_blank=False)
    state = serializers.CharField(allow_blank=False)
