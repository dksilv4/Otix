"""Comprehensive unit tests for the Otix Provider Integration Framework."""

from __future__ import annotations

import asyncio
from dataclasses import FrozenInstanceError
from datetime import date
from unittest import mock

import httpx
from django.test import SimpleTestCase

from core.providers.framework import (
    BaseProviderClient,
    CircuitBreaker,
    CircuitOpenError,
    CircuitState,
    Counter,
    ExecutionTimeline,
    Gauge,
    Histogram,
    MetricsRegistry,
    NormalizedAsset,
    NormalizedCredit,
    NormalizedMediaItem,
    ProviderCapability,
    ProviderManifest,
    ProviderRegistry,
    RateLimitError,
    atomic_seed,
    clamp_rating,
    compute_payload_hash,
    create_mock_transport,
    get_metrics_registry,
    load_fixture,
    parse_iso_date,
    record_timeline,
    register_provider,
    registry,
    safe_bulk_create,
    sanitize_text,
)


class CircuitBreakerTests(SimpleTestCase):
    """Test circuit breaker transitions and probe mechanisms."""

    def test_initial_state_is_closed(self) -> None:
        cb = CircuitBreaker(name="test_provider")
        self.assertEqual(cb.state, CircuitState.CLOSED)
        self.assertTrue(cb.allow_request())

    def test_failures_below_threshold_remain_closed(self) -> None:
        cb = CircuitBreaker(name="test_provider", failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        self.assertEqual(cb.state, CircuitState.CLOSED)
        self.assertTrue(cb.allow_request())

    def test_failure_reaching_threshold_trips_to_open(self) -> None:
        cb = CircuitBreaker(name="test_provider", failure_threshold=3)
        for _ in range(3):
            cb.record_failure()
        self.assertEqual(cb.state, CircuitState.OPEN)
        self.assertFalse(cb.allow_request())

    def test_success_in_closed_resets_failure_count(self) -> None:
        cb = CircuitBreaker(name="test_provider", failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        self.assertEqual(cb._failure_count, 0)
        # Next two failures do not trip
        cb.record_failure()
        cb.record_failure()
        self.assertEqual(cb.state, CircuitState.CLOSED)

    def test_half_open_probe_allowed_after_timeout(self) -> None:
        cb = CircuitBreaker(name="test_provider", failure_threshold=2, recovery_timeout=10.0)
        cb.record_failure()
        cb.record_failure()
        self.assertEqual(cb.state, CircuitState.OPEN)

        # Fast-forward time past recovery timeout
        with mock.patch("time.monotonic", return_value=cb._opened_at + 15.0):
            self.assertEqual(cb.state, CircuitState.HALF_OPEN)
            # Exactly one probe request allowed
            self.assertTrue(cb.allow_request())
            # Subsequent requests within half-open window rejected
            self.assertFalse(cb.allow_request())

            # Successful probe closes breaker
            cb.record_success()
            self.assertEqual(cb.state, CircuitState.CLOSED)
            self.assertEqual(cb._failure_count, 0)

    def test_half_open_failure_immediately_reopens(self) -> None:
        cb = CircuitBreaker(name="test_provider", failure_threshold=2, recovery_timeout=10.0)
        cb.record_failure()
        cb.record_failure()
        self.assertEqual(cb.state, CircuitState.OPEN)

        with mock.patch("time.monotonic", return_value=cb._opened_at + 15.0):
            self.assertEqual(cb.state, CircuitState.HALF_OPEN)
            self.assertTrue(cb.allow_request())
            # Failed probe reopens circuit immediately
            cb.record_failure()
            self.assertEqual(cb.state, CircuitState.OPEN)
            self.assertFalse(cb.allow_request())

    def test_manual_reset(self) -> None:
        cb = CircuitBreaker(name="test_provider", failure_threshold=1)
        cb.record_failure()
        self.assertEqual(cb.state, CircuitState.OPEN)
        cb.reset()
        self.assertEqual(cb.state, CircuitState.CLOSED)
        self.assertTrue(cb.allow_request())


class ExecutionTimelineTests(SimpleTestCase):
    """Test telemetry span tracking, hierarchical export, Chrome trace, and waterfall."""

    def test_span_measurement_and_nesting(self) -> None:
        timeline = ExecutionTimeline(provider="tmdb", entity_type="movie", external_id="550")
        with timeline.measure("fetch"):
            with timeline.measure("fetch_details", endpoint="/movie/550"):
                pass
            with timeline.measure("fetch_credits", endpoint="/movie/550/credits"):
                pass
        with timeline.measure("transform"):
            pass

        self.assertEqual(len(timeline.spans), 2)
        fetch_span = timeline.spans[0]
        self.assertEqual(fetch_span.name, "fetch")
        self.assertEqual(len(fetch_span.children), 2)
        self.assertEqual(fetch_span.children[0].name, "fetch_details")
        self.assertEqual(fetch_span.children[0].metadata.get("endpoint"), "/movie/550")
        self.assertIsNotNone(fetch_span.duration_ms)
        self.assertGreaterEqual(fetch_span.duration_ms, 0.0)

    def test_to_dict_structure(self) -> None:
        timeline = ExecutionTimeline(provider="igdb", entity_type="game", external_id="100")
        with timeline.measure("fetch"):
            pass

        data = timeline.to_dict()
        self.assertEqual(data["provider"], "igdb")
        self.assertEqual(data["entity_type"], "game")
        self.assertEqual(data["external_id"], "100")
        self.assertEqual(len(data["spans"]), 1)
        self.assertEqual(data["spans"][0]["name"], "fetch")

    def test_to_chrome_trace_events(self) -> None:
        timeline = ExecutionTimeline(provider="tmdb", entity_type="movie", external_id="550")
        with timeline.measure("parent"):
            with timeline.measure("child", key="value"):
                pass

        trace = timeline.to_chrome_trace()
        self.assertEqual(len(trace), 2)
        child_ev = [ev for ev in trace if ev["name"] == "child"][0]
        self.assertEqual(child_ev["cat"], "tmdb")
        self.assertEqual(child_ev["ph"], "X")
        self.assertEqual(child_ev["args"]["key"], "value")
        self.assertEqual(child_ev["args"]["external_id"], "550")
        self.assertIn("ts", child_ev)
        self.assertIn("dur", child_ev)

    def test_render_ascii_waterfall(self) -> None:
        timeline = ExecutionTimeline(provider="tmdb", entity_type="movie", external_id="550")
        with timeline.measure("stage_1"):
            pass
        with timeline.measure("stage_2"):
            with timeline.measure("sub_stage"):
                pass

        chart = timeline.render_ascii_waterfall()
        self.assertIn("Timeline: tmdb movie:550", chart)
        self.assertIn("stage_1", chart)
        self.assertIn("stage_2", chart)
        self.assertIn("sub_stage", chart)
        self.assertIn("Waterfall", chart)

    def test_record_timeline_context_manager(self) -> None:
        with record_timeline("tmdb", "movie", "123") as tl:
            with tl.measure("op"):
                pass
        self.assertEqual(tl.provider, "tmdb")
        self.assertEqual(len(tl.spans), 1)

    def test_save_to_redis_sync_and_async(self) -> None:
        timeline = ExecutionTimeline(provider="tmdb", entity_type="movie", external_id="1")
        with timeline.measure("op"):
            pass

        # Sync mock redis client
        sync_redis = mock.MagicMock()
        timeline.save_to_redis(sync_redis, max_entries=50)
        sync_redis.lpush.assert_called_once()
        sync_redis.ltrim.assert_called_once_with("otix:timelines:tmdb", 0, 49)

        # Async mock redis client
        async def run_async() -> None:
            async_redis = mock.AsyncMock()
            await timeline.save_to_redis(async_redis, max_entries=50)
            async_redis.lpush.assert_awaited_once()
            async_redis.ltrim.assert_awaited_once_with("otix:timelines:tmdb", 0, 49)

        asyncio.run(run_async())


class TransformersTests(SimpleTestCase):
    """Test date parsing, text sanitization, payload hashing, and rating clamping."""

    def test_parse_iso_date(self) -> None:
        # Full date
        self.assertEqual(parse_iso_date("2024-05-12"), date(2024, 5, 12))
        # ISO timestamp
        self.assertEqual(parse_iso_date("2024-05-12T14:30:00Z"), date(2024, 5, 12))
        # Truncated year-month
        self.assertEqual(parse_iso_date("2024-05"), date(2024, 5, 1))
        # Truncated year only
        self.assertEqual(parse_iso_date("2024"), date(2024, 1, 1))
        # Whitespace handling
        self.assertEqual(parse_iso_date("  2024-08-15  "), date(2024, 8, 15))
        # Invalid and None handling
        self.assertIsNone(parse_iso_date(None))
        self.assertIsNone(parse_iso_date(""))
        self.assertIsNone(parse_iso_date("invalid-date"))
        self.assertIsNone(parse_iso_date("2024-99-99"))

    def test_sanitize_text(self) -> None:
        # Unescapes HTML
        self.assertEqual(
            sanitize_text("&lt;p&gt;Hello &amp; Welcome &#39;Otix&#39;&lt;/p&gt;"),
            "<p>Hello & Welcome 'Otix'</p>",
        )
        # Normalizes NFC unicode
        decomposed = "e\u0301"  # 'e' + acute accent
        composed = "\u00e9"  # 'é'
        self.assertEqual(sanitize_text(decomposed), composed)
        # Strips whitespace
        self.assertEqual(sanitize_text("   trimmed text   "), "trimmed text")
        # Empty string / None
        self.assertIsNone(sanitize_text(None))
        self.assertIsNone(sanitize_text(""))
        self.assertIsNone(sanitize_text("    "))

    def test_compute_payload_hash(self) -> None:
        payload_a = {"title": "Alien", "year": 1979, "genres": ["Sci-Fi", "Horror"]}
        payload_b = {"genres": ["Sci-Fi", "Horror"], "title": "Alien", "year": 1979}
        hash_a = compute_payload_hash(payload_a)
        hash_b = compute_payload_hash(payload_b)
        self.assertEqual(len(hash_a), 64)
        # Order-invariant deterministic hash
        self.assertEqual(hash_a, hash_b)

        different = compute_payload_hash({"title": "Aliens", "year": 1986})
        self.assertNotEqual(hash_a, different)

    def test_clamp_rating(self) -> None:
        self.assertEqual(clamp_rating(75.5), 75.5)
        self.assertEqual(clamp_rating(-10.0), 0.0)
        self.assertEqual(clamp_rating(150.0), 100.0)
        self.assertEqual(clamp_rating(8.5, min_val=0.0, max_val=10.0), 8.5)
        self.assertEqual(clamp_rating(12.0, min_val=0.0, max_val=10.0), 10.0)
        self.assertEqual(clamp_rating(float("nan")), 0.0)


class HydratorsTests(SimpleTestCase):
    """Test safe bulk operations and atomic seed decorator."""

    def test_safe_bulk_create_chunking(self) -> None:
        mock_model = mock.MagicMock()
        # Simulate a model with 10 concrete fields
        mock_model._meta.concrete_fields = [mock.MagicMock() for _ in range(10)]
        mock_model.objects.bulk_create.return_value = ["row1", "row2"]

        instances = [mock.MagicMock() for _ in range(2)]
        result = safe_bulk_create(mock_model, instances, batch_size=10000)

        # 65535 // 10 = 6553, so batch_size of 10000 must be clamped to 6553
        mock_model.objects.bulk_create.assert_called_once_with(
            instances,
            batch_size=6553,
            ignore_conflicts=True,
        )
        self.assertEqual(result, ["row1", "row2"])

    def test_safe_bulk_create_empty(self) -> None:
        mock_model = mock.MagicMock()
        result = safe_bulk_create(mock_model, [])
        self.assertEqual(result, [])
        mock_model.objects.bulk_create.assert_not_called()

    def test_prefetch_external_ids_empty(self) -> None:
        from core.providers.framework.hydrators import prefetch_external_ids

        res = prefetch_external_ids("tmdb", set(), content_type=1)
        self.assertEqual(res, {})

    def test_prefetch_external_ids_mapping(self) -> None:
        from core.providers.framework.hydrators import prefetch_external_ids

        mock_qs = mock.MagicMock()
        mock_qs.values_list.return_value = [("550", 123), ("680", 456)]

        with mock.patch("django.apps.apps.get_model") as mock_get_model:
            mock_external_id_cls = mock.MagicMock()
            mock_external_id_cls.objects.filter.return_value = mock_qs
            mock_content_type_cls = mock.MagicMock()
            mock_get_model.side_effect = lambda app, model: (
                mock_external_id_cls if model == "ExternalID" else mock_content_type_cls
            )

            res = prefetch_external_ids("tmdb", {"550", "680"}, content_type=1)
            self.assertEqual(res, {"550": 123, "680": 456})
            mock_external_id_cls.objects.filter.assert_called_once()

    def test_atomic_seed_sync(self) -> None:
        with mock.patch("django.db.transaction.atomic") as mock_atomic:
            mock_atomic.return_value.__enter__ = mock.MagicMock()
            mock_atomic.return_value.__exit__ = mock.MagicMock()

            @atomic_seed
            def my_seed(val: int) -> int:
                return val * 2

            res = my_seed(5)
            self.assertEqual(res, 10)
            mock_atomic.assert_called_once()

    def test_atomic_seed_async(self) -> None:
        with mock.patch("django.db.transaction.atomic") as mock_atomic:
            mock_atomic.return_value.__aenter__ = mock.AsyncMock()
            mock_atomic.return_value.__aexit__ = mock.AsyncMock()

            @atomic_seed
            async def my_async_seed(val: int) -> int:
                return val * 3

            res = asyncio.run(my_async_seed(4))
            self.assertEqual(res, 12)
            mock_atomic.assert_called_once()


class RegistryTests(SimpleTestCase):
    """Test provider registry, capability filtering, and decorators."""

    def setUp(self) -> None:
        self.reg = ProviderRegistry()

    def test_register_and_lookup_by_id(self) -> None:
        manifest = ProviderManifest(
            id="test_tmdb",
            name="TMDB",
            capabilities=ProviderCapability.METADATA | ProviderCapability.ARTWORK,
            supported_media_types=("movie", "show"),
        )
        self.reg.register(manifest)

        found = self.reg.get("test_tmdb")
        self.assertIsNotNone(found)
        self.assertEqual(found.name, "TMDB")
        self.assertTrue(found.has_capability(ProviderCapability.METADATA))
        self.assertTrue(found.has_capability(ProviderCapability.ARTWORK))
        self.assertFalse(found.has_capability(ProviderCapability.DOWNLOAD))
        self.assertTrue(found.supports_media_type("movie"))
        self.assertFalse(found.supports_media_type("game"))

    def test_filter_by_capability(self) -> None:
        m1 = ProviderManifest(
            id="meta_only",
            name="Meta",
            capabilities=ProviderCapability.METADATA,
        )
        m2 = ProviderManifest(
            id="artwork_only",
            name="Art",
            capabilities=ProviderCapability.ARTWORK,
        )
        m3 = ProviderManifest(
            id="both",
            name="Both",
            capabilities=ProviderCapability.METADATA | ProviderCapability.ARTWORK,
        )

        self.reg.register(m1)
        self.reg.register(m2)
        self.reg.register(m3)

        metadata_providers = self.reg.get_by_capability(ProviderCapability.METADATA)
        self.assertEqual({m.id for m in metadata_providers}, {"meta_only", "both"})

        artwork_providers = self.reg.get_by_capability(ProviderCapability.ARTWORK)
        self.assertEqual({m.id for m in artwork_providers}, {"artwork_only", "both"})

    def test_register_provider_decorator(self) -> None:
        manifest = ProviderManifest(
            id="dec_test",
            name="Dec Test",
            capabilities=ProviderCapability.SEARCH,
        )

        @register_provider(manifest)
        class DummyClient:
            pass

        self.assertEqual(registry.get("dec_test"), manifest)
        self.assertEqual(registry.get_client_class("dec_test"), DummyClient)


class TypesTests(SimpleTestCase):
    """Test normalized types immutability and conversion."""

    def test_normalized_media_item_frozen(self) -> None:
        item = NormalizedMediaItem(
            external_ids={"tmdb": "550"},
            title="Fight Club",
            media_type="movie",
            genres=["Drama"],  # passed as list, should convert to tuple
            assets=[
                NormalizedAsset(
                    asset_type="poster",
                    url="https://example.com/p.jpg",
                    provider="tmdb",
                )
            ],
            credits=[
                NormalizedCredit(
                    person_id="1",
                    name="Edward Norton",
                    role="cast",
                )
            ],
        )

        self.assertIsInstance(item.genres, tuple)
        self.assertIsInstance(item.assets, tuple)
        self.assertIsInstance(item.credits, tuple)

        # Mutating frozen dataclass raises FrozenInstanceError
        with self.assertRaises((FrozenInstanceError, AttributeError)):
            item.title = "Another Title"  # type: ignore[misc]


class MetricsTests(SimpleTestCase):
    """Test pure-Python Prometheus metric primitives."""

    def test_counter(self) -> None:
        reg = MetricsRegistry()
        c = reg.counter("test_counter", "help text")
        c.inc(1, provider="tmdb")
        c.inc(2, provider="tmdb")
        c.inc(5, provider="igdb")

        self.assertEqual(c.value(provider="tmdb"), 3)
        self.assertEqual(c.value(provider="igdb"), 5)
        self.assertEqual(c.value(), 8)

    def test_histogram(self) -> None:
        reg = MetricsRegistry()
        h = reg.histogram("test_hist", buckets=(0.1, 0.5, 1.0))
        h.observe(0.05, provider="tmdb")
        h.observe(0.20, provider="tmdb")
        self.assertEqual(h.count, 2)
        self.assertAlmostEqual(h.sum_seconds, 0.25)
        self.assertAlmostEqual(h.avg_seconds, 0.125)

    def test_gauge(self) -> None:
        reg = MetricsRegistry()
        g = reg.gauge("test_gauge")
        g.set(10.0, provider="tmdb")
        self.assertEqual(g.value(provider="tmdb"), 10.0)
        g.inc(5.0, provider="tmdb")
        self.assertEqual(g.value(provider="tmdb"), 15.0)
        g.dec(3.0, provider="tmdb")
        self.assertEqual(g.value(provider="tmdb"), 12.0)

    def test_registry_snapshot(self) -> None:
        reg = MetricsRegistry()
        reg.counter("requests").inc(4)
        snap = reg.snapshot()
        self.assertIn("counters", snap)
        self.assertEqual(snap["counters"]["requests"]["value"], 4)

    def test_framework_exports_metrics_and_errors(self) -> None:
        self.assertIs(get_metrics_registry(), get_metrics_registry())
        err = RateLimitError("rate limited", retry_after=10)
        self.assertEqual(err.retry_after, 10)
        c = Counter("c", "help")
        c.inc()
        self.assertEqual(c.value(), 1)
        h = Histogram("h", "help")
        h.observe(0.5)
        self.assertEqual(h.count, 1)
        g = Gauge("g", "help")
        g.set(42.0)
        self.assertEqual(g.value(), 42.0)


class MockTransportAndFixtureTests(SimpleTestCase):
    """Test testing utilities: mock transport routing and fixture loading."""

    def test_mock_transport_routing(self) -> None:
        mapping = {
            ("GET", "/movie/1"): (200, {"title": "Mock Movie"}),
            ("POST", "/sync"): (201, {"status": "created"}),
            ("GET", "/text"): (200, "plain text response"),
        }
        transport = create_mock_transport(mapping)
        client = httpx.Client(transport=transport, base_url="https://api.test")

        r1 = client.get("/movie/1")
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r1.json(), {"title": "Mock Movie"})

        r2 = client.post("/sync")
        self.assertEqual(r2.status_code, 201)
        self.assertEqual(r2.json(), {"status": "created"})

        r3 = client.get("/text")
        self.assertEqual(r3.status_code, 200)
        self.assertEqual(r3.text, "plain text response")

        r_404 = client.get("/not-found")
        self.assertEqual(r_404.status_code, 404)

    def test_load_fixture_existing(self) -> None:
        data = load_fixture("tmdb", "configuration.json")
        self.assertIsInstance(data, dict)
        self.assertIn("images", data)

    def test_load_fixture_missing(self) -> None:
        with self.assertRaises(FileNotFoundError):
            load_fixture("tmdb", "definitely_nonexistent_fixture_12345.json")


class ClientResilienceTests(SimpleTestCase):
    """Test BaseProviderClient with mock transport, circuit breaking, and timeline."""

    def setUp(self) -> None:
        from core.providers.framework.cache import ApiCache

        self._orig_cache = BaseProviderClient._api_cache
        BaseProviderClient._api_cache = ApiCache(enabled=False)
        self.addCleanup(self._restore_cache)

    def _restore_cache(self) -> None:
        BaseProviderClient._api_cache = self._orig_cache

    def test_client_request_with_timeline(self) -> None:
        from core.providers.framework.testing import FakeAsyncRedis

        transport = create_mock_transport(
            {
                ("GET", "https://api.test/data"): (200, {"success": True}),
            }
        )

        async def run() -> None:
            fake_redis = FakeAsyncRedis()
            client = httpx.AsyncClient(transport=transport)
            provider = BaseProviderClient(
                "test_prov", client, redis=fake_redis, rate=100.0, burst=100
            )
            timeline = ExecutionTimeline(provider="test_prov", entity_type="test", external_id="1")

            async with provider.http:
                resp = await provider._get("https://api.test/data", timeline=timeline)
                self.assertEqual(resp.json(), {"success": True})

            self.assertEqual(len(timeline.spans), 1)
            self.assertIn("HTTP GET https://api.test/data", timeline.spans[0].name)

        asyncio.run(run())

    def test_circuit_tripped_rejects_subsequent_requests(self) -> None:
        from core.providers.framework.testing import FakeAsyncRedis

        transport = create_mock_transport(
            {
                ("GET", "https://api.test/fail"): (500, {"error": "server error"}),
            }
        )

        async def run() -> None:
            fake_redis = FakeAsyncRedis()
            client = httpx.AsyncClient(transport=transport)
            provider = BaseProviderClient(
                "test_prov", client, redis=fake_redis, circuit_threshold=2, rate=100.0, burst=100
            )

            async with provider.http:
                for _ in range(2):
                    with self.assertRaises(httpx.HTTPStatusError):
                        await provider._get("https://api.test/fail")

                self.assertEqual(provider.circuit_breaker.state, CircuitState.OPEN)
                with self.assertRaises(CircuitOpenError):
                    await provider._get("https://api.test/fail")

        asyncio.run(run())
