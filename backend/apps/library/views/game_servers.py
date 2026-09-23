"""Backend-as-node API views: Django owns storage, explorer, and downloaders."""

import logging
from pathlib import Path

from django.db.utils import OperationalError, ProgrammingError
from rest_framework import status
from rest_framework.exceptions import NotAuthenticated, NotFound
from rest_framework.permissions import IsAuthenticated
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


def _resolve_user(request: Request):
    user = getattr(request, "user", None)
    if user and getattr(user, "is_authenticated", False):
        return user
    raise NotAuthenticated("Authentication required")


def _get_server_or_404(request: Request, server_id: int) -> UserGameServer:
    """Only the Django backend node (-2) is a valid product node."""
    from apps.library.services.backend_node import backend_server_stub, is_backend_node_id

    resolved_user = _resolve_user(request)
    if is_backend_node_id(server_id):
        return backend_server_stub(resolved_user)
    raise NotFound("Otix node not found")


def _public_api_origin(request: Request) -> str:
    """Scheme+host used by desktop Range clients to rebuild /api/v1/files/... URLs."""
    return request.build_absolute_uri("/").rstrip("/")


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
    """``GET /api/v1/library/servers`` — the Django backend node.

    ``POST`` is retired (separate Otix Server registration is gone).
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        from apps.library.services.backend_node import backend_node_payload

        user = _resolve_user(request)
        return Response([backend_node_payload(user)])

    def post(self, request: Request) -> Response:
        return Response(
            {
                "detail": (
                    "Separate Otix Server nodes are retired. "
                    "Configure libraries and downloaders on the Otix backend node."
                )
            },
            status=status.HTTP_410_GONE,
        )


class GameServerHeartbeatView(APIView):
    """``POST /api/v1/servers/heartbeat`` — retired (no external node registry)."""

    authentication_classes = ()
    permission_classes = ()

    def post(self, request: Request) -> Response:
        return Response(
            {"detail": "Otix Server heartbeat is retired. Django is the node."},
            status=status.HTTP_410_GONE,
        )


class GameServerPendingView(APIView):
    """``GET /api/v1/library/servers/pending`` — always empty (no external nodes)."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        _resolve_user(request)
        return Response([])


class GameServerDetailView(APIView):
    """``PATCH /api/v1/library/servers/{server_id}`` — update server configuration.
    ``DELETE /api/v1/library/servers/{server_id}`` — remove connected server.
    """

    permission_classes = (IsAuthenticated,)

    def _get_server(self, request: Request, server_id: int) -> UserGameServer:
        from apps.library.services.backend_node import is_backend_node_id

        _resolve_user(request)
        if is_backend_node_id(server_id):
            raise NotFound("The Otix backend node cannot be edited or removed.")
        raise NotFound("Otix node not found")

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

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, server_id: int) -> Response:
        from apps.library.services.backend_node import backend_node_payload, is_backend_node

        server = _get_server_or_404(request, server_id)
        result = ping_server_sync(server)
        if is_backend_node(server):
            return Response({**result, "server": backend_node_payload(_resolve_user(request))})
        server.refresh_from_db()
        return Response(
            {
                **result,
                "server": UserGameServerSerializer(server).data,
            }
        )


class GameServerFilesView(APIView):
    """``GET /api/v1/library/server-games`` — hosted games from the Django backend node."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request) -> Response:
        from apps.library.services import node_indexer
        from apps.library.services.backend_node import (
            BACKEND_NODE_ID,
            BACKEND_NODE_NAME,
            backend_node_payload,
        )

        user = _resolve_user(request)
        origin = _public_api_origin(request)
        files = node_indexer.list_indexed_files(ensure_scanned=True, user=user)
        files_out = []
        for item in files:
            files_out.append(
                {
                    "server_id": BACKEND_NODE_ID,
                    "server_name": BACKEND_NODE_NAME,
                    "server_url": origin,
                    "file_id": item.id,
                    "filename": item.filename,
                    "filesize": item.filesize,
                    "extension": item.extension,
                    "format_category": item.format_category,
                    "game_title": item.game_title,
                    "relative_path": item.relative_path,
                    "filepath": item.filepath,
                    "library_name": item.library_name,
                    "modified_at": item.modified_at,
                    "download_url": f"{origin}/api/v1/files/{item.id}/download",
                }
            )

        match_files_to_catalog(files_out)
        enqueue_prehydrate_titles(unmatched_scan_titles(files_out))
        for file in files_out:
            file.pop("filepath", None)

        return Response(
            {
                "servers": [backend_node_payload(user)],
                "files": files_out,
                "errors": None,
            }
        )




class GameServerExplorerBrowseView(APIView):
    """``GET /api/v1/library/servers/{server_id}/explorer`` — browse server filesystem."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)

        path = request.query_params.get("path")
        status_code, data = explorer_browse(server, path=path)
        return Response(data, status=status_code)


class GameServerExplorerSetPathView(APIView):
    """Assign the server download folder via explorer/set-download-path."""

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = usenet_test_sabnzbd(server, request.data)
        return Response(data, status=status_code)


class GameServerUsenetTestProwlarrView(APIView):
    """Test the server's Prowlarr connection."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = usenet_test_prowlarr(server, request.data)
        return Response(data, status=status_code)


class GameServerUsenetSearchView(APIView):
    """Search Prowlarr indexers for games."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        query = request.query_params.get("query", "")
        if not query:
            return Response([], status=status.HTTP_200_OK)
        status_code, data = usenet_search(server, query)
        return Response(data, status=status_code)


