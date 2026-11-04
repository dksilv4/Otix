"""Adversarial probe script for Milestone 1 Backend & Routes.

Validates:
1. Deprecated legacy /servers/* endpoints strictly return 404.
2. Unified /nodes/* and /library/nodes/* routes handle both trailing-slash and non-trailing-slash URLs.
3. UserNode model constraints (machine_id uniqueness, primary_url resolution, default fields, properties).
4. Pure snake_case contract for all UserNode serialization and endpoint responses.
5. Deletion cascade and migration consistency verification.
"""

import json
import os
import re
import sys
import uuid

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")
import django

django.setup()

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import Client
from rest_framework import status
from rest_framework.test import APIClient

from apps.library.models import UserNode
from apps.library.serializers import UserNodeSerializer

User = get_user_model()


def is_snake_case(key: str) -> bool:
    """Check if a string conforms to pure snake_case."""
    # Must be all lowercase/digits/underscores, no uppercase, no hyphens
    return bool(re.match(r"^[a-z0-9_]+$", key))


def run_probes():
    results = {
        "legacy_routes_404": {"passed": 0, "failed": 0, "details": []},
        "trailing_slash_handling": {"passed": 0, "failed": 0, "details": []},
        "usernode_constraints": {"passed": 0, "failed": 0, "details": []},
        "snake_case_contract": {"passed": 0, "failed": 0, "details": []},
        "schema_and_migration_consistency": {"passed": 0, "failed": 0, "details": []},
    }

    user = User.objects.create_user(
        username="adversary_tester", email="adv@test.com", password="password"
    )
    client = APIClient()
    client.force_authenticate(user=user)

    print("=" * 80)
    print("PROBE 1: LEGACY /servers/* ENDPOINTS RETURN 404")
    print("=" * 80)
    legacy_paths = [
        "/api/v1/servers",
        "/api/v1/servers/",
        "/api/v1/servers/1",
        "/api/v1/servers/1/",
        "/api/v1/servers/heartbeat",
        "/api/v1/servers/heartbeat/",
        "/api/v1/servers/desktop-heartbeat",
        "/api/v1/servers/desktop-heartbeat/",
        "/api/v1/servers/claim",
        "/api/v1/servers/claim/",
        "/api/v1/servers/claim-pin",
        "/api/v1/servers/claim-pin/",
        "/api/v1/servers/claim-direct",
        "/api/v1/servers/claim-direct/",
        "/api/v1/servers/pending",
        "/api/v1/servers/pending/",
        "/api/v1/servers/unclaim",
        "/api/v1/servers/unclaim/",
        "/api/v1/servers/scan-complete",
        "/api/v1/servers/scan-complete/",
        "/api/v1/library/servers",
        "/api/v1/library/servers/",
        "/api/v1/library/servers/1",
        "/api/v1/library/servers/1/",
        "/api/v1/library/servers/pending",
        "/api/v1/library/servers/pending/",
        "/api/v1/library/servers/claim",
        "/api/v1/library/servers/claim/",
    ]

    methods = ["get", "post", "put", "delete", "patch"]
    for path in legacy_paths:
        for m in methods:
            handler = getattr(client, m)
            resp = handler(path, data={}, format="json")
            if resp.status_code == 404:
                results["legacy_routes_404"]["passed"] += 1
            else:
                results["legacy_routes_404"]["failed"] += 1
                results["legacy_routes_404"]["details"].append(
                    f"{m.upper()} {path} -> HTTP {resp.status_code} (expected 404)"
                )
    print(
        f"Legacy 404 Probe: {results['legacy_routes_404']['passed']} checks PASSED, {results['legacy_routes_404']['failed']} FAILED."
    )
    for fail in results["legacy_routes_404"]["details"][:5]:
        print(f"  FAIL: {fail}")

    print("\n" + "=" * 80)
    print("PROBE 2: TRAILING SLASH HANDLING ON /nodes/*")
    print("=" * 80)

    # Create a test node for instance routes
    test_node = UserNode.objects.create(
        user=user,
        name="Trailing Slash Probe Node",
        local_url="http://127.0.0.1:8090",
        api_key="probe_secret",
        is_local_desktop=True,
        is_online=True,
    )

    pairs = [
        # (method, path_no_slash, path_with_slash, expected_status)
        ("get", "/api/v1/nodes", "/api/v1/nodes/", 200),
        ("get", "/api/v1/nodes/pending", "/api/v1/nodes/pending/", 200),
        ("post", "/api/v1/nodes/heartbeat", "/api/v1/nodes/heartbeat/", 200),
        ("get", "/api/v1/nodes/media-activity", "/api/v1/nodes/media-activity/", 200),
        ("get", f"/api/v1/nodes/{test_node.id}", f"/api/v1/nodes/{test_node.id}/", 200),
        ("post", f"/api/v1/nodes/{test_node.id}/ping", f"/api/v1/nodes/{test_node.id}/ping/", 200),
        ("get", f"/api/v1/nodes/{test_node.id}/shares", f"/api/v1/nodes/{test_node.id}/shares/", 200),
        ("get", f"/api/v1/nodes/{test_node.id}/libraries", f"/api/v1/nodes/{test_node.id}/libraries/", 200),
        ("get", f"/api/v1/nodes/{test_node.id}/paths", f"/api/v1/nodes/{test_node.id}/paths/", 200),
        ("get", f"/api/v1/nodes/{test_node.id}/organize", f"/api/v1/nodes/{test_node.id}/organize/", 200),
        ("get", f"/api/v1/nodes/{test_node.id}/explorer", f"/api/v1/nodes/{test_node.id}/explorer/", 200),
        ("get", f"/api/v1/nodes/{test_node.id}/providers", f"/api/v1/nodes/{test_node.id}/providers/", 200),
        ("get", f"/api/v1/nodes/{test_node.id}/usenet/config", f"/api/v1/nodes/{test_node.id}/usenet/config/", 200),
        ("get", f"/api/v1/nodes/{test_node.id}/radarr/config", f"/api/v1/nodes/{test_node.id}/radarr/config/", 200),
        ("get", f"/api/v1/nodes/{test_node.id}/sonarr/config", f"/api/v1/nodes/{test_node.id}/sonarr/config/", 200),
        # Under /api/v1/library/nodes
        ("get", "/api/v1/library/nodes", "/api/v1/library/nodes/", 200),
        ("get", "/api/v1/library/nodes/pending", "/api/v1/library/nodes/pending/", 200),
        ("post", "/api/v1/library/nodes/heartbeat", "/api/v1/library/nodes/heartbeat/", 200),
    ]

    for m, no_slash, with_slash, exp_status in pairs:
        handler = getattr(client, m)
        r_no = handler(no_slash, data={}, format="json")
        r_with = handler(with_slash, data={}, format="json")

        # Both must not be 404, and must not redirect unexpectedly
        no_ok = (r_no.status_code == exp_status)
        with_ok = (r_with.status_code == exp_status)

        if no_ok and with_ok:
            results["trailing_slash_handling"]["passed"] += 1
        else:
            results["trailing_slash_handling"]["failed"] += 1
            results["trailing_slash_handling"]["details"].append(
                f"{m.upper()}: no_slash '{no_slash}' -> {r_no.status_code}, with_slash '{with_slash}' -> {r_with.status_code} (expected {exp_status})"
            )

    print(
        f"Trailing Slash Probe: {results['trailing_slash_handling']['passed']} pairs PASSED, {results['trailing_slash_handling']['failed']} FAILED."
    )
    for fail in results["trailing_slash_handling"]["details"][:5]:
        print(f"  FAIL: {fail}")

    print("\n" + "=" * 80)
    print("PROBE 3: USERNODE MODEL CONSTRAINTS & BEHAVIOR")
    print("=" * 80)

    # 3.1 Table name
    if UserNode._meta.db_table == "user_nodes":
        results["usernode_constraints"]["passed"] += 1
    else:
        results["usernode_constraints"]["failed"] += 1
        results["usernode_constraints"]["details"].append(
            f"Table name is {UserNode._meta.db_table}, expected 'user_nodes'"
        )

    # 3.2 Machine ID uniqueness constraint
    m_id = uuid.uuid4()
    n1 = UserNode.objects.create(
        user=user,
        name="Unique Node 1",
        local_url="http://10.0.0.1:8090",
        machine_id=m_id,
        api_key="k1",
    )
    try:
        n2 = UserNode.objects.create(
            user=user,
            name="Unique Node 2",
            local_url="http://10.0.0.2:8090",
            machine_id=m_id,
            api_key="k2",
        )
        results["usernode_constraints"]["failed"] += 1
        results["usernode_constraints"]["details"].append(
            "machine_id duplicate was permitted without IntegrityError"
        )
    except IntegrityError:
        results["usernode_constraints"]["passed"] += 1

    # 3.3 Default values and URL auto-population
    n3 = UserNode(
        user=user,
        name="Default Check",
        local_url="http://192.168.1.10:8000",
        is_local=True,
    )
    n3.save()
    if n3.port == 7777 and n3.primary_url == "http://192.168.1.10:8000" and n3.is_online is True:
        results["usernode_constraints"]["passed"] += 1
    else:
        results["usernode_constraints"]["failed"] += 1
        results["usernode_constraints"]["details"].append(
            f"Defaults failed: port={n3.port}, primary_url={n3.primary_url}, is_online={n3.is_online}"
        )

    # 3.4 JSONField support (complex structures)
    interfaces = [
        {"type": "loopback", "ip": "127.0.0.1", "url": "http://127.0.0.1:7777", "priority": 10},
        {"type": "lan", "ip": "192.168.1.50", "url": "http://192.168.1.50:7777", "priority": 50},
        {"type": "tailscale", "ip": "100.64.0.5", "url": "http://100.64.0.5:7777", "priority": 80},
    ]
    stats = {
        "cpu_percent": 14.5,
        "memory_used_bytes": 4294967296,
        "memory_total_bytes": 17179869184,
        "disk": {"free": 500000000000, "total": 1000000000000},
    }
    n3.network_interfaces = interfaces
    n3.system_stats = stats
    n3.save(update_fields=["network_interfaces", "system_stats"])
    n3.refresh_from_db()
    if len(n3.network_interfaces) == 3 and n3.system_stats["cpu_percent"] == 14.5:
        results["usernode_constraints"]["passed"] += 1
    else:
        results["usernode_constraints"]["failed"] += 1
        results["usernode_constraints"]["details"].append(
            "JSONField complex data retrieval failed"
        )

    # 3.5 Backwards-compatible properties
    n3.auth_token = "new_token_val"
    if n3.api_key == "new_token_val" and n3.auth_token == "new_token_val":
        results["usernode_constraints"]["passed"] += 1
    else:
        results["usernode_constraints"]["failed"] += 1
        results["usernode_constraints"]["details"].append("auth_token property failed")

    # 3.6 save(update_fields) validation
    try:
        # Saving with last_seen_at (a property) in update_fields must raise ValueError
        n3.save(update_fields=["last_seen_at"])
        results["usernode_constraints"]["failed"] += 1
        results["usernode_constraints"]["details"].append(
            "update_fields=['last_seen_at'] did not raise ValueError"
        )
    except ValueError:
        results["usernode_constraints"]["passed"] += 1

    print(
        f"UserNode Constraints Probe: {results['usernode_constraints']['passed']} checks PASSED, {results['usernode_constraints']['failed']} FAILED."
    )
    for fail in results["usernode_constraints"]["details"][:5]:
        print(f"  FAIL: {fail}")

    print("\n" + "=" * 80)
    print("PROBE 4: PURE SNAKE_CASE CONTRACT")
    print("=" * 80)

    serializer = UserNodeSerializer(test_node, context={"request": client.get("/").wsgi_request})
    data = serializer.data

    non_snake_keys = []
    for k in data.keys():
        if not is_snake_case(k):
            non_snake_keys.append(k)

    if not non_snake_keys:
        results["snake_case_contract"]["passed"] += 1
    else:
        results["snake_case_contract"]["failed"] += 1
        results["snake_case_contract"]["details"].append(
            f"UserNodeSerializer contains non-snake_case keys: {non_snake_keys}"
        )

    # Also test live endpoint responses for snake_case keys
    list_res = client.get("/api/v1/nodes")
    if list_res.status_code == 200:
        rows = list_res.json()
        if rows and isinstance(rows, list):
            bad_keys = [k for k in rows[0].keys() if not is_snake_case(k)]
            if not bad_keys:
                results["snake_case_contract"]["passed"] += 1
            else:
                results["snake_case_contract"]["failed"] += 1
                results["snake_case_contract"]["details"].append(
                    f"GET /api/v1/nodes returned non-snake_case keys: {bad_keys}"
                )
    else:
        results["snake_case_contract"]["failed"] += 1
        results["snake_case_contract"]["details"].append(
            f"GET /api/v1/nodes returned {list_res.status_code}"
        )

    print(
        f"Snake_case Contract Probe: {results['snake_case_contract']['passed']} checks PASSED, {results['snake_case_contract']['failed']} FAILED."
    )
    for fail in results["snake_case_contract"]["details"][:5]:
        print(f"  FAIL: {fail}")

    print("\n" + "=" * 80)
    print("PROBE 5: SCHEMA & CASCADE CONSISTENCY (DELETION CASCADE)")
    print("=" * 80)
    # Test UserNode deletion to verify if reverse relations (like node_game_sources) cause crash
    probe_del_node = UserNode.objects.create(
        user=user,
        name="Deletion Test Node",
        local_url="http://127.0.0.1:8099",
        api_key="del_key",
    )
    try:
        probe_del_node.delete()
        results["schema_and_migration_consistency"]["passed"] += 1
        print("  UserNode.delete() succeeded without foreign-key cascade table errors.")
    except Exception as exc:
        results["schema_and_migration_consistency"]["failed"] += 1
        results["schema_and_migration_consistency"]["details"].append(
            f"UserNode.delete() crashed with {type(exc).__name__}: {exc}"
        )
        print(f"  CRITICAL FAILURE: UserNode.delete() crashed: {type(exc).__name__}: {exc}")

    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    total_passed = sum(v["passed"] for v in results.values())
    total_failed = sum(v["failed"] for v in results.values())
    print(f"Total Probes Passed: {total_passed}")
    print(f"Total Probes Failed: {total_failed}")

    print(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    run_probes()
