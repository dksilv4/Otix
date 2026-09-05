"""Google / Google-Drive / Plex OAuth link + Plex login endpoints.

Status/shape parity with the frozen FastAPI contract. Routes mount under
``/api/v1/auth/``:

- link initiate (authed) -> 200 ``{auth_url, state, [pin_id]}``, 503 when
  unconfigured (google), 400 when the provider is already linked (plex);
- link callback (unauthed; user resolved from state) -> 200 ``{message}``;
- disconnect (authed) -> 200 ``{message}``, 400 when never linked;
- ``google/token`` (authed) -> 200 ``{access_token}``, 404 when unlinked/expired;
- ``plex/initiate`` + ``plex/callback`` (both unauthed) -> Plex login family.
"""

from rest_framework import permissions, status
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response

from apps.accounts.serializers.oauth import (
    OAuthCallbackSerializer,
    PlexLinkCallbackSerializer,
)
from apps.accounts.services import oauth as oauth_service
from apps.accounts.services import sessions as session_service
from apps.accounts.services.cookies import set_refresh_cookie
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


class PlexLinkInitiateView(GenericAPIView):
    """POST /oauth/plex — start the Plex PIN link flow."""

    def post(self, request, *args, **kwargs):
        if request.user.plex_id:
            return Response(
                {"detail": "Plex account already linked"}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            auth_url, state, pin_id = oauth_service.build_plex_link_url(request.user.pk)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response(
            {"auth_url": auth_url, "state": state, "pin_id": pin_id},
            status=status.HTTP_200_OK,
        )


class PlexLinkCallbackView(GenericAPIView):
    """POST /oauth/plex/callback — bind the approved Plex account."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = PlexLinkCallbackSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        state = serializer.validated_data["state"]
        pin_id = serializer.validated_data.get("pin_id") or None
        try:
            oauth_service.link_plex_to_user(request.user, state, pin_id)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        except Exception:  # noqa: BLE001 - surface a stable detail on unexpected failures
            oauth_service.logger.exception("plex link callback failed")
            return Response(
                {"detail": "Failed to link Plex account. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(
            {"message": "Plex account linked successfully"}, status=status.HTTP_200_OK
        )


class PlexDisconnectView(GenericAPIView):
    """DELETE /oauth/plex/disconnect — unlink plex from the user."""

    def delete(self, request, *args, **kwargs):
        try:
            oauth_service.unlink_plex_from_user(request.user)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response(
            {"message": "Plex account unlinked successfully"}, status=status.HTTP_200_OK
        )


class PlexLoginInitiateView(GenericAPIView):
    """POST /plex/initiate — start the Plex PIN login flow (no auth)."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        try:
            auth_url, state, pin_id = oauth_service.build_plex_login_url()
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        except Exception:  # noqa: BLE001 - surface a stable detail on unexpected failures
            oauth_service.logger.exception("plex login initiate failed")
            return Response(
                {"detail": "Failed to start Plex login. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(
            {"auth_url": auth_url, "state": state, "pin_id": pin_id},
            status=status.HTTP_200_OK,
        )


class PlexLoginCallbackView(GenericAPIView):
    """POST /plex/callback — resolve/create the Plex user and start a session."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        state = request.data.get("state")
        pin_id = request.data.get("pinId") or request.data.get("pin_id")
        if not state:
            return Response(
                {"detail": "Missing state parameter."}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            user = oauth_service.authenticate_plex(state, pin_id)
            access, refresh = session_service.begin_session(user, request)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        except Exception:  # noqa: BLE001 - surface a stable detail on unexpected failures
            oauth_service.logger.exception("plex login callback failed")
            return Response(
                {"detail": "Failed to sign in with Plex. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        response = Response(
            {"access_token": access, "token_type": "bearer"}, status=status.HTTP_200_OK
        )
        set_refresh_cookie(response, refresh)
        return response
