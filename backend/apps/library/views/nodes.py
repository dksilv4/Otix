"""Node API views: self-hosted otix node management and library indexing."""

import logging
import mimetypes
from pathlib import Path
from typing import Any

import httpx
from django.conf import settings
from django.core.cache import cache
from django.db.models import Q
from django.db.utils import OperationalError, ProgrammingError
from django.http import FileResponse, Http404
from rest_framework import permissions, status
from rest_framework.exceptions import NotAuthenticated, NotFound, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

import apps.library.services.node as node_service
from apps.library.models import UserGameServer, UserNode, UserNodeShare
from apps.library.serializers import (
    UserGameServerCreateSerializer,
    UserGameServerSerializer,
    UserNodeCreateSerializer,
    UserNodeSerializer,
    UserNodeShareSerializer,
)
from apps.library.services.download_history import (
    apply_history_slots,
    apply_queue_progress,
    list_download_history,
    mark_download_cancelled,
    proxy_download_payload,
    record_queued_download,
)
from apps.library.services.node import (
    PENDING_CACHE_KEY,
    PENDING_TTL,
    apply_node_heartbeat,
    claim_node_by_pin,
    claim_node_direct,
    clear_scanned_game_libraries,
    collapse_duplicate_game_servers,
    contact_urls,
    desktop_get_settings,
    desktop_save_settings,
    downloads_add,
    downloads_cancel,
    downloads_history,
    downloads_queue,
    downloads_search,
    explorer_browse,
    explorer_create_folder,
    explorer_request_permission,
    explorer_set_download_path,
    link_or_create_game_server,
    list_pending_nodes,
    list_pending_nodes_for,
    node_execute_organize,
    node_get_organize,
    node_get_running_games,
    node_get_sessions,
    node_list_libraries,
    node_preview_organize,
    node_replace_libraries,
    node_save_organize,
    probe_node_reachability,
    provider_list,
    provider_test,
    prowlarr_get_indexers,
    prowlarr_sync_indexers,
    radarr_add_movie,
    radarr_delete_queue,
    radarr_get_config,
    radarr_get_history,
    radarr_get_movies,
    radarr_get_quality_profiles,
    radarr_get_queue,
    radarr_get_root_folders,
    radarr_lookup,
    radarr_save_config,
    radarr_test,
    sabnzbd_pause_queue,
    sabnzbd_resume_queue,
    scan_game_libraries,
    sonarr_add_series,
    sonarr_delete_queue,
    sonarr_get_config,
    sonarr_get_history,
    sonarr_get_quality_profiles,
    sonarr_get_queue,
    sonarr_get_root_folders,
    sonarr_get_series,
    sonarr_lookup,
    sonarr_save_config,
    sonarr_test,
    usenet_delete_queue,
    usenet_download,
    usenet_get_config,
    usenet_get_history,
    usenet_get_queue,
    usenet_save_config,
    usenet_search,
    usenet_test_prowlarr,
    usenet_test_sabnzbd,
)
from apps.library.services.node_connections import (
    configured_map,
    import_instances,
    push_shared_connections,
    push_shared_to_servers,
    serialized_store,
    store_all,
)
from apps.library.services.server_catalog import match_files_to_catalog, unmatched_scan_titles
from apps.search.services.search import enqueue_prehydrate_titles
from apps.social.models import FriendRequest

logger = logging.getLogger(__name__)


def ping_server_sync(*args, **kwargs):
    return node_service.ping_server_sync(*args, **kwargs)


def _track_download_history(fn, *args, **kwargs):
    """History writes must never fail the live SABnzbd proxy."""
    try:
        return fn(*args, **kwargs)
    except (OperationalError, ProgrammingError) as exc:
        logger.warning("download history skipped: %s", exc)
        return None


def _resolve_user(request: Request):
    user = getattr(request, "user", None)
    if user and getattr(user, "is_authenticated", False):
        return user
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return (
        User.objects.filter(is_superuser=True, is_active=True).order_by("id").first()
        or User.objects.filter(is_active=True).order_by("id").first()
    )


def _get_server_or_404(request: Request, server_id: int) -> UserGameServer:
    resolved_user = _resolve_user(request)
    server = None
    if resolved_user:
        server = UserGameServer.objects.filter(id=server_id, user=resolved_user).first()
    if not server:
        server = UserGameServer.objects.filter(id=server_id).first()
    if not server:
        raise NotFound("Otix node not found")
    return server


def _arr_instance_id(request: Request) -> str | None:
    query_id = request.query_params.get("instance_id")
    if query_id:
        return query_id
    data = getattr(request, "data", None)
    if isinstance(data, dict):
        value = data.get("instance_id")
        return str(value) if value else None
    return None


