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
from apps.library.models import UserGameServer
from apps.library.services.game_server import (
    pick_online_game_server,
    proxy_epic_auth,
    proxy_epic_disconnect,
    proxy_gog_auth,
    proxy_gog_disconnect,
)


class GoogleLinkInitiateView(GenericAPIView):
    """POST /oauth/google — start the google (youtube-identity) link flow."""

    def post(self, request, *args, **kwargs):
        source = request.data.get("source") if request.data else None
        try:
            auth_url, state = oauth_service.build_google_link_url(request.user.pk, source=source)
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
            source = oauth_service.link_google_to_user(request.user, code, state)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        except Exception:  # noqa: BLE001 - surface a stable detail on unexpected failures
            oauth_service.logger.exception("google link callback failed")
            return Response(
                {"detail": "Failed to link Google account. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        resp_data = {"message": "Google account linked successfully"}
        if source:
            resp_data["source"] = source
        return Response(resp_data, status=status.HTTP_200_OK)


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
        source = request.data.get("source") if request.data else None
        try:
            auth_url, state = oauth_service.build_google_drive_link_url(request.user.pk, source=source)
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
            source = oauth_service.link_google_drive_to_user(request.user, code, state)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        except Exception:  # noqa: BLE001 - surface a stable detail on unexpected failures
            oauth_service.logger.exception("google-drive link callback failed")
            return Response(
                {"detail": "Failed to link Google Drive. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        resp_data = {"message": "Google Drive linked successfully"}
        if source:
            resp_data["source"] = source
        return Response(resp_data, status=status.HTTP_200_OK)


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
        source = request.data.get("source") if request.data else None
        try:
            auth_url, state, pin_id = oauth_service.build_plex_link_url(request.user.pk, source=source)
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
            source = oauth_service.link_plex_to_user(request.user, state, pin_id)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        except Exception:  # noqa: BLE001 - surface a stable detail on unexpected failures
            oauth_service.logger.exception("plex link callback failed")
            return Response(
                {"detail": "Failed to link Plex account. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        resp_data = {"message": "Plex account linked successfully"}
        if source:
            resp_data["source"] = source
        return Response(resp_data, status=status.HTTP_200_OK)


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
        source = request.data.get("source") if request.data else None
        try:
            auth_url, state, pin_id = oauth_service.build_plex_login_url(source=source)
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
        resp_data = {"access_token": access, "token_type": "bearer"}
        oauth_source = getattr(user, "_oauth_source", None)
        if oauth_source:
            resp_data["source"] = oauth_source
        response = Response(resp_data, status=status.HTTP_200_OK)
        set_refresh_cookie(response, refresh)
        return response


class GoogleLoginInitiateView(GenericAPIView):
    """POST /google/initiate — start the google login flow (no auth)."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        source = request.data.get("source") if request.data else None
        try:
            auth_url, state = oauth_service.build_google_login_url(source=source)
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
        resp_data = {"access_token": access, "token_type": "bearer"}
        oauth_source = getattr(user, "_oauth_source", None)
        if oauth_source:
            resp_data["source"] = oauth_source
        response = Response(resp_data, status=status.HTTP_200_OK)
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
        resp_data = {"access_token": access, "token_type": "bearer"}
        oauth_source = getattr(user, "_oauth_source", None)
        if oauth_source:
            resp_data["source"] = oauth_source
        response = Response(resp_data, status=status.HTTP_200_OK)
        set_refresh_cookie(response, refresh)
        return response


class TMDbLinkInitiateView(GenericAPIView):
    """POST /oauth/tmdb — start the TMDb connect (link) flow."""

    def post(self, request, *args, **kwargs):
        if request.user.tmdb_session_id:
            return Response(
                {"detail": "TMDb account already linked"}, status=status.HTTP_400_BAD_REQUEST
            )
        source = request.data.get("source") if request.data else None
        frontend_base = oauth_service.frontend_base()
        redirect_path = reverse("accounts:oauth-tmdb-redirect")
        redirect_url = (
            f"{frontend_base}{redirect_path}"
            if frontend_base
            else request.build_absolute_uri(redirect_path)
        )
        try:
            auth_url, state = oauth_service.build_tmdb_link_url(request.user.pk, redirect_url, source=source)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response({"auth_url": auth_url, "state": state}, status=status.HTTP_200_OK)


class TMDbLinkRedirectView(GenericAPIView):
    """GET /oauth/tmdb/redirect — TMDb -> server -> frontend 303 hop (link)."""

    permission_classes = (permissions.AllowAny,)

    def _redirect(self, status_value: str, message: str | None = None, source: str | None = None) -> HttpResponseRedirect:
        query = {"tmdb_link": status_value}
        if message:
            query["message"] = message
        if source:
            query["source"] = source
        target = f"{oauth_service.frontend_base()}/auth/callback/tmdb?{urllib.parse.urlencode(query)}"
        return HttpResponseRedirect(target, status=303)

    def get(self, request, *args, **kwargs):
        approved = request.query_params.get("approved")
        state = request.query_params.get("state") or ""
        request_token = request.query_params.get("request_token")
        source = request.query_params.get("source")
        if approved == "false":
            return self._redirect("error", "TMDb authorization was cancelled.", source=source)
        if not state and not request_token:
            return self._redirect(
                "error", "TMDb did not return the expected authorization details.", source=source
            )
        try:
            user = oauth_service.link_tmdb_state_to_user(state, request_token)
            source = getattr(user, "_oauth_source", None) or source
        except Exception:  # noqa: BLE001 - the hop always bounces back to the frontend
            oauth_service.logger.exception("tmdb redirect link failed")
            return self._redirect("error", "Failed to link TMDb account. Please try again.", source=source)
        return self._redirect("success", source=source)


class TMDbLinkCallbackView(GenericAPIView):
    """POST /oauth/tmdb/callback — bind the approved TMDb session."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = TMDbLinkCallbackSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        state = serializer.validated_data["state"]
        request_token = serializer.validated_data["request_token"]
        source = None
        try:
            if request.user.is_authenticated:
                oauth_service.link_tmdb_to_user(request.user, state, request_token)
                source = getattr(request.user, "_oauth_source", None)
            else:
                user = oauth_service.link_tmdb_state_to_user(state, request_token)
                source = getattr(user, "_oauth_source", None)
        except OAuthFlowError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        except Exception:  # noqa: BLE001 - surface a stable detail on unexpected failures
            oauth_service.logger.exception("tmdb link callback failed")
            return Response(
                {"detail": "Failed to link TMDb account. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        resp_data = {"message": "TMDb account linked successfully"}
        if source:
            resp_data["source"] = source
        return Response(resp_data, status=status.HTTP_200_OK)


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
        source = request.data.get("source") if request.data else None
        try:
            auth_url, state = oauth_service.build_tmdb_login_url(source=source)
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
        resp_data = {"access_token": access, "token_type": "bearer"}
        oauth_source = getattr(user, "_oauth_source", None)
        if oauth_source:
            resp_data["source"] = oauth_source
        response = Response(resp_data, status=status.HTTP_200_OK)
        set_refresh_cookie(response, refresh)
        return response


class EpicLinkInitiateView(GenericAPIView):
    """POST /oauth/epic — start the Epic link flow."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request, *args, **kwargs):
        auth_url, state = oauth_service.build_epic_link_url(user_id=request.user.pk)
        return Response({"auth_url": auth_url, "state": state}, status=status.HTTP_200_OK)


class EpicLinkCallbackView(GenericAPIView):
    """POST /oauth/epic/callback — exchange authorization code and store credentials on user."""

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

        from apps.integrations.services import epic_client

        try:
            tokens = epic_client.exchange_authorization_code(code)
        except epic_client.EpicAuthError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        user.epic_account_id = tokens["account_id"]
        user.epic_display_name = tokens["display_name"]
        user.epic_access_token = tokens["access_token"]
        user.epic_refresh_token = tokens["refresh_token"]
        user.epic_token_expires_at = tokens["expires_at"]
        user.save(
            update_fields=[
                "epic_account_id",
                "epic_display_name",
                "epic_access_token",
                "epic_refresh_token",
                "epic_token_expires_at",
            ]
        )

        # If a worker node is specified or online, sync with the node as well
        node_id = request.data.get("node_id") or request.data.get("server_id")
        server = None
        if node_id:
            server = UserGameServer.objects.filter(user=user, id=node_id).first()
        if server is None:
            server = pick_online_game_server(user)
        if server:
            try:
                proxy_epic_auth(server, code)
            except Exception:
                pass

        oauth_service.delete_epic_link_states(user_id=request.user.pk)
        return Response(
            {
                "connected": True,
                "account_id": user.epic_account_id,
                "display_name": user.epic_display_name,
            },
            status=status.HTTP_200_OK,
        )


class EpicDisconnectView(GenericAPIView):
    """DELETE /oauth/epic/disconnect — unlink Epic from the user's account."""

    permission_classes = (permissions.IsAuthenticated,)

    def delete(self, request, *args, **kwargs):
        user = request.user
        user.epic_account_id = None
        user.epic_display_name = None
        user.epic_access_token = None
        user.epic_refresh_token = None
        user.epic_token_expires_at = None
        user.save(
            update_fields=[
                "epic_account_id",
                "epic_display_name",
                "epic_access_token",
                "epic_refresh_token",
                "epic_token_expires_at",
            ]
        )

        node_id = (
            request.data.get("node_id")
            or request.data.get("server_id")
            or request.query_params.get("node_id")
            or request.query_params.get("server_id")
        )
        server = None
        if node_id:
            server = UserGameServer.objects.filter(user=user, id=node_id).first()
        if server is None:
            server = pick_online_game_server(user)
        if server:
            try:
                proxy_epic_disconnect(server)
            except Exception:
                pass

        return Response(
            {"message": "Epic account unlinked successfully"}, status=status.HTTP_200_OK
        )


class GOGLinkInitiateView(GenericAPIView):
    """POST /oauth/gog — start the GOG link flow."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request, *args, **kwargs):
        auth_url, state = oauth_service.build_gog_link_url(user_id=request.user.pk)
        return Response({"auth_url": auth_url, "state": state}, status=status.HTTP_200_OK)


class GOGLinkCallbackView(GenericAPIView):
    """POST /oauth/gog/callback — exchange authorization code and store credentials on user."""

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = OAuthCallbackSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]
        state = serializer.validated_data["state"]

        payload = oauth_service.consume_gog_link_state(state, user_id=request.user.pk)
        if payload is None:
            return Response(
                {"detail": "GOG linking session expired. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.integrations.services import gog_client

        try:
            tokens = gog_client.exchange_authorization_code(code)
        except gog_client.GOGAuthError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        user.gog_account_id = tokens["account_id"]
        user.gog_display_name = tokens["display_name"]
        user.gog_access_token = tokens["access_token"]
        user.gog_refresh_token = tokens["refresh_token"]
        user.gog_token_expires_at = tokens["expires_at"]
        user.save(
            update_fields=[
                "gog_account_id",
                "gog_display_name",
                "gog_access_token",
                "gog_refresh_token",
                "gog_token_expires_at",
            ]
        )

        # Sync with worker node if online
        node_id = request.data.get("node_id") or request.data.get("server_id")
        server = None
        if node_id:
            server = UserGameServer.objects.filter(user=user, id=node_id).first()
        if server is None:
            server = pick_online_game_server(user)
        if server:
            try:
                proxy_gog_auth(server, code)
            except Exception:
                pass

        oauth_service.delete_gog_link_states(user_id=request.user.pk)
        return Response(
            {
                "connected": True,
                "account_id": user.gog_account_id,
                "display_name": user.gog_display_name,
            },
            status=status.HTTP_200_OK,
        )


class GOGDisconnectView(GenericAPIView):
    """DELETE /oauth/gog/disconnect — unlink GOG from the user's account."""

    permission_classes = (permissions.IsAuthenticated,)

    def delete(self, request, *args, **kwargs):
        user = request.user
        user.gog_account_id = None
        user.gog_display_name = None
        user.gog_access_token = None
        user.gog_refresh_token = None
        user.gog_token_expires_at = None
        user.save(
            update_fields=[
                "gog_account_id",
                "gog_display_name",
                "gog_access_token",
                "gog_refresh_token",
                "gog_token_expires_at",
            ]
        )

        node_id = (
            request.data.get("node_id")
            or request.data.get("server_id")
            or request.query_params.get("node_id")
            or request.query_params.get("server_id")
        )
        server = None
        if node_id:
            server = UserGameServer.objects.filter(user=user, id=node_id).first()
        if server is None:
            server = pick_online_game_server(user)
        if server:
            try:
                proxy_gog_disconnect(server)
            except Exception:
                pass

        return Response(
            {"message": "GOG account unlinked successfully"}, status=status.HTTP_200_OK
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
