"""Reachability of the otix node from the API process (Docker vs host URLs)."""

import os
from unittest import mock

import httpx
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase

from apps.library.models import UserGameServer
from apps.library.services.game_server import contact_urls, ping_server_sync

User = get_user_model()


class ContactUrlTests(SimpleTestCase):
    def test_loopback_is_rewritten_when_docker_host_is_set(self):
        with mock.patch.dict(os.environ, {"OTIX_SERVER_DOCKER_HOST": "node"}):
            urls = contact_urls("http://127.0.0.1:8090")
        self.assertEqual(urls[0], "http://node:8090")
        self.assertIn("http://127.0.0.1:8090", urls)

    def test_localhost_is_rewritten_the_same_way(self):
        with mock.patch.dict(os.environ, {"OTIX_SERVER_DOCKER_HOST": "node"}):
            urls = contact_urls("http://localhost:8090")
        self.assertIn("http://node:8090", urls)

    def test_lan_url_is_left_alone(self):
        urls = contact_urls("http://192.168.1.50:8090")
        self.assertEqual(urls, ["http://192.168.1.50:8090"])


class PingLoopbackTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="nas_user", email="nas@example.com", password="password123"
        )

    @mock.patch.dict(os.environ, {"OTIX_SERVER_DOCKER_HOST": "node"})
    @mock.patch("apps.library.services.game_server.httpx.Client")
    def test_ping_without_token_is_online_via_docker_hostname(self, mock_client_cls):
        server = UserGameServer.objects.create(
            user=self.user,
            name="DK Game Storage Server",
            local_url="http://127.0.0.1:8090",
            auth_token="",
            is_online=False,
        )
        ok = mock.MagicMock()
        ok.status_code = 200
        ok.json.return_value = {
            "status": "online",
            "server_name": "DK Game Storage Server",
            "total_files": 4,
        }

        def get(url, headers=None):
            if "127.0.0.1" in url:
                raise httpx.ConnectError("Connection refused")
            self.assertEqual(url, "http://node:8090/api/v1/status")
            self.assertFalse(headers)
            return ok

        mock_client = mock.MagicMock()
        mock_client.get.side_effect = get
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        result = ping_server_sync(server)
        self.assertTrue(result["online"])
        server.refresh_from_db()
        self.assertTrue(server.is_online)
        self.assertEqual(server.local_url, "http://127.0.0.1:8090")
        self.assertEqual(server.total_files, 4)


class ServerProxyRequestFallbackTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="proxy_tester", email="proxy@example.com", password="password123"
        )

    @mock.patch("apps.library.services.node.httpx.Client")
    def test_proxy_falls_back_when_primary_network_unreachable(self, mock_client_cls):
        """Primary endpoint raises Errno 101, fallback endpoint succeeds."""
        from apps.library.services.node import server_proxy_request

        server = UserGameServer.objects.create(
            user=self.user,
            name="Remote NAS",
            remote_url="https://remote.nas.example:8090",
            local_url="http://192.168.1.150:8090",
            auth_token="secret",
            is_online=True,
            is_local=False,
        )
        ok_resp = mock.MagicMock()
        ok_resp.status_code = 200
        ok_resp.json.return_value = {"phase": "scanning", "files_scanned": 10}

        def mock_request(method, url, **kwargs):
            if "remote.nas.example" in url:
                raise httpx.ConnectError("[Errno 101] Network is unreachable")
            if "192.168.1.150" in url:
                return ok_resp
            raise httpx.ConnectError("Unknown target")

        mock_client = mock.MagicMock()
        mock_client.request.side_effect = mock_request
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        status_code, data = server_proxy_request(server, "POST", "/api/v1/scan")
        self.assertEqual(status_code, 200)
        self.assertEqual(data.get("phase"), "scanning")
        server.refresh_from_db()
        self.assertTrue(server.is_online)

    @mock.patch("apps.library.services.node.httpx.Client")
    def test_proxy_all_endpoints_fail_errno_101_returns_clean_502_and_marks_offline(
        self, mock_client_cls
    ):
        """When all targets fail with [Errno 101], return clean user-facing error and mark offline."""
        from apps.library.services.node import server_proxy_request

        server = UserGameServer.objects.create(
            user=self.user,
            name="Offline Server",
            remote_url="https://remote.offline.example:8090",
            local_url="http://192.168.1.200:8090",
            auth_token="token",
            is_online=True,
            is_local=False,
        )

        def mock_request(method, url, **kwargs):
            raise httpx.ConnectError("[Errno 101] Network is unreachable")

        mock_client = mock.MagicMock()
        mock_client.request.side_effect = mock_request
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        status_code, data = server_proxy_request(server, "POST", "/api/v1/scan")
        self.assertEqual(status_code, 502)
        # Verify no raw OS error exposed
        self.assertNotIn("[Errno 101]", data["detail"])
        self.assertIn("Network is unreachable", data["detail"])
        self.assertEqual(data.get("error"), "network_unreachable")
        self.assertEqual(data.get("code"), "node_unreachable")

        # Verify reachability state synchronized
        server.refresh_from_db()
        self.assertFalse(server.is_online)

    @mock.patch("apps.library.services.node.httpx.Client")
    def test_proxy_all_endpoints_fail_connection_refused_returns_clean_502(self, mock_client_cls):
        """When connection refused, return clean user-facing message and mark offline."""
        from apps.library.services.node import server_proxy_request

        server = UserGameServer.objects.create(
            user=self.user,
            name="Refused Server",
            local_url="http://127.0.0.1:8090",
            auth_token="token",
            is_online=True,
            is_local=True,
        )

        def mock_request(method, url, **kwargs):
            raise httpx.ConnectError("[Errno 111] Connection refused")

        mock_client = mock.MagicMock()
        mock_client.request.side_effect = mock_request
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        status_code, data = server_proxy_request(server, "POST", "/api/v1/scan")
        self.assertEqual(status_code, 502)
        self.assertNotIn("[Errno 111]", data["detail"])
        self.assertIn("Connection refused", data["detail"])
        self.assertEqual(data.get("error"), "connection_refused")

        server.refresh_from_db()
        self.assertFalse(server.is_online)

    @mock.patch("apps.library.services.node.httpx.Client")
    def test_scan_endpoints_unreachable_node_handling(self, mock_client_cls):
        """POST /scan fails with 502, marks node offline; GET /scan immediately returns idle."""
        from rest_framework.test import APIClient

        client = APIClient()
        client.force_authenticate(user=self.user)

        server = UserGameServer.objects.create(
            user=self.user,
            name="Scan Target Server",
            local_url="http://192.168.1.99:8090",
            auth_token="token",
            is_online=True,
            is_local=False,
        )

        def mock_request(method, url, **kwargs):
            raise httpx.ConnectError("[Errno 101] Network is unreachable")

        mock_client = mock.MagicMock()
        mock_client.request.side_effect = mock_request
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        # POST /scan fails cleanly
        post_res = client.post(f"/api/v1/library/servers/{server.id}/scan")
        self.assertEqual(post_res.status_code, 502)
        self.assertNotIn("[Errno 101]", post_res.json()["detail"])
        server.refresh_from_db()
        self.assertFalse(server.is_online)

        # GET /scan immediately reports not scanning / idle without hanging
        get_res = client.get(f"/api/v1/library/servers/{server.id}/scan")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["phase"], "idle")
        self.assertFalse(get_res.json()["is_scanning"])

    @mock.patch("apps.library.services.node.httpx.Client")
    def test_proxy_malformed_url_candidate_falls_back_to_valid_candidate(self, mock_client_cls):
        """Malformed URL string (invalid IPv6) does not raise unhandled ValueError and falls back to valid URL."""
        from apps.library.services.node import server_proxy_request

        server = UserGameServer.objects.create(
            user=self.user,
            name="Malformed Node",
            local_url="http://[invalid-ipv6",
            remote_url="http://node.fallback.lan:8090",
            auth_token="token",
            is_online=True,
            is_local=False,
        )
        ok_resp = mock.MagicMock()
        ok_resp.status_code = 200
        ok_resp.json.return_value = {"status": "ok"}

        def mock_request(method, url, **kwargs):
            if "node.fallback.lan" in url:
                return ok_resp
            raise httpx.ConnectError("Wrong target")

        mock_client = mock.MagicMock()
        mock_client.request.side_effect = mock_request
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        status_code, data = server_proxy_request(server, "GET", "/api/v1/status")
        self.assertEqual(status_code, 200)
        self.assertEqual(data.get("status"), "ok")

    def test_proxy_all_malformed_urls_returns_400(self):
        """When all configured URLs are malformed, returns 400 without crashing."""
        from apps.library.services.node import server_proxy_request

        server = UserGameServer(
            user=self.user,
            name="Broken Node",
            local_url="http://[invalid-ipv6",
            remote_url="http://localhost:999999",
            auth_token="token",
            is_local=False,
        )
        status_code, data = server_proxy_request(server, "GET", "/api/v1/status")
        self.assertEqual(status_code, 400)
        self.assertEqual(data.get("error"), "Server URL not configured")

    def test_cross_platform_darwin_errno_formatting(self):
        """Verify macOS Darwin errno 51 (ENETUNREACH) and 61 (ECONNREFUSED) map cleanly."""
        from apps.library.services.node import _format_node_error

        # Darwin ENETUNREACH
        err_darwin_unreach = OSError(51, "Network is unreachable")
        msg, code = _format_node_error(err_darwin_unreach)
        self.assertEqual(code, "network_unreachable")
        self.assertNotIn("51", msg)
        self.assertIn("Network is unreachable", msg)

        # Darwin ECONNREFUSED
        err_darwin_refused = OSError(61, "Connection refused")
        msg, code = _format_node_error(err_darwin_refused)
        self.assertEqual(code, "connection_refused")
        self.assertNotIn("61", msg)
        self.assertIn("Connection refused", msg)

    @mock.patch("apps.library.services.node.httpx.Client")
    def test_proxy_request_sets_bounded_connect_timeout(self, mock_client_cls):
        """Verify httpx.Client receives a bounded connect timeout to prevent aggregate stalls."""
        from apps.library.services.node import server_proxy_request

        server = UserGameServer.objects.create(
            user=self.user,
            name="Timeout Node",
            local_url="http://192.168.1.88:8090",
            auth_token="token",
            is_local=False,
        )
        mock_client = mock.MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_resp = mock.MagicMock(status_code=200)
        mock_resp.json.return_value = {"ok": True}
        mock_client.request.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        server_proxy_request(server, "POST", "/api/v1/scan", timeout=60.0)

        mock_client_cls.assert_called()
        call_kwargs = mock_client_cls.call_args.kwargs
        timeout_obj = call_kwargs.get("timeout")
        self.assertIsInstance(timeout_obj, httpx.Timeout)
        self.assertLessEqual(timeout_obj.connect, 4.0)
        self.assertEqual(timeout_obj.read, 60.0)

    @mock.patch("apps.library.services.node.httpx.Client")
    def test_scan_get_status_unreachable_node_returns_502_when_initially_online(
        self, mock_client_cls
    ):
        """GET /scan returns 502 with diagnostic payload when online node drops, rather than masking with 200 idle."""
        from rest_framework.test import APIClient

        client = APIClient()
        client.force_authenticate(user=self.user)

        server = UserGameServer.objects.create(
            user=self.user,
            name="Drop During Scan Node",
            local_url="http://192.168.1.105:8090",
            auth_token="token",
            is_online=True,
            is_local=False,
        )

        def mock_request(method, url, **kwargs):
            raise httpx.ConnectError("[Errno 101] Network is unreachable")

        mock_client = mock.MagicMock()
        mock_client.request.side_effect = mock_request
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        res = client.get(f"/api/v1/library/servers/{server.id}/scan")
        self.assertEqual(res.status_code, 502)
        data = res.json()
        self.assertEqual(data.get("code"), "node_unreachable")
        self.assertEqual(data.get("error"), "network_unreachable")
        self.assertNotIn("[Errno 101]", data.get("detail", ""))

        server.refresh_from_db()
        self.assertFalse(server.is_online)

    @mock.patch("apps.library.services.node.httpx.Client")
    def test_proxy_request_trailing_slash_normalization(self, mock_client_cls):
        """Candidate URL with trailing slash does not generate double slashes in requested URL."""
        from apps.library.services.node import server_proxy_request

        server = UserGameServer.objects.create(
            user=self.user,
            name="Trailing Slash Node",
            local_url="http://192.168.1.105:8090/",
            auth_token="token",
            is_local=False,
        )
        mock_client = mock.MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_resp = mock.MagicMock(status_code=200)
        mock_resp.json.return_value = {"status": "ok"}
        mock_client.request.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        server_proxy_request(server, "POST", "/api/v1/scan")
        called_url = mock_client.request.call_args.kwargs.get("url")
        self.assertEqual(called_url, "http://192.168.1.105:8090/api/v1/scan")
        self.assertNotIn("//api", called_url)

    @mock.patch("apps.library.services.node.httpx.Client")
    def test_proxy_request_401_does_not_mark_server_online(self, mock_client_cls):
        """Unauthorized 401 response does not flip offline server to online."""
        from apps.library.services.node import server_proxy_request

        server = UserGameServer.objects.create(
            user=self.user,
            name="Unauthenticated Node",
            local_url="http://192.168.1.105:8090",
            auth_token="revoked_token",
            is_online=False,
            is_local=False,
        )
        mock_client = mock.MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_resp = mock.MagicMock(status_code=401)
        mock_resp.json.return_value = {"detail": "Unauthorized"}
        mock_client.request.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        status_code, _ = server_proxy_request(server, "GET", "/api/v1/status")
        self.assertEqual(status_code, 401)
        server.refresh_from_db()
        self.assertFalse(server.is_online)

    def test_dns_and_ssl_error_formatting(self):
        """Verify socket.gaierror and ssl.SSLError map to diagnostic dns_error and ssl_error."""
        import socket
        import ssl

        from apps.library.services.node import _format_node_error

        # Gaierror
        gai_err = httpx.ConnectError("Connection error", request=None)
        gai_err.__cause__ = socket.gaierror(-2, "Name or service not known")
        msg, code = _format_node_error(gai_err)
        self.assertEqual(code, "dns_error")
        self.assertIn("Hostname resolution failed", msg)

        # SSLError
        ssl_err = httpx.ConnectError("SSL handshake failed", request=None)
        ssl_err.__cause__ = ssl.SSLError("certificate verify failed: self signed certificate")
        msg, code = _format_node_error(ssl_err)
        self.assertEqual(code, "ssl_error")
        self.assertIn("TLS/SSL verification failed", msg)

    @mock.patch("apps.library.services.node.httpx.Client")
    def test_proxy_falls_back_when_primary_gateway_returns_502(self, mock_client_cls):
        """When primary remote_url returns HTTP 502 Bad Gateway from reverse proxy, fall back to local_url."""
        from apps.library.services.node import server_proxy_request

        server = UserGameServer.objects.create(
            user=self.user,
            name="Gateway Proxy Node",
            remote_url="https://remote.gateway.net:8090",
            local_url="http://192.168.1.110:8090",
            auth_token="token",
            is_online=True,
            is_local=False,
        )

        mock_client = mock.MagicMock()
        mock_client.__enter__.return_value = mock_client

        def mock_request(method, url, **kwargs):
            if "remote.gateway.net" in url:
                bad_gw = mock.MagicMock(status_code=502, text="<html>502 Bad Gateway</html>")
                bad_gw.json.side_effect = ValueError("Invalid JSON")
                return bad_gw
            if "192.168.1.110" in url:
                ok = mock.MagicMock(status_code=200)
                ok.json.return_value = {"status": "ok", "phase": "idle"}
                return ok
            raise httpx.ConnectError("Unknown target")

        mock_client.request.side_effect = mock_request
        mock_client_cls.return_value = mock_client

        status_code, data = server_proxy_request(server, "POST", "/api/v1/scan")
        self.assertEqual(status_code, 200)
        self.assertEqual(data.get("status"), "ok")
        server.refresh_from_db()
        self.assertTrue(server.is_online)

    @mock.patch("apps.library.services.node.httpx.Client")
    def test_proxy_all_endpoints_gateway_502_returns_clean_structured_error_and_marks_offline(
        self, mock_client_cls
    ):
        """When all endpoints return HTTP 502/503 from reverse proxies, return structured 502 and mark offline."""
        from apps.library.services.node import server_proxy_request

        server = UserGameServer.objects.create(
            user=self.user,
            name="Downstream Broken Node",
            remote_url="https://remote.downstream.net:8090",
            local_url="http://192.168.1.115:8090",
            auth_token="token",
            is_online=True,
            is_local=False,
        )

        mock_client = mock.MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_resp = mock.MagicMock(status_code=502, text="<html>502 Bad Gateway</html>")
        mock_resp.json.side_effect = ValueError("HTML body")
        mock_client.request.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        status_code, data = server_proxy_request(server, "POST", "/api/v1/scan")
        self.assertEqual(status_code, 502)
        self.assertEqual(data.get("code"), "node_unreachable")
        self.assertEqual(data.get("error"), "node_unreachable")
        self.assertNotIn("<html>", data.get("detail", ""))
        self.assertIn("Node is offline or unreachable", data.get("detail", ""))

        server.refresh_from_db()
        self.assertFalse(server.is_online)

    @mock.patch("apps.library.services.node.httpx.Client")
    def test_proxy_local_node_custom_port_loopback_fallback(self, mock_client_cls):
        """is_local server with custom port 8095 resolves 127.0.0.1:8095 loopback candidate."""
        from apps.library.services.node import server_proxy_request

        server = UserGameServer.objects.create(
            user=self.user,
            name="Custom Port Local Node",
            local_url="http://192.168.1.120:8095",
            auth_token="token",
            is_online=True,
            is_local=True,
        )

        mock_client = mock.MagicMock()
        mock_client.__enter__.return_value = mock_client

        def mock_request(method, url, **kwargs):
            if "192.168.1.120" in url:
                raise httpx.ConnectError("[Errno 101] Network is unreachable")
            if "127.0.0.1:8095" in url:
                ok = mock.MagicMock(status_code=200)
                ok.json.return_value = {"status": "ok"}
                return ok
            raise httpx.ConnectError("Unknown target")

        mock_client.request.side_effect = mock_request
        mock_client_cls.return_value = mock_client

        status_code, data = server_proxy_request(server, "GET", "/api/v1/status")
        self.assertEqual(status_code, 200)
        self.assertEqual(data.get("status"), "ok")

    @mock.patch("apps.library.services.node.server_proxy_request")
    def test_scan_game_libraries_timeout_bounded_for_async_scans(self, mock_proxy):
        """Asynchronous scan requests use a 10s timeout while wait=1 uses 120s."""
        from apps.library.services.node import scan_game_libraries

        server = UserGameServer.objects.create(
            user=self.user,
            name="Async Scan Node",
            local_url="http://192.168.1.125:8090",
            auth_token="token",
            is_local=False,
        )
        mock_proxy.return_value = (200, {"status": "scanning_started"})

        # Async scan trigger (no wait) -> timeout=10.0
        scan_game_libraries(server)
        mock_proxy.assert_called_with(server, "POST", "/api/v1/scan", params=None, timeout=10.0)

        # Synchronous scan trigger (wait=1) -> timeout=120.0
        scan_game_libraries(server, params={"wait": "1"})
        mock_proxy.assert_called_with(
            server, "POST", "/api/v1/scan", params={"wait": "1"}, timeout=120.0
        )