class GameServerListCreateView(APIView):
    """``GET /api/v1/library/servers`` — list user's game servers.
    ``POST /api/v1/library/servers`` — register a new game server node.
    """

    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        user = _resolve_user(request)
        if user:
            collapse_duplicate_game_servers(user)
            servers = list(UserGameServer.objects.filter(user=user))
        else:
            servers = list(UserGameServer.objects.all())

        return Response(UserGameServerSerializer(servers, many=True).data)

    def post(self, request: Request) -> Response:
        user = _resolve_user(request)
        if not user:
            raise NotAuthenticated("User not found")
        serializer = UserNodeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        # Auto-naming fallback: prefer announced node name over generic Node ID:<X>
        raw_name = (data.get("name") or "").strip()
        if not raw_name or raw_name in ("Otix Game Server", "Otix Node") or raw_name.startswith("Node ID:"):
            pending_matches = [
                n
                for n in list_pending_nodes()
                if (data.get("local_url") and n.get("local_url") == data.get("local_url"))
                or (data.get("auth_token") and n.get("auth_token") == data.get("auth_token"))
            ]
            announced = pending_matches[0].get("server_name") if pending_matches else ""
            if announced and announced not in ("Otix Game Server", "Otix Node") and not announced.startswith("Node ID:"):
                data["name"] = announced
            elif raw_name:
                data["name"] = raw_name
            else:
                node_count = UserNode.objects.filter(user=user).count() + 1
                data["name"] = f"Node ID:{node_count}"

        server, created = link_or_create_game_server(user, data)
        result = ping_server_sync(server)
        target_endpoint = server.primary_url or server.local_url or ""
        if not result.get("online"):
            if created:
                server.delete()
            return Response(
                {
                    "detail": f"Could not connect to node at {target_endpoint} ({result.get('error') or 'unreachable'}). Ensure the node is online and reachable."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        server.refresh_from_db()
        payload = UserNodeSerializer(server).data
        payload["connect_error"] = None
        payload["created"] = created
        payload["shared_connections"] = configured_map(user)
        return Response(
            payload,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class GameServerHeartbeatView(APIView):
    """``POST /api/v1/servers/heartbeat`` — otix-server announces itself (no auth)."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request: Request) -> Response:
        result = apply_node_heartbeat(request.data if isinstance(request.data, dict) else {})
        resp = {"status": "ok"}
        if result and result.get("claimed"):
            resp["claimed"] = True
            resp["auth_token"] = result.get("auth_token", "")
            resp["server_name"] = result.get("server_name", "")
            resp["username"] = result.get("claimed_by", "")
        return Response(resp)


class GameServerScanCompleteView(APIView):
    """``POST /api/v1/servers/scan-complete`` — node announces finished library scan."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request: Request) -> Response:
        from apps.library.services.otix_sync import sync_otix_sidecars

        payload = request.data if isinstance(request.data, dict) else {}
        token = payload.get("auth_token") or ""
        endpoints = payload.get("local_endpoints") or []
        write_otix = payload.get("write_otix", True)
        download_images = payload.get("download_images", False)

        query = Q()
        if token:
            query |= Q(auth_token=token)
        for url in endpoints:
            clean = url.rstrip("/")
            query |= (
                Q(local_url=clean)
                | Q(local_url=f"{clean}/")
                | Q(remote_url=clean)
                | Q(remote_url=f"{clean}/")
            )

        servers = list(UserNode.objects.filter(query).distinct()) if query else []
        if not servers:
            return Response({"status": "ignored", "reason": "server not registered"}, status=200)

        results = []
        for server in servers:
            status_code, sync_data = sync_otix_sidecars(
                server,
                download_images=bool(download_images),
                write_otix=bool(write_otix),
                ensure_scan=False,
            )
            results.append({"server_id": server.id, "status": status_code, "data": sync_data})

        return Response({"status": "ok", "results": results})


class GameServerPendingView(APIView):
    """``GET /api/v1/library/servers/pending`` — nodes that heartbeated but are not claimed."""

    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        user = _resolve_user(request)
        return Response(list_pending_nodes_for(user) if user else [])


class GameServerClaimView(APIView):
    """``POST /api/v1/library/servers/claim`` — Plex-style claim of an Otix node by PIN."""

    permission_classes = (AllowAny,)

    def post(self, request: Request) -> Response:
        user = _resolve_user(request)
        if not user:
            raise NotAuthenticated("User authentication required to claim a server node")

        payload = request.data if isinstance(request.data, dict) else {}
        claim_code = payload.get("claim_code") or payload.get("claimCode")
        node_url = payload.get("node_url") or payload.get("nodeUrl")
        server_name = payload.get("server_name") or payload.get("serverName")

        if not claim_code:
            return Response({"error": "claim_code is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            is_local = payload.get("is_local") if "is_local" in payload else payload.get("isLocal")
            server, created = claim_node_by_pin(
                user=user,
                claim_code=str(claim_code),
                node_url=str(node_url) if node_url else None,
                server_name=str(server_name) if server_name else None,
                is_local=bool(is_local) if is_local is not None else None,
            )
            data = UserGameServerSerializer(server).data
            data["created"] = created
            return Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response(
                {"error": f"Failed to claim node: {exc}"}, status=status.HTTP_502_BAD_GATEWAY
            )


class GameServerClaimDirectView(APIView):
    """``POST /api/v1/library/servers/claim-direct`` — Direct outbound claim from the node daemon."""

    permission_classes = (AllowAny,)

    def post(self, request: Request) -> Response:
        user = _resolve_user(request)
        if not user:
            raise NotAuthenticated("User authentication required to claim a server node")

        payload = request.data if isinstance(request.data, dict) else {}
        client_ip = (
            request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
            or request.META.get("REMOTE_ADDR")
        )
        try:
            server, created = claim_node_direct(
                user=user,
                payload=payload,
                remote_ip=client_ip,
            )
            data = UserGameServerSerializer(server).data
            data["created"] = created
            return Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response(
                {"error": f"Failed to claim node directly: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class GameServerUnclaimView(APIView):
    """``POST /api/v1/servers/unclaim`` — unclaim and detach an otix node."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request: Request) -> Response:
        payload = request.data if isinstance(request.data, dict) else {}
        token = payload.get("auth_token") or payload.get("authToken") or ""
        if not token:
            auth_header = request.headers.get("Authorization") or ""
            if auth_header.startswith("Bearer "):
                token = auth_header[7:].strip()
        urls: list[str] = []
        if payload.get("local_url"):
            urls.append(str(payload.get("local_url")))
        if payload.get("localUrl"):
            urls.append(str(payload.get("localUrl")))
        if payload.get("local_endpoints") and isinstance(payload.get("local_endpoints"), list):
            urls.extend(str(u) for u in payload.get("local_endpoints") if u)
        if payload.get("localEndpoints") and isinstance(payload.get("localEndpoints"), list):
            urls.extend(str(u) for u in payload.get("localEndpoints") if u)

        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            user = None

        if not token and not urls:
            return Response(
                {"error": "auth_token or local_url is required to unclaim"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        deleted_count = node_service.unclaim_node(token=token, urls=urls, user=user)
        return Response(
            {
                "status": "ok",
                "message": f"Successfully unclaimed {deleted_count} node(s)",
                "unclaimed": deleted_count,
            }
        )




class GameServerProbeView(APIView):
    """``POST /api/v1/library/servers/{server_id}/probe`` — test remote access reachability."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        result = probe_node_reachability(server)
        return Response(result)


class GameServerDownloadsListView(APIView):
    """``GET /api/v1/library/servers/downloads`` — direct download links and metadata."""

    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        base_release_url = "https://github.com/dksilv4/Otix/releases/latest/download"
        host = request.build_absolute_uri("/").rstrip("/")
        media_downloads = Path(settings.MEDIA_ROOT) / "downloads"

        def resolve_url(filename: str, fallback_url: str) -> str:
            if (media_downloads / filename).is_file():
                return f"{host}/api/v1/library/servers/downloads/file/{filename}"
            return fallback_url

        downloads = [
            {
                "platform": "macos",
                "label": "macOS (Apple Silicon & Intel)",
                "filename": "Otix-Node.dmg",
                "format": "dmg",
                "description": (
                    "Universal Mac package. Open the DMG, drag Otix Node to Applications, "
                    "and double-click to start."
                ),
                "url": resolve_url("Otix-Node.dmg", f"{base_release_url}/Otix-Node.dmg"),
                "recommended": True,
            },
            {
                "platform": "windows",
                "label": "Windows (64-bit)",
                "filename": "Otix-Node-Windows-x64.zip",
                "format": "zip",
                "description": "Portable standalone executable. Extract and double-click to start.",
                "url": resolve_url(
                    "Otix-Node-Windows-x64.zip", f"{base_release_url}/Otix-Node-Windows-x64.zip"
                ),
                "recommended": True,
            },
            {
                "platform": "linux",
                "label": "Linux (x86_64)",
                "filename": "Otix-Node-Linux-x64.tar.gz",
                "format": "tar.gz",
                "description": "Standalone binary archive for Linux distributions.",
                "url": resolve_url(
                    "Otix-Node-Linux-x64.tar.gz", f"{base_release_url}/Otix-Node-Linux-x64.tar.gz"
                ),
                "recommended": False,
            },
            {
                "platform": "unraid",
                "label": "Unraid / Docker",
                "filename": "my-otix-server.xml",
                "format": "xml",
                "description": "Community Applications Docker template on port 8090.",
                "url": (
                    "https://raw.githubusercontent.com/dksilv4/Otix/main/node/unraid/"
                    "my-otix-server.xml"
                ),
                "recommended": False,
            },
        ]
        return Response({"version": "0.0.1", "downloads": downloads})


class GameServerDownloadFileView(APIView):
    """``GET /api/v1/library/servers/downloads/file/{filename}`` — download installer."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, filename: str) -> FileResponse:
        media_downloads = (Path(settings.MEDIA_ROOT) / "downloads").resolve()
        safe_path = (media_downloads / filename).resolve()
        if not safe_path.is_file() or media_downloads not in safe_path.parents:
            raise Http404("Installer file not found")

        content_type, _ = mimetypes.guess_type(str(safe_path))
        return FileResponse(
            open(safe_path, "rb"),
            as_attachment=True,
            filename=filename,
            content_type=content_type or "application/octet-stream",
        )


class GameServerDetailView(APIView):
    """``PATCH /api/v1/library/servers/{server_id}`` — update server configuration.
    ``DELETE /api/v1/library/servers/{server_id}`` — remove connected server.
    """

    permission_classes = (AllowAny,)

    def _get_server(self, request: Request, server_id: int) -> UserGameServer:
        user = _resolve_user(request)
        if user:
            try:
                return UserGameServer.objects.get(id=server_id, user=user)
            except UserGameServer.DoesNotExist:
                pass
        try:
            return UserGameServer.objects.get(id=server_id)
        except UserGameServer.DoesNotExist:
            raise NotFound("Otix node not found") from None

    def patch(self, request: Request, server_id: int) -> Response:
        server = self._get_server(request, server_id)
        new_name = request.data.get("name") if isinstance(request.data, dict) else None
        serializer = UserGameServerCreateSerializer(server, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        server = serializer.save()
        if new_name and isinstance(new_name, str) and new_name.strip() and server.is_online:
            try:
                desktop_save_settings(server, {"server_name": new_name.strip()})
            except Exception:
                pass
        ping_server_sync(server)
        server.refresh_from_db()
        return Response(UserGameServerSerializer(server).data)

    def delete(self, request: Request, server_id: int) -> Response:
        server = self._get_server(request, server_id)
        deleted_urls = {server.local_url, server.remote_url}
        token = server.auth_token
        remaining = []
        for r in cache.get(PENDING_CACHE_KEY) or []:
            if token and r.get("auth_token") == token:
                continue
            if any(u in deleted_urls for u in (r.get("local_url"), r.get("advertised_url")) if u):
                continue
            remaining.append(r)
        cache.set(PENDING_CACHE_KEY, remaining, PENDING_TTL)

        server.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GameServerPingView(APIView):
    """``POST /api/v1/library/servers/{server_id}/ping`` — test server connectivity."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        result = ping_server_sync(server)
        server.refresh_from_db()
        return Response(
            {
                **result,
                "server": UserGameServerSerializer(server).data,
            }
        )


class GameServerFilesView(APIView):
    """``GET /api/v1/library/server-games`` — aggregate hosted games from user servers."""

    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        user = _resolve_user(request)
        own_servers = list(
            UserGameServer.objects.filter(user=user, is_active=True).select_related("user")
            if user
            else UserGameServer.objects.filter(is_active=True).select_related("user")
        )
        server_map = {s.id: s for s in own_servers}
        node_shares_map = {}

        if user and getattr(user, "is_authenticated", False):
            user_shares = UserNodeShare.objects.filter(
                shared_with=user, node__is_active=True
            ).select_related("node", "node__user")
            for sh in user_shares:
                if sh.node_id not in server_map:
                    server_map[sh.node_id] = sh.node
                node_shares_map[sh.node_id] = sh

        share_token = request.query_params.get("share_token")
        if share_token:
            token_shares = UserNodeShare.objects.filter(
                share_token=share_token, node__is_active=True
            ).select_related("node", "node__user")
            for sh in token_shares:
                if sh.node_id not in server_map:
                    server_map[sh.node_id] = sh.node
                node_shares_map[sh.node_id] = sh

        servers = list(server_map.values())
        files_out = []
        errors = []

        for s in servers:
            public_url = (s.primary_url or "").rstrip("/")
            if not public_url:
                continue
            headers = {}
            if s.auth_token:
                headers["Authorization"] = f"Bearer {s.auth_token}"

            is_shared = (s.id in node_shares_map) or (user and s.user_id != user.id)
            share = node_shares_map.get(s.id)
            shared_by = (
                {
                    "id": s.user.id,
                    "username": s.user.username,
                    "display_name": getattr(s.user, "display_name", None) or s.user.username,
                }
                if is_shared and s.user
                else None
            )

            last_error = None
            fetched = False
            for target_url in contact_urls(public_url):
                try:
                    with httpx.Client(timeout=4.0) as client:
                        resp = client.get(f"{target_url}/api/v1/files", headers=headers)
                    if resp.status_code == 200:
                        raw_files = resp.json()
                        for f in raw_files:
                            library_name = f.get("library_name", "Default")
                            if share and not share.allow_all_libraries:
                                if library_name not in (share.allowed_libraries or []):
                                    continue

                            file_id = f.get("id")
                            relative_path = f.get("relative_path") or ""
                            filepath = f.get("filepath") or ""
                            if not relative_path and filepath:
                                parts = [
                                    part for part in Path(filepath).parts if part not in ("/", "\\")
                                ]
                                relative_path = (
                                    "/".join(parts[-2:]) if len(parts) >= 2 else Path(filepath).name
                                )
                            files_out.append(
                                {
                                    "server_id": s.id,
                                    "server_name": s.name,
                                    "server_url": public_url,
                                    "file_id": file_id,
                                    "id": file_id,
                                    "filename": f.get("filename"),
                                    "filesize": f.get("filesize", 0),
                                    "extension": f.get("extension", ""),
                                    "format_category": f.get("format_category", "installer"),
                                    "game_title": f.get("game_title", ""),
                                    "relative_path": relative_path,
                                    "filepath": filepath,
                                    "library_name": library_name,
                                    "modified_at": f.get("modified_at"),
                                    "download_url": f"{public_url}/api/v1/files/{file_id}/download",
                                    "is_shared": is_shared,
                                    "shared_by": shared_by,
                                    "otix_media_id": f.get("otix_media_id"),
                                    "otix_title": f.get("otix_title"),
                                    "otix_slug": f.get("otix_slug"),
                                    "otix_confidence": f.get("otix_confidence"),
                                    "otix_images": f.get("otix_images"),
                                    "otix_path": f.get("otix_path"),
                                    "otix_overview": f.get("otix_overview"),
                                }
                            )
                        fetched = True
                        break
                    last_error = f"HTTP {resp.status_code}"
                    if resp.status_code == 401:
                        break
                except Exception as err:
                    last_error = str(err)
            if not fetched:
                errors.append({"server_id": s.id, "error": last_error or "Unreachable"})

        # Enrich files with catalog matches (updates resolve to the parent game)
        match_files_to_catalog(files_out)
        enqueue_prehydrate_titles(unmatched_scan_titles(files_out))
        for file in files_out:
            file.pop("filepath", None)

        return Response(
            {
                "servers": UserGameServerSerializer(
                    servers, many=True, context={"request": request}
                ).data,
                "files": files_out,
                "errors": errors if errors else None,
            }
        )


class NodeShareListCreateView(APIView):
    """``GET / POST /api/v1/library/nodes/<server_id>/shares`` - manage Otix node shares."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request, server_id: int) -> Response:
        server = UserGameServer.objects.filter(pk=server_id, user=request.user).first()
        if not server:
            raise NotFound("Node not found or not owned by you")
        shares = server.shares.select_related("shared_with").order_by("-created_at")
        serializer = UserNodeShareSerializer(shares, many=True)
        return Response(serializer.data)

    def post(self, request: Request, server_id: int) -> Response:
        server = UserGameServer.objects.filter(pk=server_id, user=request.user).first()
        if not server:
            raise NotFound("Node not found or not owned by you")

        is_public_link = request.data.get("is_public_link", False)
        shared_with_id = request.data.get("shared_with_id")

        if is_public_link:
            share = UserNodeShare.objects.create(
                node=server,
                shared_with=None,
                is_public_link=True,
                allow_all_libraries=request.data.get("allow_all_libraries", True),
                allowed_libraries=request.data.get("allowed_libraries", []),
                permission=request.data.get("permission", "read"),
            )
            return Response(UserNodeShareSerializer(share).data, status=status.HTTP_201_CREATED)

        if not shared_with_id:
            raise ValidationError("shared_with_id is required unless creating a public link")

        if shared_with_id == request.user.id:
            raise ValidationError("You cannot share a node with yourself")

        # REQUIREMENT: Share only with Otix friends!
        is_friend = FriendRequest.objects.filter(
            (
                Q(sender_id=request.user.id, receiver_id=shared_with_id)
                | Q(sender_id=shared_with_id, receiver_id=request.user.id)
            ),
            status="accepted",
        ).exists()
        if not is_friend:
            raise ValidationError("You can only share Otix nodes with Otix friends")

        from django.contrib.auth import get_user_model

        target_user = get_user_model().objects.filter(pk=shared_with_id).first()
        if not target_user:
            raise NotFound("Friend user not found")

        share, _ = UserNodeShare.objects.update_or_create(
            node=server,
            shared_with=target_user,
            defaults={
                "is_public_link": False,
                "allow_all_libraries": request.data.get("allow_all_libraries", True),
                "allowed_libraries": request.data.get("allowed_libraries", []),
                "permission": request.data.get("permission", "read"),
            },
        )
        return Response(UserNodeShareSerializer(share).data, status=status.HTTP_201_CREATED)


class NodeShareDeleteView(APIView):
    """``DELETE /api/v1/library/nodes/<server_id>/shares/<share_id>`` - revoke a node share."""

    permission_classes = (permissions.IsAuthenticated,)

    def delete(self, request: Request, server_id: int, share_id: int) -> Response:
        server = UserGameServer.objects.filter(pk=server_id, user=request.user).first()
        if not server:
            raise NotFound("Node not found or not owned by you")

        deleted, _ = server.shares.filter(pk=share_id).delete()
        if not deleted:
            raise NotFound("Share not found")
        return Response(status=status.HTTP_204_NO_CONTENT)


class GameServerExplorerBrowseView(APIView):
    """``GET /api/v1/library/servers/{server_id}/explorer`` — browse server filesystem."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)

        path = request.query_params.get("path")
        status_code, data = explorer_browse(server, path=path)
        return Response(data, status=status_code)


class GameServerExplorerSetPathView(APIView):
    """Assign the server download folder via explorer/set-download-path."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)

        path = request.data.get("path")
        if not path:
            return Response({"detail": "path is required"}, status=status.HTTP_400_BAD_REQUEST)

        create_if_missing = request.data.get("create_if_missing", True)
        add_as_library = request.data.get("add_as_library", True)

        status_code, data = explorer_set_download_path(
            server, path=path, create_if_missing=create_if_missing, add_as_library=add_as_library
        )
        if status_code == 200:
            ping_server_sync(server)
            server.refresh_from_db()
        return Response(data, status=status_code)


class GameServerExplorerCreateFolderView(APIView):
    """Create a subfolder on the server via explorer/create-folder."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        parent_path = request.data.get("parent_path", "")
        folder_name = request.data.get("folder_name", "")
        if not folder_name:
            return Response(
                {"detail": "folder_name is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        status_code, data = explorer_create_folder(
            server, parent_path=parent_path, folder_name=folder_name
        )
        return Response(data, status=status_code)


class GameServerExplorerRequestPermissionView(APIView):
    """``POST /api/v1/library/servers/{server_id}/explorer/request-permission`` — request macOS folder access."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        path = request.data.get("path", "")
        if not path:
            return Response({"detail": "path is required"}, status=status.HTTP_400_BAD_REQUEST)

        status_code, data = explorer_request_permission(server, path=path)
        return Response(data, status=status_code)


class GameServerUsenetConfigView(APIView):
    """``GET /api/v1/library/servers/{server_id}/usenet/config`` — get usenet config
    ``POST /api/v1/library/servers/{server_id}/usenet/config`` — save usenet config
    """

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = usenet_get_config(server)
        return Response(data, status=status_code)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = usenet_save_config(server, request.data)
        return Response(data, status=status_code)


class GameServerUsenetTestSabnzbdView(APIView):
    """Test the server's SABnzbd connection."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = usenet_test_sabnzbd(server, request.data)
        return Response(data, status=status_code)


class GameServerUsenetTestProwlarrView(APIView):
    """Test the server's Prowlarr connection."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = usenet_test_prowlarr(server, request.data)
        return Response(data, status=status_code)


class GameServerUsenetSearchView(APIView):
    """Search Prowlarr indexers for games."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        query = request.query_params.get("query", "")
        if not query:
            return Response([], status=status.HTTP_200_OK)
        status_code, data = usenet_search(server, query)
        return Response(data, status=status_code)


class GameServerUsenetDownloadView(APIView):
    """``POST /api/v1/library/servers/{server_id}/usenet/download`` — send NZB to server SABnzbd."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        payload = request.data if isinstance(request.data, dict) else {}
        status_code, data = usenet_download(server, proxy_download_payload(payload))
        if status_code < 300:
            _track_download_history(
                record_queued_download, server, payload, data, user=request.user
            )
        return Response(data, status=status_code)


class GameServerUsenetQueueView(APIView):
    """``GET /api/v1/library/servers/{server_id}/usenet/queue`` — get active SABnzbd queue."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = usenet_get_queue(server)
        if status_code < 300:
            _track_download_history(apply_queue_progress, server, data)
        return Response(data, status=status_code)

    def delete(self, request: Request, server_id: int, nzo_id: str) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = usenet_delete_queue(server, nzo_id)
        if status_code < 300:
            _track_download_history(mark_download_cancelled, server, nzo_id)
        return Response(data, status=status_code)


class GameServerUsenetHistoryView(APIView):
    """``GET /api/v1/library/servers/{server_id}/usenet/history`` — persisted + SABnzbd history."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        try:
            limit = int(request.query_params.get("limit") or 50)
        except (TypeError, ValueError):
            limit = 50
        status_code, data = usenet_get_history(server, limit=limit)
        if status_code < 300:
            _track_download_history(apply_history_slots, server, data)
        items = _track_download_history(list_download_history, server, limit=limit) or []
        return Response({"items": items})


class GameServerProvidersView(APIView):
    """List registered providers and the active selection."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = provider_list(server)
        return Response(data, status=status_code)


class GameServerProviderTestView(APIView):
    """Test connectivity for a named provider."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int, provider_type: str, name: str) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = provider_test(server, provider_type, name)
        return Response(data, status=status_code)


class GameServerDownloadsSearchView(APIView):
    """Search across the server's active download providers."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        query = request.query_params.get("query", "")
        provider = request.query_params.get("provider")
        if not query:
            return Response([], status=status.HTTP_200_OK)
        status_code, data = downloads_search(server, query=query, provider=provider)
        return Response(data, status=status_code)


class GameServerDownloadsAddView(APIView):
    """Send a release download to the active downloader."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        downloader = request.query_params.get("downloader")
        payload = request.data if isinstance(request.data, dict) else {}
        status_code, data = downloads_add(
            server, proxy_download_payload(payload), downloader=downloader
        )
        if status_code < 300:
            _track_download_history(
                record_queued_download, server, payload, data, user=request.user
            )
        return Response(data, status=status_code)


class GameServerDownloadsQueueView(APIView):
    """Get or cancel items in the server download queue."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        downloader = request.query_params.get("downloader")
        status_code, data = downloads_queue(server, downloader=downloader)
        if status_code < 300:
            _track_download_history(apply_queue_progress, server, data)
        return Response(data, status=status_code)

    def delete(self, request: Request, server_id: int, download_id: str) -> Response:
        server = _get_server_or_404(request, server_id)
        downloader = request.query_params.get("downloader")
        status_code, data = downloads_cancel(server, download_id, downloader=downloader)
        if status_code < 300:
            _track_download_history(mark_download_cancelled, server, download_id)
        return Response(data, status=status_code)


class GameServerDownloadsHistoryView(APIView):
    """Return persisted download history for the server."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        downloader = request.query_params.get("downloader")
        try:
            limit = int(request.query_params.get("limit") or 50)
        except (TypeError, ValueError):
            limit = 50
        status_code, data = downloads_history(server, downloader=downloader, limit=limit)
        if status_code < 300:
            _track_download_history(apply_history_slots, server, data)
        items = _track_download_history(list_download_history, server, limit=limit) or []
        return Response({"items": items})


class GameServerProwlarrIndexersView(APIView):
    """``GET /api/v1/library/servers/{server_id}/prowlarr/indexers`` — get Prowlarr indexers."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        protocol = request.query_params.get("protocol")
        status_code, data = prowlarr_get_indexers(server, protocol=protocol)
        return Response(data, status=status_code)


class GameServerProwlarrSyncView(APIView):
    """Trigger a Prowlarr indexer sync on the server."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        protocol = request.query_params.get("protocol") or (
            request.data.get("protocol") if isinstance(request.data, dict) else None
        )
        status_code, data = prowlarr_sync_indexers(server, protocol=protocol)
        return Response(data, status=status_code)


class GameServerSabnzbdQueueControlView(APIView):
    """Pause or resume the SABnzbd download queue."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int, action: str) -> Response:
        server = _get_server_or_404(request, server_id)
        if action == "pause":
            status_code, data = sabnzbd_pause_queue(server)
        elif action == "resume":
            status_code, data = sabnzbd_resume_queue(server)
        else:
            return Response(
                {"detail": f"Unknown action '{action}'"}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(data, status=status_code)


class GameServerScanView(APIView):
    """``POST /api/v1/library/servers/{server_id}/scan`` — re-index hosted installer files."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = scan_game_libraries(server)
        return Response(data, status=status_code)


class GameServerScanClearView(APIView):
    """``POST /api/v1/library/servers/{server_id}/scan/clear`` — clear indexed hosted files."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = clear_scanned_game_libraries(server)
        return Response(data, status=status_code)


class GameServerOtixSettingsView(APIView):
    """``GET/POST /api/v1/library/servers/{server_id}/otix/settings`` — node `.otix` prefs."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        from apps.library.services.otix_sync import node_get_otix_settings

        server = _get_server_or_404(request, server_id)
        status_code, data = node_get_otix_settings(server)
        return Response(data, status=status_code)

    def post(self, request: Request, server_id: int) -> Response:
        from apps.library.services.otix_sync import node_save_otix_settings

        server = _get_server_or_404(request, server_id)
        status_code, data = node_save_otix_settings(server, request.data)
        return Response(data, status=status_code)


class GameServerOtixSyncView(APIView):
    """``POST /api/v1/library/servers/{server_id}/otix/sync`` — match, hydrate, write `.otix`."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        from apps.library.services.otix_sync import sync_otix_sidecars

        server = _get_server_or_404(request, server_id)
        download_images = request.data.get("download_images")
        write_otix = request.data.get("write_otix")
        if download_images is not None:
            download_images = bool(download_images)
        if write_otix is not None:
            write_otix = bool(write_otix)
        status_code, data = sync_otix_sidecars(
            server,
            download_images=download_images,
            write_otix=write_otix,
        )
        return Response(data, status=status_code)


class GameServerOtixMatchView(APIView):
    """``POST /api/v1/library/servers/{server_id}/otix/match`` — manually match a game file and write `.otix`."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        from apps.library.services.otix_sync import node_match_and_write_otix

        server = _get_server_or_404(request, server_id)
        media_id = request.data.get("media_id") or request.data.get("mediaId")
        if not media_id:
            return Response({"detail": "media_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        file_id = request.data.get("file_id") or request.data.get("fileId")
        filepath = request.data.get("filepath")
        confidence = request.data.get("confidence", 1.0)
        download_images = request.data.get("download_images")
        if download_images is not None:
            download_images = bool(download_images)

        status_code, data = node_match_and_write_otix(
            server,
            media_id=media_id,
            file_id=file_id,
            filepath=filepath,
            confidence=confidence,
            download_images=download_images,
            user=request.user
            if getattr(request, "user", None) and request.user.is_authenticated
            else None,
        )
        return Response(data, status=status_code)


class GameServerOtixAssetView(APIView):
    """``GET …/files/{file_id}/otix/asset/{role}`` — proxy local sidecar image from the node."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int, file_id: str, role: str) -> Response:
        from django.http import HttpResponse

        from apps.library.services.node import _auth_headers, contact_urls

        server = _get_server_or_404(request, server_id)
        if role not in {"poster", "backdrop", "logo", "textlessPoster", "icon"}:
            return Response({"detail": "Unknown asset role"}, status=status.HTTP_400_BAD_REQUEST)

        headers = _auth_headers(server)
        last_error = "unreachable"
        for target_url in contact_urls(server.primary_url or ""):
            try:
                with httpx.Client(timeout=30.0) as client:
                    resp = client.get(
                        f"{target_url}/api/v1/files/{file_id}/otix/asset/{role}",
                        headers=headers,
                    )
                if resp.status_code == 200:
                    content_type = resp.headers.get("content-type") or "application/octet-stream"
                    return HttpResponse(resp.content, content_type=content_type, status=200)
                last_error = f"HTTP {resp.status_code}"
                if resp.status_code == 404:
                    break
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)
                continue
        return Response({"detail": last_error}, status=status.HTTP_502_BAD_GATEWAY)


# ── Radarr Views ────────────────────────────────────────────────────────


class GameServerRadarrConfigView(APIView):
    """``GET /api/v1/library/servers/{server_id}/radarr/config`` — get Radarr config.
    ``POST /api/v1/library/servers/{server_id}/radarr/config`` — save Radarr config.
    """

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = radarr_get_config(server)
        return Response(data, status=status_code)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = radarr_save_config(server, request.data)
        return Response(data, status=status_code)


class GameServerRadarrTestView(APIView):
    """``POST /api/v1/library/servers/{server_id}/radarr/test`` — test Radarr connection."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = radarr_test(server, request.data)
        return Response(data, status=status_code)


class GameServerRadarrRootFoldersView(APIView):
    """``GET /api/v1/library/servers/{server_id}/radarr/rootfolders`` — list root folders."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = radarr_get_root_folders(server, instance_id=_arr_instance_id(request))
        return Response(data, status=status_code)


class GameServerRadarrQualityProfilesView(APIView):
    """List Radarr quality profiles for the server."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = radarr_get_quality_profiles(
            server, instance_id=_arr_instance_id(request)
        )
        return Response(data, status=status_code)


class GameServerRadarrMoviesView(APIView):
    """``GET /api/v1/library/servers/{server_id}/radarr/movies`` — list movies.
    ``POST /api/v1/library/servers/{server_id}/radarr/movies`` — add movie.
    """

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = radarr_get_movies(server, instance_id=_arr_instance_id(request))
        return Response(data, status=status_code)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = radarr_add_movie(server, request.data)
        return Response(data, status=status_code)


class GameServerRadarrLookupView(APIView):
    """``GET /api/v1/library/servers/{server_id}/radarr/lookup`` — lookup movies."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        term = request.query_params.get("term", "")
        if not term:
            return Response([], status=status.HTTP_200_OK)
        status_code, data = radarr_lookup(server, term, instance_id=_arr_instance_id(request))
        return Response(data, status=status_code)


class GameServerRadarrQueueView(APIView):
    """``GET /api/v1/library/servers/{server_id}/radarr/queue`` — get download queue.
    ``DELETE /api/v1/library/servers/{server_id}/radarr/queue/{queue_id}`` — delete item from queue.
    """

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 50))
        status_code, data = radarr_get_queue(
            server, page=page, page_size=page_size, instance_id=_arr_instance_id(request)
        )
        return Response(data, status=status_code)

    def delete(self, request: Request, server_id: int, queue_id: str) -> Response:
        server = _get_server_or_404(request, server_id)
        remove_from_client = (
            request.query_params.get("remove_from_client", "true").lower() == "true"
        )
        blocklist = request.query_params.get("blocklist", "false").lower() == "true"
        status_code, data = radarr_delete_queue(
            server,
            queue_id,
            remove_from_client=remove_from_client,
            blocklist=blocklist,
            instance_id=_arr_instance_id(request),
        )
        return Response(data, status=status_code)


class GameServerRadarrHistoryView(APIView):
    """``GET /api/v1/library/servers/{server_id}/radarr/history`` — get history."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 50))
        status_code, data = radarr_get_history(
            server, page=page, page_size=page_size, instance_id=_arr_instance_id(request)
        )
        return Response(data, status=status_code)


# ── Sonarr Views ────────────────────────────────────────────────────────


class GameServerSonarrConfigView(APIView):
    """``GET /api/v1/library/servers/{server_id}/sonarr/config`` — get Sonarr config.
    ``POST /api/v1/library/servers/{server_id}/sonarr/config`` — save Sonarr config.
    """

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = sonarr_get_config(server)
        return Response(data, status=status_code)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = sonarr_save_config(server, request.data)
        return Response(data, status=status_code)


class GameServerSonarrTestView(APIView):
    """``POST /api/v1/library/servers/{server_id}/sonarr/test`` — test Sonarr connection."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = sonarr_test(server, request.data)
        return Response(data, status=status_code)


class GameServerSonarrRootFoldersView(APIView):
    """``GET /api/v1/library/servers/{server_id}/sonarr/rootfolders`` — list root folders."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = sonarr_get_root_folders(server, instance_id=_arr_instance_id(request))
        return Response(data, status=status_code)


class GameServerSonarrQualityProfilesView(APIView):
    """List Sonarr quality profiles for the server."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = sonarr_get_quality_profiles(
            server, instance_id=_arr_instance_id(request)
        )
        return Response(data, status=status_code)


class GameServerSonarrSeriesView(APIView):
    """``GET /api/v1/library/servers/{server_id}/sonarr/series`` — list series.
    ``POST /api/v1/library/servers/{server_id}/sonarr/series`` — add series.
    """

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = sonarr_get_series(server, instance_id=_arr_instance_id(request))
        return Response(data, status=status_code)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = sonarr_add_series(server, request.data)
        return Response(data, status=status_code)


class GameServerSonarrLookupView(APIView):
    """``GET /api/v1/library/servers/{server_id}/sonarr/lookup`` — lookup series."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        term = request.query_params.get("term", "")
        if not term:
            return Response([], status=status.HTTP_200_OK)
        status_code, data = sonarr_lookup(server, term, instance_id=_arr_instance_id(request))
        return Response(data, status=status_code)


class GameServerSonarrQueueView(APIView):
    """``GET /api/v1/library/servers/{server_id}/sonarr/queue`` — get download queue.
    ``DELETE /api/v1/library/servers/{server_id}/sonarr/queue/{queue_id}`` — delete item from queue.
    """

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 50))
        status_code, data = sonarr_get_queue(
            server, page=page, page_size=page_size, instance_id=_arr_instance_id(request)
        )
        return Response(data, status=status_code)

    def delete(self, request: Request, server_id: int, queue_id: str) -> Response:
        server = _get_server_or_404(request, server_id)
        remove_from_client = (
            request.query_params.get("remove_from_client", "true").lower() == "true"
        )
        blocklist = request.query_params.get("blocklist", "false").lower() == "true"
        status_code, data = sonarr_delete_queue(
            server,
            queue_id,
            remove_from_client=remove_from_client,
            blocklist=blocklist,
            instance_id=_arr_instance_id(request),
        )
        return Response(data, status=status_code)


class GameServerSonarrHistoryView(APIView):
    """``GET /api/v1/library/servers/{server_id}/sonarr/history`` — get history."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 50))
        status_code, data = sonarr_get_history(
            server, page=page, page_size=page_size, instance_id=_arr_instance_id(request)
        )
        return Response(data, status=status_code)


class GameServerDesktopView(APIView):
    """``GET /api/v1/library/servers/{server_id}/desktop`` — get node desktop settings.
    ``POST /api/v1/library/servers/{server_id}/desktop`` — update node desktop settings.
    """

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        params = {}
        if request.query_params.get("refresh"):
            params["refresh"] = request.query_params.get("refresh")
        status_code, data = desktop_get_settings(server, params=params)
        return Response(data, status=status_code)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = desktop_save_settings(server, request.data)
        return Response(data, status=status_code)


class GameServerLibrariesView(APIView):
    """``GET /api/v1/library/servers/{server_id}/libraries`` — list node scan folders.
    ``PUT /api/v1/library/servers/{server_id}/libraries`` — replace node scan folders.
    """

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = node_list_libraries(server)
        return Response(data, status=status_code)

    def put(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        payload = request.data
        if isinstance(payload, list):
            payload = {"libraries": payload}
        status_code, data = node_replace_libraries(server, payload)
        return Response(data, status=status_code)


class GameServerOrganizeView(APIView):
    """``GET/POST /api/v1/library/servers/{server_id}/organize`` — node organize settings."""

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = node_get_organize(server)
        return Response(data, status=status_code)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = node_save_organize(server, request.data)
        return Response(data, status=status_code)


class GameServerOrganizePreviewView(APIView):
    """``POST /api/v1/library/servers/{server_id}/organize/preview`` — dry-run organization preview."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = node_preview_organize(server, request.data)
        return Response(data, status=status_code)


class GameServerOrganizeExecuteView(APIView):
    """``POST /api/v1/library/servers/{server_id}/organize/execute`` — execute organization movements."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = node_execute_organize(server, request.data)
        return Response(data, status=status_code)


def _request_payload(request: Request) -> dict:
    data = getattr(request, "data", None)
    return dict(data) if isinstance(data, dict) else {}


def _requested_server_ids(payload: dict) -> list[int] | None:
    raw = payload.get("server_ids", payload.get("serverIds"))
    if raw is None:
        return None
    if not isinstance(raw, list):
        raw = [raw]
    ids: list[int] = []
    for item in raw:
        try:
            ids.append(int(item))
        except (TypeError, ValueError):
            continue
    return ids


class NodeConnectionsView(APIView):
    """Account-level SABnzbd / *arr connections. Nodes receive a copy only when synced."""

    permission_classes = (AllowAny,)

    def get(self, request: Request) -> Response:
        user = _resolve_user(request)
        if not user:
            return Response({"usenet": {}, "radarr": {}, "sonarr": {}, "configured": {}})
        return Response(serialized_store(user))

    def put(self, request: Request) -> Response:
        user = _resolve_user(request)
        if not user:
            return Response({"usenet": {}, "radarr": {}, "sonarr": {}, "configured": {}})
        return Response(store_all(user, _request_payload(request)))

    def post(self, request: Request) -> Response:
        return self.put(request)


class NodeConnectionsSyncView(APIView):
    """Push stored connections onto chosen Otix nodes (or every node)."""

    permission_classes = (AllowAny,)

    def post(self, request: Request) -> Response:
        user = _resolve_user(request)
        if not user:
            return Response({"results": []})
        payload = _request_payload(request)
        results = push_shared_to_servers(user, _requested_server_ids(payload))
        return Response({"results": results})


class GameServerConnectionsSyncView(APIView):
    """Push stored connections onto one Otix node."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        user = _resolve_user(request)
        if user and server.user_id and server.user_id != user.id:
            raise NotFound("Otix node not found")
        kinds = push_shared_connections(server)
        return Response({"ok": True, "server_id": server.id, "kinds": kinds})


class GameServerInstancesImportView(APIView):
    """Copy SABnzbd / *arr instances from another node onto this one."""

    permission_classes = (AllowAny,)

    def post(self, request: Request, server_id: int) -> Response:
        dest = _get_server_or_404(request, server_id)
        payload = _request_payload(request)
        raw_source = payload.get("from_server_id", payload.get("fromServerId"))
        try:
            source_id = int(raw_source)
        except (TypeError, ValueError):
            return Response(
                {"error": "from_server_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        source = _get_server_or_404(request, source_id)
        kinds = payload.get("kinds")
        if isinstance(kinds, str):
            kinds = [kinds]
        if kinds is not None and not isinstance(kinds, list):
            kinds = None
        user = _resolve_user(request)
        if not user:
            return Response({"error": "User not found"}, status=status.HTTP_400_BAD_REQUEST)
        result = import_instances(user, dest, source, kinds)
        if result.get("error") and not result.get("imported"):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


KNOWN_GAME_STEAM_APP_IDS = {
    "valheim": "892970",
    "bloons td 6": "960090",
    "bloonstd6": "960090",
    "counter-strike 2": "730",
    "cs2": "730",
    "brawlhalla": "291550",
    "sid meier's civilization vii": "2358720",
    "civilization vii": "2358720",
    "transport fever 2": "1066780",
    "transport fever 3": "1066780",
    "baldur's gate 3": "1086940",
    "baldurs gate 3": "1086940",
    "cyberpunk 2077": "1091500",
    "elden ring": "1245620",
    "factorio": "427520",
    "palworld": "1623730",
    "hades": "1145360",
    "hades ii": "1145350",
    "hades 2": "1145350",
    "helldivers 2": "553850",
    "black myth: wukong": "2358720",
    "black myth wukong": "2358720",
    "grand theft auto v": "271590",
    "gta v": "271590",
    "gta 5": "271590",
    "red dead redemption 2": "1174180",
    "rdr2": "1174180",
    "the witcher 3": "292030",
    "the witcher 3: wild hunt": "292030",
    "witcher 3": "292030",
    "rust": "252490",
    "terraria": "105600",
    "stardew valley": "413150",
    "hollow knight": "367520",
    "dead cells": "588650",
    "slay the spire": "646570",
    "balatro": "2379780",
    "god of war": "1593500",
    "sekiro": "814380",
    "sekiro: shadows die twice": "814380",
    "dark souls 3": "374320",
    "forza horizon 5": "1551360",
    "hogwarts legacy": "990080",
    "destiny 2": "1085660",
    "fallout 4": "377160",
    "skyrim": "489830",
    "rocket league": "252950",
    "dead by daylight": "381210",
    "rimworld": "294100",
    "subnautica": "264710",
    "deep rock galactic": "548430",
}


def hydrate_game_to_otix(
    title: str = "",
    steam_app_id: int | str | None = None,
    igdb_id: int | str | None = None,
) -> Any | None:
    """Resolve and fully hydrate a missing game into the Otix catalog via IGDB."""
    from apps.media.models import MediaItem
    from apps.media.services.catalog import attach_media_urls
    from apps.media.services.identity import attach_external_id, find_media_id
    from apps.media.services.igdb import IGDBProvider, configured
    from core.providers.igdb.hydrators import seed_game_from_igdb
    from core.providers.igdb.schemas import GAME_HYDRATION_FIELDS

    if not configured():
        return None

    try:
        provider = IGDBProvider()
    except Exception as exc:
        logger.debug("IGDB provider unavailable: %s", exc)
        return None

    resolved_igdb_id: int | None = None
    if igdb_id:
        try:
            resolved_igdb_id = int(str(igdb_id).replace("igdb:", "").strip())
        except (ValueError, TypeError):
            pass

    if resolved_igdb_id is None and steam_app_id:
        try:
            steam_int = int(str(steam_app_id).replace("steam_", "").strip())
            steam_to_igdb = provider.lookup_steam_app_ids([steam_int])
            resolved_igdb_id = steam_to_igdb.get(steam_int)
        except Exception as exc:
            logger.debug("Failed looking up steam_app_id %s on IGDB: %s", steam_app_id, exc)

    if resolved_igdb_id is None and title:
        try:
            from apps.media.services.game_matcher import _comparison_key

            target_key = _comparison_key(title)
            candidates = provider.search_games_by_name(title, limit=10, fields="id,name,slug")
            for c in candidates:
                if _comparison_key(c.get("name") or "") == target_key:
                    resolved_igdb_id = c.get("id")
                    break
            if resolved_igdb_id is None:
                candidates = provider.search_games(title, limit=10, fields="id,name,slug")
                for c in candidates:
                    if _comparison_key(c.get("name") or "") == target_key:
                        resolved_igdb_id = c.get("id")
                        break
        except Exception as exc:
            logger.debug("Failed searching IGDB for title '%s': %s", title, exc)

    if resolved_igdb_id is None:
        return None

    try:
        existing_id = find_media_id("igdb", str(resolved_igdb_id), "game")
        if existing_id:
            media = MediaItem.objects.filter(pk=existing_id).prefetch_related("assets").first()
            if media:
                attach_media_urls([media])
                if steam_app_id:
                    attach_external_id(
                        media.pk, "steam", str(steam_app_id).replace("steam_", "").strip(), "game"
                    )
                return media

        raw_game = provider.get_game(resolved_igdb_id, fields=GAME_HYDRATION_FIELDS)
        if not raw_game:
            return None

        media_id = seed_game_from_igdb(raw_game, resolved_igdb_id)
        if steam_app_id:
            attach_external_id(
                media_id, "steam", str(steam_app_id).replace("steam_", "").strip(), "game"
            )

        media = MediaItem.objects.filter(pk=media_id).prefetch_related("assets").first()
        if media:
            attach_media_urls([media])
        return media
    except Exception as exc:
        logger.warning(
            "Failed fully hydrating game '%s' (igdb_id=%s): %s", title, resolved_igdb_id, exc
        )
        return None


def enrich_sessions_with_media(sessions: list[dict]) -> list[dict]:
    """Enrich play session dictionaries with full Otix catalog data, fully hydrating missing games."""
    if not sessions:
        return sessions

    from django.contrib.contenttypes.models import ContentType

    from apps.media.models import ExternalID, MediaItem
    from apps.media.services.catalog import attach_media_urls
    from apps.media.services.game_matcher import _comparison_key

    media_ct = ContentType.objects.get_for_model(MediaItem)

    numeric_ids: list[int] = []
    titles: set[str] = set()
    slugs: set[str] = set()
    steam_candidates: set[str] = set()
    igdb_candidates: set[str] = set()

    for s in sessions:
        gid = str(s.get("game_id") or s.get("gameId") or "").strip()
        title = str(s.get("game_title") or s.get("gameTitle") or "").strip()
        steam_app = str(s.get("steam_app_id") or s.get("steamAppId") or "").strip()
        if steam_app and steam_app.isdigit():
            steam_candidates.add(steam_app)
        if gid:
            if gid.startswith("igdb:"):
                raw = gid.replace("igdb:", "").strip()
                if raw.isdigit():
                    numeric_ids.append(int(raw))
                    igdb_candidates.add(raw)
            elif gid.startswith("steam_") or gid.startswith("steam-"):
                candidate = gid.replace("steam_", "").replace("steam-", "").strip()
                if candidate.isdigit():
                    steam_candidates.add(candidate)
            elif gid.isdigit():
                numeric_ids.append(int(gid))
                steam_candidates.add(gid)
            else:
                slugs.add(gid.lower())
        if title:
            titles.add(title)
            clean_title = title.lower()
            norm_key = clean_title.replace(":", "").replace("-", " ").replace("  ", " ").strip()
            known_app_id = KNOWN_GAME_STEAM_APP_IDS.get(clean_title) or KNOWN_GAME_STEAM_APP_IDS.get(norm_key)
            if known_app_id:
                steam_candidates.add(known_app_id)

    q = Q()
    if numeric_ids:
        q |= Q(id__in=numeric_ids)
    if slugs:
        q |= Q(slug__in=list(slugs))
    if titles:
        q |= Q(title__in=list(titles)) | Q(title__in=[t.lower() for t in titles])

    media_items: list[MediaItem] = []
    if q:
        try:
            media_items = list(
                MediaItem.objects.filter(media_type="game")
                .filter(q)
                .prefetch_related("assets")[:100]
            )
        except Exception as exc:
            logger.debug("Failed querying MediaItems for sessions: %s", exc)

    # Resolve ExternalID matches separately for Steam and IGDB to avoid collisions
    ext_q = Q()
    if steam_candidates:
        ext_q |= Q(provider="steam", external_id__in=list(steam_candidates))
    if igdb_candidates:
        ext_q |= Q(provider="igdb", external_id__in=list(igdb_candidates))

    if ext_q:
        try:
            ext_rows = list(
                ExternalID.objects.filter(
                    content_type=media_ct,
                ).filter(ext_q)
            )
            extra_ids = [r.object_id for r in ext_rows if r.object_id]
            if extra_ids:
                existing_ids = {m.id for m in media_items}
                new_ids = [x for x in extra_ids if x not in existing_ids]
                if new_ids:
                    extra_items = list(
                        MediaItem.objects.filter(media_type="game", pk__in=new_ids).prefetch_related("assets")
                    )
                    media_items.extend(extra_items)
        except Exception as exc:
            logger.debug("Failed querying ExternalIDs for sessions: %s", exc)

    if media_items:
        attach_media_urls(media_items)

    by_id = {str(m.id): m for m in media_items}
    by_slug = {m.slug.lower(): m for m in media_items}
    by_title = {m.title.lower().strip(): m for m in media_items}
    by_key = {_comparison_key(m.title): m for m in media_items}

    # Map external_id -> MediaItem PER PROVIDER
    by_steam_ext: dict[str, MediaItem] = {}
    by_igdb_ext: dict[str, MediaItem] = {}
    if media_items:
        try:
            m_ids = [m.id for m in media_items]
            for ext in ExternalID.objects.filter(content_type=media_ct, object_id__in=m_ids):
                if str(ext.object_id) in by_id:
                    if ext.provider == "steam":
                        by_steam_ext[str(ext.external_id)] = by_id[str(ext.object_id)]
                    elif ext.provider == "igdb":
                        by_igdb_ext[str(ext.external_id)] = by_id[str(ext.object_id)]
        except Exception:
            pass

    for s in sessions:
        gid = str(s.get("game_id") or s.get("gameId") or "").strip()
        raw_title = str(s.get("game_title") or s.get("gameTitle") or "").strip()
        clean_title = raw_title.lower()
        norm_key = clean_title.replace(":", "").replace("-", " ").replace("  ", " ").strip()

        candidate_steam_id: str | None = None
        if s.get("steam_app_id") or s.get("steamAppId"):
            candidate_steam_id = str(s.get("steam_app_id") or s.get("steamAppId")).strip()
        elif gid.startswith("steam_"):
            raw_c = gid.replace("steam_", "").strip()
            if raw_c.isdigit():
                candidate_steam_id = raw_c
        elif gid.startswith("steam-"):
            raw_c = gid.replace("steam-", "").strip()
            if raw_c.isdigit():
                candidate_steam_id = raw_c
        elif gid.isdigit() and int(gid) > 1000:
            candidate_steam_id = gid
        if not candidate_steam_id:
            candidate_steam_id = KNOWN_GAME_STEAM_APP_IDS.get(clean_title) or KNOWN_GAME_STEAM_APP_IDS.get(norm_key)

        igdb_id_cand: str | None = None
        if gid.startswith("igdb:"):
            igdb_id_cand = gid.replace("igdb:", "").strip()

        matched = (
            by_id.get(gid)
            or (candidate_steam_id and by_steam_ext.get(candidate_steam_id))
            or (igdb_id_cand and by_igdb_ext.get(igdb_id_cand))
            or by_slug.get(gid.lower())
            or by_title.get(clean_title)
            or by_key.get(_comparison_key(raw_title))
        )

        # If game is not in Otix, fully hydrate it from IGDB!
        if not matched and (raw_title or candidate_steam_id or igdb_id_cand):
            hydrated = hydrate_game_to_otix(
                title=raw_title,
                steam_app_id=candidate_steam_id,
                igdb_id=igdb_id_cand,
            )
            if hydrated:
                matched = hydrated
                try:
                    attach_media_urls([hydrated])
                except Exception:
                    pass
                by_id[str(hydrated.id)] = hydrated
                by_slug[hydrated.slug.lower()] = hydrated
                by_title[hydrated.title.lower().strip()] = hydrated
                by_key[_comparison_key(hydrated.title)] = hydrated
                if candidate_steam_id:
                    by_steam_ext[candidate_steam_id] = hydrated
                if igdb_id_cand:
                    by_igdb_ext[igdb_id_cand] = hydrated

        if matched:
            s["poster_url"] = getattr(matched, "poster_url", None) or s.get("poster_url")
            s["backdrop_url"] = getattr(matched, "backdrop_url", None) or s.get("backdrop_url")
            s["banner_url"] = getattr(matched, "banner_url", None) or getattr(matched, "logo_url", None) or s.get("banner_url")
            s["slug"] = getattr(matched, "slug", None) or s.get("slug")
            s["game_title"] = getattr(matched, "title", None) or s.get("game_title")
            s["gameTitle"] = getattr(matched, "title", None) or s.get("gameTitle")
            s["otix_media_id"] = str(matched.id)
            s["media_item_id"] = str(matched.id)

        # Fallback to Steam CDN if poster still absent
        if not s.get("poster_url"):
            app_id = candidate_steam_id
            if app_id:
                s["poster_url"] = f"https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{app_id}/library_600x900.jpg"
                if not s.get("backdrop_url"):
                    s["backdrop_url"] = f"https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{app_id}/page_bg_generated_v6b.jpg"

    return sessions


class GameServerSessionsView(APIView):
    """GET /library/servers/{server_id}/sessions — proxy play sessions from a specific node."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        limit = int(request.query_params.get("limit", 100))
        code, body = node_get_sessions(server, limit=limit)
        if code == 200 and isinstance(body, list):
            body = enrich_sessions_with_media(body)
        return Response(body, status=code)


class UserGameSessionsView(APIView):
    """GET /library/game-sessions — aggregate play sessions across user's active node(s).
    POST /library/game-sessions — hydrate and enrich arbitrary play sessions with Otix catalog data.
    """

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request) -> Response:
        user = request.user
        servers = list(UserGameServer.objects.filter(user=user, is_online=True))
        if not servers:
            servers = list(UserGameServer.objects.filter(user=user)[:3])

        limit = int(request.query_params.get("limit", 100))
        all_sessions: list[dict] = []
        seen_ids = set()

        for server in servers:
            try:
                code, body = node_get_sessions(server, limit=limit)
                if code == 200 and isinstance(body, list):
                    for sess in body:
                        sess_id = sess.get("id") or f"{sess.get('game_id')}-{sess.get('start_time')}"
                        if sess_id not in seen_ids:
                            seen_ids.add(sess_id)
                            all_sessions.append(sess)
            except Exception as exc:
                logger.debug("Failed to fetch sessions from server %s: %s", server.id, exc)

        def sort_key(s):
            return s.get("end_time") or s.get("start_time") or ""

        all_sessions.sort(key=sort_key, reverse=True)
        enriched = enrich_sessions_with_media(all_sessions[:limit])
        return Response(enriched)

    def post(self, request: Request) -> Response:
        """POST /library/game-sessions — hydrate and enrich input sessions with Otix catalog data."""
        data = request.data
        sessions: list[dict] = []
        if isinstance(data, dict):
            raw = data.get("sessions")
            if isinstance(raw, list):
                sessions = raw
        elif isinstance(data, list):
            sessions = data
        enriched = enrich_sessions_with_media(sessions)
        return Response(enriched)


class GameServerRunningView(APIView):
    """GET /library/servers/{server_id}/running — proxy currently running game(s) from a specific node."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        code, body = node_get_running_games(server)
        if code == 200 and isinstance(body, dict):
            games = body.get("games")
            if isinstance(games, list) and games:
                items = [
                    dict(g, game_id=g.get("id"), game_title=g.get("title"))
                    for g in games
                    if isinstance(g, dict)
                ]
                enriched = enrich_sessions_with_media(items)
                for orig, enr in zip(games, enriched, strict=False):
                    if isinstance(orig, dict):
                        orig.setdefault("poster_url", enr.get("poster_url"))
                        orig.setdefault("backdrop_url", enr.get("backdrop_url"))
                        orig.setdefault("otix_media_id", enr.get("otix_media_id"))
            elif body.get("game") and isinstance(body.get("game"), dict):
                single = body["game"]
                items = [dict(single, game_id=single.get("id"), game_title=single.get("title"))]
                enriched = enrich_sessions_with_media(items)
                if enriched:
                    single.setdefault("poster_url", enriched[0].get("poster_url"))
                    single.setdefault("backdrop_url", enriched[0].get("backdrop_url"))
                    single.setdefault("otix_media_id", enriched[0].get("otix_media_id"))
        return Response(body, status=code)


class UserGameRunningView(APIView):
    """GET /library/game-running — aggregate currently running games across user's active node(s)."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request) -> Response:
        user = request.user
        servers = list(UserGameServer.objects.filter(user=user, is_online=True))
        if not servers:
            servers = list(UserGameServer.objects.filter(user=user)[:3])

        all_running_games: list[dict] = []
        seen_ids = set()

        for server in servers:
            try:
                code, body = node_get_running_games(server)
                if code == 200 and isinstance(body, dict):
                    games = body.get("games")
                    if isinstance(games, list):
                        for g in games:
                            if isinstance(g, dict):
                                gid = g.get("id") or g.get("game_id") or g.get("exe_path")
                                if gid and gid not in seen_ids:
                                    seen_ids.add(gid)
                                    all_running_games.append(g)
                    elif body.get("running") and isinstance(body.get("game"), dict):
                        g = body["game"]
                        gid = g.get("id") or g.get("game_id") or g.get("exe_path")
                        if gid and gid not in seen_ids:
                            seen_ids.add(gid)
                            all_running_games.append(g)
            except Exception as exc:
                logger.debug("Failed to fetch running games from server %s: %s", server.id, exc)

        if all_running_games:
            items = [
                dict(g, game_id=g.get("id"), game_title=g.get("title"))
                for g in all_running_games
            ]
            enriched = enrich_sessions_with_media(items)
            for orig, enr in zip(all_running_games, enriched, strict=False):
                orig.setdefault("poster_url", enr.get("poster_url"))
                orig.setdefault("backdrop_url", enr.get("backdrop_url"))
                orig.setdefault("otix_media_id", enr.get("otix_media_id"))

        single = all_running_games[0] if all_running_games else None
        return Response({
            "running": len(all_running_games) > 0,
            "game": single,
            "games": all_running_games,
        })


# Modern Node view aliases
NodeListCreateView = GameServerListCreateView
NodeDetailView = GameServerDetailView
NodePingView = GameServerPingView
NodeClaimView = GameServerClaimView
NodeClaimDirectView = GameServerClaimDirectView
NodePendingView = GameServerPendingView
NodeProbeView = GameServerProbeView
NodeInstancesImportView = GameServerInstancesImportView
NodeExplorerBrowseView = GameServerExplorerBrowseView
NodeExplorerSetPathView = GameServerExplorerSetPathView
NodeExplorerCreateFolderView = GameServerExplorerCreateFolderView
NodeProvidersView = GameServerProvidersView
NodeProviderTestView = GameServerProviderTestView
NodeDownloadsSearchView = GameServerDownloadsSearchView
NodeDownloadsAddView = GameServerDownloadsAddView
NodeDownloadsQueueView = GameServerDownloadsQueueView
NodeDownloadsHistoryView = GameServerDownloadsHistoryView
NodeFilesView = GameServerFilesView
NodeHeartbeatView = GameServerHeartbeatView
NodeLibrariesView = GameServerLibrariesView
NodeOrganizeView = GameServerOrganizeView
NodeScanView = GameServerScanView
NodeScanClearView = GameServerScanClearView
NodeSessionsView = GameServerSessionsView
NodeRunningView = GameServerRunningView
NodeUnclaimView = GameServerUnclaimView