class GameServerUsenetDownloadView(APIView):
    """``POST /api/v1/library/servers/{server_id}/usenet/download`` — send NZB to server SABnzbd."""

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = provider_list(server)
        return Response(data, status=status_code)


class GameServerProviderTestView(APIView):
    """Test connectivity for a named provider."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, server_id: int, provider_type: str, name: str) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = provider_test(server, provider_type, name)
        return Response(data, status=status_code)


class GameServerDownloadsSearchView(APIView):
    """Search across the server's active download providers."""

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        protocol = request.query_params.get("protocol")
        status_code, data = prowlarr_get_indexers(server, protocol=protocol)
        return Response(data, status=status_code)


class GameServerProwlarrSyncView(APIView):
    """Trigger a Prowlarr indexer sync on the server."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        protocol = request.query_params.get("protocol") or (
            request.data.get("protocol") if isinstance(request.data, dict) else None
        )
        status_code, data = prowlarr_sync_indexers(server, protocol=protocol)
        return Response(data, status=status_code)


class GameServerSabnzbdQueueControlView(APIView):
    """Pause or resume the SABnzbd download queue."""

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = scan_game_libraries(server)
        return Response(data, status=status_code)


# ── Radarr Views ────────────────────────────────────────────────────────


class GameServerRadarrConfigView(APIView):
    """``GET /api/v1/library/servers/{server_id}/radarr/config`` — get Radarr config.
    ``POST /api/v1/library/servers/{server_id}/radarr/config`` — save Radarr config.
    """

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = radarr_test(server, request.data)
        return Response(data, status=status_code)


class GameServerRadarrRootFoldersView(APIView):
    """``GET /api/v1/library/servers/{server_id}/radarr/rootfolders`` — list root folders."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = radarr_get_root_folders(server, instance_id=_arr_instance_id(request))
        return Response(data, status=status_code)


class GameServerRadarrQualityProfilesView(APIView):
    """List Radarr quality profiles for the server."""

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = sonarr_test(server, request.data)
        return Response(data, status=status_code)


class GameServerSonarrRootFoldersView(APIView):
    """``GET /api/v1/library/servers/{server_id}/sonarr/rootfolders`` — list root folders."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        status_code, data = sonarr_get_root_folders(server, instance_id=_arr_instance_id(request))
        return Response(data, status=status_code)


class GameServerSonarrQualityProfilesView(APIView):
    """List Sonarr quality profiles for the server."""

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

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

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request) -> Response:
        user = _resolve_user(request)
        if not user:
            return Response({"results": []})
        payload = _request_payload(request)
        results = push_shared_to_servers(user, _requested_server_ids(payload))
        return Response({"results": results})


class GameServerConnectionsSyncView(APIView):
    """Push stored connections onto one Otix node."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_server_or_404(request, server_id)
        user = _resolve_user(request)
        if user and server.user_id and server.user_id != user.id:
            raise NotFound("Otix node not found")
        kinds = push_shared_connections(server)
        return Response({"ok": True, "server_id": server.id, "kinds": kinds})


class GameServerInstancesImportView(APIView):
    """Copy SABnzbd / *arr instances from another node onto this one."""

    permission_classes = (IsAuthenticated,)

    def post(self, request: Request, server_id: int) -> Response:
        dest = _get_server_or_404(request, server_id)
        payload = _request_payload(request)
        raw_source = payload.get("from_server_id", payload.get("fromServerId"))
        try:
            source_id = int(raw_source)
        except (TypeError, ValueError):
            return Response(
                {"error": "from_server_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
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


class HostedFileDownloadView(APIView):
    """``GET /api/v1/files/{file_id}/download`` — Range-capable hosted file stream."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request, file_id: str):
        from apps.library.services import node_indexer
        from apps.library.services.node_streaming import stream_file_response

        _resolve_user(request)
        hosted = node_indexer.get_hosted_file(file_id)
        if hosted is None:
            # Lazy scan once if index is cold.
            node_indexer.list_indexed_files(ensure_scanned=True, user=request.user)
            hosted = node_indexer.get_hosted_file(file_id)
        if hosted is None:
            return Response({"detail": "File not found"}, status=status.HTTP_404_NOT_FOUND)
        return stream_file_response(
            hosted.filepath,
            range_header=request.headers.get("Range") or request.META.get("HTTP_RANGE"),
            download_name=hosted.filename,
        )


class ExplorerFileDownloadView(APIView):
    """``GET /api/v1/explorer/download?path=`` — Range-capable explorer file stream."""

    permission_classes = (IsAuthenticated,)

    def get(self, request: Request):

        from apps.library.services.node_streaming import stream_file_response

        _resolve_user(request)
        raw_path = request.query_params.get("path")
        if not raw_path:
            return Response({"detail": "path is required"}, status=status.HTTP_400_BAD_REQUEST)
        target = Path(raw_path).expanduser().resolve()
        if not target.is_file():
            return Response({"detail": "File not found"}, status=status.HTTP_404_NOT_FOUND)
        return stream_file_response(
            target,
            range_header=request.headers.get("Range") or request.META.get("HTTP_RANGE"),
            download_name=target.name,
        )
