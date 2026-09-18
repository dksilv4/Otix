"""OAuth link + login families and the oauth aggregate reads.

Status/shape parity with the frozen FastAPI contract. Routes mount under
``/api/v1/auth/``:

- link initiate (authed) -> 200 ``{auth_url, state, [pin_id]}``, 503 when
  unconfigured (google), 400 when the provider is already linked (plex);
- link callback (unauthed; user resolved from state) -> 200 ``{message}``;
- disconnect (authed) -> 200 ``{message}``, 400 when never linked;
- ``google/token`` (authed) -> 200 ``{access_token}``, 404 when unlinked/expired;
- ``plex/initiate`` + ``plex/callback`` (both unauthed) -> Plex login family;
- ``google/initiate`` + ``google/callback`` (both unauthed) -> Google login family;
- ``steam`` link + login families (OpenID, both callbacks unauthed) -> Steam;
- ``tmdb`` connect + login families (request_token dance; ``oauth/tmdb/redirect``
  is a server 303 hop back to the frontend) -> TMDb;
- ``GET /oauth`` (authed) -> five-provider aggregate; ``GET /me/integrations``
  (authed) -> linked-identity columns.
"""

import urllib.parse

from django.http import HttpResponseRedirect
from django.urls import reverse
from rest_framework import permissions, status
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response

from apps.accounts.serializers.oauth import (
    OAuthCallbackSerializer,
    PlexLinkCallbackSerializer,
    SteamCallbackSerializer,
    TMDbLinkCallbackSerializer,
)
from apps.accounts.services import oauth as oauth_service
from apps.accounts.services import sessions as session_service
from apps.accounts.services.cookies import set_refresh_cookie
from apps.accounts.services.oauth import OAuthFlowError
from apps.library.services.game_server import (
    NO_EPIC_NODE,
    pick_online_game_server,
    proxy_epic_auth,
    proxy_epic_disconnect,
)


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
        return Response({"message": "Google Drive linked successfully"}, status=status.HTTP_200_OK)


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
        return Response({"message": "Plex account linked successfully"}, status=status.HTTP_200_OK)


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


