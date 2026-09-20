"""Game server API views: self-hosted otix-server node management and library indexing."""

import logging
from pathlib import Path

import httpx
from django.db.utils import OperationalError, ProgrammingError
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.library.models import UserGameServer
from apps.library.serializers import (
    UserGameServerCreateSerializer,
    UserGameServerSerializer,
)
from apps.library.services.download_history import (
    apply_history_slots,
    apply_queue_progress,
    list_download_history,
    mark_download_cancelled,
    proxy_download_payload,
    record_queued_download,
)
from apps.library.services.game_server import (
    apply_node_heartbeat,
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
    explorer_set_download_path,
    link_or_create_game_server,
    list_pending_nodes_for,
    node_get_organize,
    node_list_libraries,
    node_replace_libraries,
    node_save_organize,
    ping_server_sync,
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
    read_with_shared,
    save_store_and_node,
    serialized_store,
    store_all,
)
from apps.library.services.server_catalog import match_files_to_catalog, unmatched_scan_titles
from apps.search.services.search import enqueue_prehydrate_titles

logger = logging.getLogger(__name__)


def _track_download_history(fn, *args, **kwargs):
    """History writes must never fail the live SABnzbd proxy."""
    try:
        return fn(*args, **kwargs)
    except (OperationalError, ProgrammingError) as exc:
        logger.warning("download history skipped: %s", exc)
        return None


