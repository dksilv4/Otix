import asyncio
from unittest.mock import MagicMock

from django.test import SimpleTestCase

from core import redis as redis_module


class CoreRedisTests(SimpleTestCase):
    def tearDown(self) -> None:
        super().tearDown()
        redis_module.close_redis_clients()

    def test_sync_client_cached_and_closed(self) -> None:
        c1 = redis_module.get_client()
        c2 = redis_module.get_client()
        self.assertIs(c1, c2)
        redis_module.close_redis_clients()
        self.assertIsNone(redis_module._sync_client)

    def test_async_client_bound_to_loop(self) -> None:
        async def _test():
            a1 = redis_module.get_async_client()
            a2 = redis_module.get_async_client()
            self.assertIs(a1, a2)
            return a1

        asyncio.run(_test())
        # After loop finishes, close was wrapped and executed
        redis_module.close_redis_clients()

    def test_force_close_redis_client_cleans_connections(self) -> None:
        fake_client = MagicMock()
        fake_conn = MagicMock()
        fake_pool = MagicMock()
        fake_pool._available_connections = [fake_conn]
        fake_pool._in_use_connections = []
        fake_client.connection_pool = fake_pool

        fake_writer = MagicMock()
        fake_transport = MagicMock()
        fake_sock = MagicMock()
        fake_transport.get_extra_info.return_value = fake_sock
        fake_writer.transport = fake_transport
        fake_conn._writer = fake_writer

        redis_module._force_close_redis_client(fake_client)
        self.assertTrue(fake_sock.close.called)
        self.assertTrue(fake_transport.close.called)
        self.assertTrue(fake_writer.close.called)
        self.assertTrue(fake_conn._close.called)
        self.assertEqual(len(fake_pool._available_connections), 0)
