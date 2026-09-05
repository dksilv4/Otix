"""Google / Google-Drive OAuth link endpoints.

Status/shape parity with the frozen FastAPI contract. All routes mount under
``/api/v1/auth/oauth/``:

- link initiate (authed) -> 200 ``{auth_url, state}``, 503 when unconfigured;
- link callback (unauthed; user resolved from state) -> 200 ``{message}``;
- disconnect (authed) -> 200 ``{message}``, 400 when never linked;
- ``google/token`` (authed) -> 200 ``{access_token}``, 404 when unlinked/expired.
"""

from rest_framework import permissions, status
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response

from apps.accounts.serializers.oauth import OAuthCallbackSerializer
from apps.accounts.services import oauth as oauth_service
from apps.accounts.services.oauth import OAuthFlowError


class GoogleLinkInitiateView(GenericAPIView):
    """POST /oauth/google — start the google (youtube-identity) link flow."""

    def post(self, request, *args, **kwargs):
        try:
            auth_url, state = oauth_service.build_google_link_url(request.user.pk)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response({"auth_url": auth_url, "state": state}, status=status.HTTP_200_OK)


class GoogleLinkCallbackView(GenericAPIView):
    """POST /oauth/google/callback — exchange the code and bind Google."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = OAuthCallbackSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]
        state = serializer.validated_data["state"]
        try:
            oauth_service.link_google_to_user(request.user, code, state)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        except Exception:  # noqa: BLE001 - surface a stable detail on unexpected failures
            oauth_service.logger.exception("google link callback failed")
            return Response(
                {"detail": "Failed to link Google account. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(
            {"message": "Google account linked successfully"}, status=status.HTTP_200_OK
        )


class GoogleLinkTokenView(GenericAPIView):
    """GET /oauth/google/token — return a usable google access token."""

    def get(self, request, *args, **kwargs):
        access_token = oauth_service.get_user_google_access_token(request.user)
        if access_token is None:
            return Response(
                {"detail": "Google account is not linked or token has expired."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"access_token": access_token}, status=status.HTTP_200_OK)


class GoogleDisconnectView(GenericAPIView):
    """DELETE /oauth/google/disconnect — unlink google from the user."""

    def delete(self, request, *args, **kwargs):
        try:
            oauth_service.unlink_google_from_user(request.user)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response(
            {"message": "Google account unlinked successfully"}, status=status.HTTP_200_OK
        )


class GoogleDriveLinkInitiateView(GenericAPIView):
    """POST /oauth/google-drive — start the google-drive (drive.file) link flow."""

    def post(self, request, *args, **kwargs):
        try:
            auth_url, state = oauth_service.build_google_drive_link_url(request.user.pk)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response({"auth_url": auth_url, "state": state}, status=status.HTTP_200_OK)


class GoogleDriveLinkCallbackView(GenericAPIView):
    """POST /oauth/google-drive/callback — exchange the code and bind Drive."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = OAuthCallbackSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]
        state = serializer.validated_data["state"]
        try:
            oauth_service.link_google_drive_to_user(request.user, code, state)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        except Exception:  # noqa: BLE001 - surface a stable detail on unexpected failures
            oauth_service.logger.exception("google-drive link callback failed")
            return Response(
                {"detail": "Failed to link Google Drive. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(
            {"message": "Google Drive linked successfully"}, status=status.HTTP_200_OK
        )


class GoogleDriveDisconnectView(GenericAPIView):
    """DELETE /oauth/google-drive/disconnect — unlink drive from the user."""

    def delete(self, request, *args, **kwargs):
        try:
            oauth_service.unlink_google_drive_from_user(request.user)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response(
            {"message": "Google Drive account unlinked successfully"},
            status=status.HTTP_200_OK,
        )