def _get_server_or_404(request: Request, server_id: int) -> UserGameServer:
    from apps.library.services.backend_node import backend_server_stub, is_backend_node_id

    if is_backend_node_id(server_id):
        if not getattr(request, "user", None) or not request.user.is_authenticated:
            raise NotFound("Otix node not found")
        return backend_server_stub(request.user)
    server = None
    if getattr(request, "user", None) and request.user.is_authenticated:
        server = UserGameServer.objects.filter(id=server_id, user=request.user).first()
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

    def get(self, request: Request) -> Response:
        from apps.library.services.backend_node import backend_node_payload

        collapse_duplicate_game_servers(request.user)
        servers = UserGameServer.objects.filter(user=request.user)
        payload = [backend_node_payload(request.user), *UserGameServerSerializer(servers, many=True).data]
        return Response(payload)

    def post(self, request: Request) -> Response:
        serializer = UserGameServerCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        server, created = link_or_create_game_server(request.user, serializer.validated_data)
        result = ping_server_sync(server)
        server.refresh_from_db()
        payload = UserGameServerSerializer(server).data
        payload["connect_error"] = None if result.get("online") else result.get("error")
        payload["created"] = created
        payload["shared_connections"] = configured_map(request.user)
        return Response(
            payload,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class GameServerHeartbeatView(APIView):
    """``POST /api/v1/servers/heartbeat`` — otix-server announces itself (no auth)."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request: Request) -> Response:
        apply_node_heartbeat(request.data if isinstance(request.data, dict) else {})
        return Response({"status": "ok"})


class GameServerPendingView(APIView):
    """``GET /api/v1/library/servers/pending`` — nodes that heartbeated but are not claimed."""

    def get(self, request: Request) -> Response:
        return Response(list_pending_nodes_for(request.user))


class GameServerDetailView(APIView):
    """``PATCH /api/v1/library/servers/{server_id}`` — update server configuration.
    ``DELETE /api/v1/library/servers/{server_id}`` — remove connected server.
    """

    def _get_server(self, request: Request, server_id: int) -> UserGameServer:
        from apps.library.services.backend_node import is_backend_node_id

        if is_backend_node_id(server_id):
            raise NotFound("The Otix backend node cannot be edited or removed.")
        try:
            return UserGameServer.objects.get(id=server_id, user=request.user)
        except UserGameServer.DoesNotExist:
            raise NotFound("Otix node not found") from None

    def patch(self, request: Request, server_id: int) -> Response:
        server = self._get_server(request, server_id)
        serializer = UserGameServerCreateSerializer(server, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        server = serializer.save()
        ping_server_sync(server)
        server.refresh_from_db()
        return Response(UserGameServerSerializer(server).data)

    def delete(self, request: Request, server_id: int) -> Response:
        server = self._get_server(request, server_id)
        server.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GameServerPingView(APIView):
    """``POST /api/v1/library/servers/{server_id}/ping`` — test server connectivity."""

    def post(self, request: Request, server_id: int) -> Response:
        from apps.library.services.backend_node import backend_node_payload, is_backend_node

        server = _get_server_or_404(request, server_id)
        result = ping_server_sync(server)
        if is_backend_node(server):
            return Response({**result, "server": backend_node_payload(request.user)})
        server.refresh_from_db()
        return Response(
            {
                **result,
                "server": UserGameServerSerializer(server).data,
            }
        )


class GameServerFilesView(APIView):
    """``GET /api/v1/library/server-games`` — aggregate hosted games from user servers."""

    def get(self, request: Request) -> Response:
        servers = UserGameServer.objects.filter(user=request.user, is_active=True)
        files_out = []
        errors = []

        for s in servers:
            public_url = (s.primary_url or "").rstrip("/")
            if not public_url:
                continue
            headers = {}
            if s.auth_token:
                headers["Authorization"] = f"Bearer {s.auth_token}"

            last_error = None
            fetched = False
            for target_url in contact_urls(public_url):
                try:
                    with httpx.Client(timeout=4.0) as client:
                        resp = client.get(f"{target_url}/api/v1/files", headers=headers)
                    if resp.status_code == 200:
                        raw_files = resp.json()
                        for f in raw_files:
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
                                    "filename": f.get("filename"),
                                    "filesize": f.get("filesize", 0),
                                    "extension": f.get("extension", ""),
                                    "format_category": f.get("format_category", "installer"),
                                    "game_title": f.get("game_title", ""),
                                    "relative_path": relative_path,
                                    "filepath": filepath,
                                    "library_name": f.get("library_name", "Default"),
                                    "modified_at": f.get("modified_at"),
                                    "download_url": f"{public_url}/api/v1/files/{file_id}/download",
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
                "servers": UserGameServerSerializer(servers, many=True).data,
                "files": files_out,
                "errors": errors if errors else None,
            }
        )


class GameServerExplorerBrowseView(APIView):
    """``GET /api/v1/library/servers/{server_id}/explorer`` — browse server filesystem."""

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)

        path = request.query_params.get("path")
        status_code, data = explorer_browse(server, path=path)
        return Response(data, status=status_code)


class GameServerExplorerSetPathView(APIView):
    """Assign the server download folder via explorer/set-download-path."""

    def post(self, request: Request, server_id: int) -> Response:
        from apps.library.services.backend_node import is_backend_node

        server = _get_server_or_404(request, server_id)

        path = request.data.get("path")
        if not path:
            return Response({"detail": "path is required"}, status=status.HTTP_400_BAD_REQUEST)

        create_if_missing = request.data.get("create_if_missing", True)
        add_as_library = request.data.get("add_as_library", True)

        status_code, data = explorer_set_download_path(
            server, path=path, create_if_missing=create_if_missing, add_as_library=add_as_library
        )
        if status_code == 200 and not is_backend_node(server):
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


class GameServerUsenetConfigView(APIView):
    """``GET /api/v1/library/servers/{server_id}/usenet/config`` — get usenet config
    ``POST /api/v1/library/servers/{server_id}/usenet/config`` — save usenet config
    """

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = read_with_shared(server.user, "usenet", server, usenet_get_config)
        return Response(data, status=status_code)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = save_store_and_node(
            server.user, "usenet", request.data, server, usenet_save_config
        )
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


# ── Radarr Views ────────────────────────────────────────────────────────


class GameServerRadarrConfigView(APIView):
    """``GET /api/v1/library/servers/{server_id}/radarr/config`` — get Radarr config.
    ``POST /api/v1/library/servers/{server_id}/radarr/config`` — save Radarr config.
    """

    permission_classes = (AllowAny,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = read_with_shared(server.user, "radarr", server, radarr_get_config)
        return Response(data, status=status_code)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = save_store_and_node(
            server.user, "radarr", request.data, server, radarr_save_config
        )
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
        status_code, data = read_with_shared(server.user, "sonarr", server, sonarr_get_config)
        return Response(data, status=status_code)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = save_store_and_node(
            server.user, "sonarr", request.data, server, sonarr_save_config
        )
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
        status_code, data = desktop_get_settings(server)
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

    def get(self, request: Request) -> Response:
        return Response(serialized_store(request.user))

    def put(self, request: Request) -> Response:
        return Response(store_all(request.user, _request_payload(request)))

    def post(self, request: Request) -> Response:
        return self.put(request)


class NodeConnectionsSyncView(APIView):
    """Push stored connections onto chosen Otix nodes (or every node)."""

    def post(self, request: Request) -> Response:
        payload = _request_payload(request)
        results = push_shared_to_servers(request.user, _requested_server_ids(payload))
        return Response({"results": results})


class GameServerConnectionsSyncView(APIView):
    """Push stored connections onto one Otix node."""

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        if getattr(request.user, "is_authenticated", False) and server.user_id != request.user.id:
            raise NotFound("Otix node not found")
        kinds = push_shared_connections(server)
        return Response({"ok": True, "server_id": server.id, "kinds": kinds})


class GameServerInstancesImportView(APIView):
    """Copy SABnzbd / *arr instances from another node onto this one."""

    def post(self, request: Request, server_id: int) -> Response:
        dest = _get_server_or_404(request, server_id)
        payload = _request_payload(request)
        raw_source = payload.get("from_server_id", payload.get("fromServerId"))
        try:
            source_id = int(raw_source)
        except (TypeError, ValueError):
            return Response({"error": "from_server_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        source = _get_server_or_404(request, source_id)
        kinds = payload.get("kinds")
        if isinstance(kinds, str):
            kinds = [kinds]
        if kinds is not None and not isinstance(kinds, list):
            kinds = None
        result = import_instances(request.user, dest, source, kinds)
        if result.get("error") and not result.get("imported"):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)