class GoogleLoginInitiateView(GenericAPIView):
    """POST /google/initiate — start the google login flow (no auth)."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        try:
            auth_url, state = oauth_service.build_google_login_url()
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response({"auth_url": auth_url, "state": state}, status=status.HTTP_200_OK)


class GoogleLoginCallbackView(GenericAPIView):
    """POST /google/callback — resolve/create the Google user and start a session."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = OAuthCallbackSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]
        state = serializer.validated_data["state"]
        try:
            user = oauth_service.authenticate_google_login(code, state)
            access, refresh = session_service.begin_session(user, request)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        except Exception:  # noqa: BLE001 - surface a stable detail on unexpected failures
            oauth_service.logger.exception("google login callback failed")
            return Response(
                {"detail": "Failed to sign in with Google. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        response = Response(
            {"access_token": access, "token_type": "bearer"}, status=status.HTTP_200_OK
        )
        set_refresh_cookie(response, refresh)
        return response


class SteamLinkInitiateView(GenericAPIView):
    """POST /oauth/steam — start the Steam OpenID link flow."""

    def post(self, request, *args, **kwargs):
        if request.user.steam_id:
            return Response(
                {"detail": "Steam account already linked"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        source = request.data.get("source") if request.data else None
        try:
            auth_url, state = oauth_service.build_steam_link_url(source, user_id=request.user.pk)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response({"auth_url": auth_url, "state": state}, status=status.HTTP_200_OK)


class SteamLinkCallbackView(GenericAPIView):
    """POST /oauth/steam/callback — replay OpenID and bind the Steam id."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = SteamCallbackSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        params = serializer.validated_data["params"]
        raw_query = serializer.validated_data["raw_query"]
        try:
            steam_id, state_user_id = oauth_service.validate_steam_link_callback(params, raw_query)
            oauth_service.link_steam_to_user(request.user, steam_id, state_user_id)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response({"message": "Steam account linked successfully"}, status=status.HTTP_200_OK)


class SteamDisconnectView(GenericAPIView):
    """DELETE /oauth/steam/disconnect — unlink steam from the user."""

    def delete(self, request, *args, **kwargs):
        try:
            oauth_service.unlink_steam_from_user(request.user)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response(
            {"message": "Steam account unlinked successfully"}, status=status.HTTP_200_OK
        )


class SteamLoginInitiateView(GenericAPIView):
    """POST /steam/initiate — start the Steam OpenID login flow (no auth)."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        source = request.data.get("source") if request.data else None
        try:
            auth_url, state = oauth_service.build_steam_login_url(source)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response({"auth_url": auth_url, "state": state}, status=status.HTTP_200_OK)


class SteamLoginCallbackView(GenericAPIView):
    """POST /steam/callback — resolve/create the Steam user and start a session."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = SteamCallbackSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        params = serializer.validated_data["params"]
        raw_query = serializer.validated_data["raw_query"]
        try:
            user = oauth_service.authenticate_steam(params, raw_query)
            access, refresh = session_service.begin_session(user, request)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        response = Response(
            {"access_token": access, "token_type": "bearer"}, status=status.HTTP_200_OK
        )
        set_refresh_cookie(response, refresh)
        return response


class TMDbLinkInitiateView(GenericAPIView):
    """POST /oauth/tmdb — start the TMDb connect (link) flow."""

    def post(self, request, *args, **kwargs):
        if request.user.tmdb_session_id:
            return Response(
                {"detail": "TMDb account already linked"}, status=status.HTTP_400_BAD_REQUEST
            )
        redirect_url = request.build_absolute_uri(reverse("accounts:oauth-tmdb-redirect"))
        try:
            auth_url, state = oauth_service.build_tmdb_link_url(request.user.pk, redirect_url)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response({"auth_url": auth_url, "state": state}, status=status.HTTP_200_OK)


class TMDbLinkRedirectView(GenericAPIView):
    """GET /oauth/tmdb/redirect — TMDb -> server -> frontend 303 hop (link)."""

    permission_classes = (permissions.AllowAny,)

    def _redirect(self, status_value: str, message: str | None = None) -> HttpResponseRedirect:
        query = {"tmdb_link": status_value}
        if message:
            query["message"] = message
        target = f"{oauth_service.frontend_base()}/?{urllib.parse.urlencode(query)}"
        return HttpResponseRedirect(target, status=303)

    def get(self, request, *args, **kwargs):
        approved = request.query_params.get("approved")
        state = request.query_params.get("state") or ""
        request_token = request.query_params.get("request_token")
        if approved == "false":
            return self._redirect("error", "TMDb authorization was cancelled.")
        if not state and not request_token:
            return self._redirect(
                "error", "TMDb did not return the expected authorization details."
            )
        try:
            oauth_service.link_tmdb_state_to_user(state, request_token)
        except Exception:  # noqa: BLE001 - the hop always bounces back to the frontend
            oauth_service.logger.exception("tmdb redirect link failed")
            return self._redirect("error", "Failed to link TMDb account. Please try again.")
        return self._redirect("success")


class TMDbLinkCallbackView(GenericAPIView):
    """POST /oauth/tmdb/callback — bind the approved TMDb session."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = TMDbLinkCallbackSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        state = serializer.validated_data["state"]
        request_token = serializer.validated_data["request_token"]
        try:
            if request.user.is_authenticated:
                oauth_service.link_tmdb_to_user(request.user, state, request_token)
            else:
                oauth_service.link_tmdb_state_to_user(state, request_token)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        except Exception:  # noqa: BLE001 - surface a stable detail on unexpected failures
            oauth_service.logger.exception("tmdb link callback failed")
            return Response(
                {"detail": "Failed to link TMDb account. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response({"message": "TMDb account linked successfully"}, status=status.HTTP_200_OK)


class TMDbDisconnectView(GenericAPIView):
    """DELETE /oauth/tmdb/disconnect — unlink tmdb from the user."""

    def delete(self, request, *args, **kwargs):
        try:
            oauth_service.unlink_tmdb_from_user(request.user)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response(
            {"message": "TMDb account unlinked successfully"}, status=status.HTTP_200_OK
        )


class TMDbLoginInitiateView(GenericAPIView):
    """POST /tmdb/initiate — start the TMDb login flow (no auth)."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        try:
            auth_url, state = oauth_service.build_tmdb_login_url()
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        except Exception:  # noqa: BLE001 - surface a stable detail on unexpected failures
            oauth_service.logger.exception("tmdb login initiate failed")
            return Response(
                {"detail": "Failed to start TMDb login. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response({"auth_url": auth_url, "state": state}, status=status.HTTP_200_OK)


class TMDbLoginCallbackView(GenericAPIView):
    """POST /tmdb/callback — resolve/create the TMDb user and start a session."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        state = request.data.get("state")
        request_token = request.data.get("request_token")
        if not state and not request_token:
            return Response(
                {"detail": "Missing state or request_token parameter."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user = oauth_service.authenticate_tmdb_login(state, request_token)
            access, refresh = session_service.begin_session(user, request)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        except Exception:  # noqa: BLE001 - surface a stable detail on unexpected failures
            oauth_service.logger.exception("tmdb login callback failed")
            return Response(
                {"detail": "Failed to sign in with TMDb. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        response = Response(
            {"access_token": access, "token_type": "bearer"}, status=status.HTTP_200_OK
        )
        set_refresh_cookie(response, refresh)
        return response


class EpicLinkInitiateView(GenericAPIView):
    """POST /oauth/epic — start the Epic link flow via the user's Otix Server."""

    def post(self, request, *args, **kwargs):
        if pick_online_game_server(request.user) is None:
            return Response({"detail": NO_EPIC_NODE}, status=status.HTTP_400_BAD_REQUEST)
        auth_url, state = oauth_service.build_epic_link_url(user_id=request.user.pk)
        return Response({"auth_url": auth_url, "state": state}, status=status.HTTP_200_OK)


class EpicLinkCallbackView(GenericAPIView):
    """POST /oauth/epic/callback — proxy the authorization code to the node."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = OAuthCallbackSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]
        state = serializer.validated_data["state"]
        payload = oauth_service.consume_epic_link_state(state, user_id=request.user.pk)
        if payload is None:
            return Response(
                {"detail": "Epic linking session expired. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        server = pick_online_game_server(request.user)
        if server is None:
            return Response({"detail": NO_EPIC_NODE}, status=status.HTTP_400_BAD_REQUEST)
        status_code, data = proxy_epic_auth(server, code)
        if isinstance(data, dict):
            data.pop("refresh_token", None)
        return Response(data, status=status_code)


class EpicDisconnectView(GenericAPIView):
    """DELETE /oauth/epic/disconnect — unlink Epic on the user's Otix Server."""

    def delete(self, request, *args, **kwargs):
        server = pick_online_game_server(request.user)
        if server is None:
            return Response({"detail": NO_EPIC_NODE}, status=status.HTTP_400_BAD_REQUEST)
        proxy_epic_disconnect(server)
        return Response(
            {"message": "Epic account unlinked successfully"}, status=status.HTTP_200_OK
        )


class OAuthProvidersView(GenericAPIView):
    """GET /oauth — five-provider linked-OAuth aggregate status."""

    def get(self, request, *args, **kwargs):
        return Response(
            {"providers": oauth_service.oauth_providers_payload(request.user)},
            status=status.HTTP_200_OK,
        )


class MeIntegrationsView(GenericAPIView):
    """GET /me/integrations — the current user's linked provider columns."""

    def get(self, request, *args, **kwargs):
        return Response(
            oauth_service.user_integrations_payload(request.user),
            status=status.HTTP_200_OK,
        )
