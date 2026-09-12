"""OAuth callback serializers (link callbacks carry ``{code, state}``)."""

from rest_framework import serializers


class OAuthCallbackSerializer(serializers.Serializer):
    """Body of a link/login callback: the IdP's code + the state we issued."""

    code = serializers.CharField(allow_blank=False)
    state = serializers.CharField(allow_blank=False)


class PlexLinkCallbackSerializer(serializers.Serializer):
    """Body of the Plex link callback: the state we issued + the PIN id."""

    state = serializers.CharField(allow_blank=False)
    pin_id = serializers.CharField(allow_blank=True, required=False, default="")


class SteamCallbackSerializer(serializers.Serializer):
    """Steam OpenID callback: the query params + the verbatim raw query string."""

    params = serializers.DictField(required=False, default=dict)
    raw_query = serializers.CharField(
        allow_blank=True, allow_null=True, required=False, default=None
    )


class TMDbLinkCallbackSerializer(serializers.Serializer):
    """Body of the TMDb connect callback: the state we issued + the request token."""

    state = serializers.CharField(allow_blank=False)
    request_token = serializers.CharField(allow_blank=False)
