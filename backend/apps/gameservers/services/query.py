"""Game server querying service.

Implements:
1. Valve A2S Query (UDP) for Source engine & Steam games (Palworld, Valheim, Rust, CS2, etc.)
2. Minecraft Server List Ping (TCP) for Minecraft Java & Bedrock
3. Generic TCP socket connection probe fallback
"""

from __future__ import annotations

import json
import logging
import socket
import struct
import time
from typing import Any

from django.utils import timezone

logger = logging.getLogger(__name__)


def _read_varint(sock: socket.socket) -> int:
    """Read a Minecraft-encoded VarInt from a TCP socket."""
    num_read = 0
    result = 0
    while True:
        byte_data = sock.recv(1)
        if not byte_data:
            raise ConnectionError("Socket closed while reading VarInt")
        val = byte_data[0]
        result |= (val & 0x7F) << (7 * num_read)
        num_read += 1
        if num_read > 5:
            raise ValueError("VarInt too large")
        if (val & 0x80) == 0:
            break
    return result


def _write_varint(val: int) -> bytes:
    """Encode an integer as a Minecraft VarInt."""
    out = bytearray()
    while True:
        temp = val & 0x7F
        val >>= 7
        if val != 0:
            temp |= 0x80
        out.append(temp)
        if val == 0:
            break
    return bytes(out)


def _pack_packet(packet_id: int, payload: bytes) -> bytes:
    """Pack a Minecraft protocol packet (length prefix + packet id + payload)."""
    packet_data = _write_varint(packet_id) + payload
    return _write_varint(len(packet_data)) + packet_data


def _probe_error_message(err: BaseException) -> str:
    """Human-readable probe failure; socket timeouts stringify as bare 'timed out'."""
    if isinstance(err, TimeoutError) or isinstance(err, socket.timeout):
        return "timed out"
    msg = str(err).strip() or err.__class__.__name__
    if msg.lower() in {"timed out", "timeout"}:
        return "timed out"
    return msg


def query_minecraft(host: str, port: int, timeout: float = 5.0) -> dict[str, Any]:
    """Query a Minecraft server using the Server List Ping protocol."""
    sock = socket.create_connection((host, port), timeout=timeout)
    sock.settimeout(timeout)
    connect_time = time.monotonic()
    try:
        # Handshake: packet_id 0x00, protocol 765, host, port, next_state=1 (status)
        host_bytes = host.encode("utf-8")
        handshake_payload = (
            _write_varint(765)
            + _write_varint(len(host_bytes))
            + host_bytes
            + struct.pack(">H", port)
            + _write_varint(1)
        )
        sock.sendall(_pack_packet(0x00, handshake_payload))

        # Status request: packet_id 0x00, empty payload
        sock.sendall(_pack_packet(0x00, b""))

        # Read response length
        _read_varint(sock)
        # Read packet id
        packet_id = _read_varint(sock)
        if packet_id != 0x00:
            raise ValueError(f"Unexpected packet ID: {packet_id}")

        # Read json string length and string
        json_len = _read_varint(sock)
        raw_json = b""
        while len(raw_json) < json_len:
            chunk = sock.recv(min(4096, json_len - len(raw_json)))
            if not chunk:
                break
            raw_json += chunk

        latency_ms = int((time.monotonic() - connect_time) * 1000)
        data = json.loads(raw_json.decode("utf-8", errors="replace"))

        players_data = data.get("players", {})
        online_players = players_data.get("online", 0)
        max_players = players_data.get("max", 0)
        sample = players_data.get("sample", [])
        player_list = [p.get("name") for p in sample if isinstance(p, dict) and p.get("name")]

        version_data = data.get("version", {})
        version_str = version_data.get("name", "")

        desc = data.get("description", "")
        if isinstance(desc, dict):
            motd = desc.get("text", "")
        else:
            motd = str(desc)

        return {
            "status": "online",
            "current_players": online_players,
            "max_players": max_players,
            "player_list": player_list,
            "version": version_str,
            "current_map": motd.strip()[:100],
            "ping_ms": latency_ms,
        }
    finally:
        sock.close()


def query_a2s(host: str, query_port: int, timeout: float = 5.0) -> dict[str, Any]:
    """Query a Steam / Source server using the Valve A2S_INFO protocol."""
    # Prefer IPv4 for A2S (most game hosts); fall back to first resolved address.
    family = socket.AF_UNSPEC
    addr_infos = socket.getaddrinfo(host, query_port, family, socket.SOCK_DGRAM)
    if not addr_infos:
        raise OSError(f"Could not resolve host {host!r}")
    # Prefer AF_INET when available
    addr_infos.sort(key=lambda info: 0 if info[0] == socket.AF_INET else 1)
    family, _, _, _, sockaddr = addr_infos[0]

    sock = socket.socket(family, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        start_time = time.monotonic()
        # Header: -1 (4 bytes 0xFF), 'T', "Source Engine Query\x00"
        query_payload = b"\xff\xff\xff\xffTSource Engine Query\x00"
        sock.sendto(query_payload, sockaddr)

        response, _ = sock.recvfrom(4096)
        if len(response) < 5:
            raise ValueError("Response too short")

        header = response[:4]
        if header != b"\xff\xff\xff\xff":
            raise ValueError("Invalid header")

        res_type = response[4]
        # Challenge response 0x41 ('A') -> re-send with challenge
        if res_type == 0x41:
            challenge = response[5:9]
            query_payload = b"\xff\xff\xff\xffTSource Engine Query\x00" + challenge
            sock.sendto(query_payload, sockaddr)
            response, _ = sock.recvfrom(4096)
            if len(response) < 5 or response[:4] != b"\xff\xff\xff\xff":
                raise ValueError("Invalid response after challenge")
            res_type = response[4]

        if res_type != 0x49:  # 'I' (A2S_INFO)
            raise ValueError(f"Expected A2S_INFO response (0x49), got {hex(res_type)}")

        latency_ms = int((time.monotonic() - start_time) * 1000)

        # Parse A2S_INFO payload: skip protocol byte (1 byte at idx 5)
        idx = 6

        def read_cstring() -> str:
            nonlocal idx
            end = response.find(b"\x00", idx)
            if end == -1:
                res = response[idx:].decode("utf-8", errors="replace")
                idx = len(response)
                return res
            res = response[idx:end].decode("utf-8", errors="replace")
            idx = end + 1
            return res

        server_name = read_cstring()
        map_name = read_cstring()
        read_cstring()  # folder (unused)
        read_cstring()  # game_name (unused)

        if idx + 4 <= len(response):
            idx += 2  # skip app_id (2 bytes)
            players = response[idx]
            idx += 1
            max_players = response[idx]
            idx += 1
        else:
            players = 0
            max_players = 0

        # Skip bots, server type, env, visibility, vac
        idx += 5
        version_str = read_cstring() if idx < len(response) else ""

        return {
            "status": "online",
            "name": server_name,
            "current_players": int(players),
            "max_players": int(max_players),
            "current_map": map_name,
            "version": version_str,
            "player_list": [],
            "ping_ms": latency_ms,
        }
    finally:
        sock.close()


def query_generic(host: str, port: int, timeout: float = 5.0) -> dict[str, Any]:
    """Fallback TCP ping for generic game servers (dual-stack via create_connection)."""
    start_time = time.monotonic()
    with socket.create_connection((host, port), timeout=timeout):
        latency_ms = int((time.monotonic() - start_time) * 1000)
    return {
        "status": "online",
        "ping_ms": latency_ms,
    }


def _run_protocol_query(
    host: str,
    port: int,
    query_port: int,
    server_type: str,
    timeout: float,
) -> dict[str, Any]:
    if server_type == "minecraft":
        return query_minecraft(host, port, timeout=timeout)
    if server_type == "steam_source":
        return query_a2s(host, query_port, timeout=timeout)
    return query_generic(host, port, timeout=timeout)


def _tcp_fallback_result(
    host: str,
    port: int,
    server_type: str,
    query_port: int,
    protocol_err: BaseException,
    timeout: float,
) -> dict[str, Any] | None:
    """If protocol query failed, accept a successful TCP connect as reachable."""
    if server_type == "generic":
        return None
    try:
        tcp = query_generic(host, port, timeout=timeout)
    except Exception as tcp_err:
        logger.debug("TCP fallback failed for %s:%s: %s", host, port, tcp_err)
        return None

    proto = "A2S UDP query" if server_type == "steam_source" else "Minecraft status query"
    hint = ""
    if server_type == "steam_source" and query_port == port:
        hint = " Query port often differs from the game port — set Query Port if you have it."
    elif server_type == "steam_source":
        hint = f" Check query port {query_port} allows UDP."

    tcp["query_warning"] = (
        f"Reachable over TCP on port {port}, but {proto} failed "
        f"({_probe_error_message(protocol_err)}).{hint}"
    )
    return tcp


def probe_server_connection(
    host: str,
    port: int,
    query_port: int | None = None,
    server_type: str = "generic",
    timeout: float = 5.0,
) -> dict[str, Any]:
    """Transient probe of a server without saving to database.

    Steam/Minecraft protocol queries run first. On failure, fall back to a TCP
    connect on the game port so a reachable host is not reported offline solely
    because UDP A2S / status ping timed out (wrong query port, UDP blocked, etc.).
    """
    effective_query_port = query_port or port
    try:
        return _run_protocol_query(host, port, effective_query_port, server_type, timeout)
    except Exception as err:
        logger.debug("Transient probe failed for %s:%s: %s", host, port, err)
        fallback = _tcp_fallback_result(host, port, server_type, effective_query_port, err, timeout)
        if fallback is not None:
            return fallback

        detail = _probe_error_message(err)
        if detail == "timed out" and server_type == "steam_source":
            detail = (
                f"A2S query timed out on UDP port {effective_query_port}. "
                "Confirm the query port (often different from the game port), "
                "that UDP is allowed, and that Otix can reach the host "
                "(probes run from the Otix backend, not your browser)."
            )
        elif detail == "timed out":
            detail = (
                f"Connection timed out to {host}:{port}. "
                "Confirm host/port and that Otix can reach the server "
                "(probes run from the Otix backend, not your browser)."
            )
        return {
            "status": "offline",
            "ping_ms": None,
            "error": detail,
        }


def query_game_server(server: Any) -> dict[str, Any]:
    """Execute live query against a DedicatedGameServer and persist its state."""
    host = server.host
    port = server.port
    query_port = server.effective_query_port
    server_type = server.server_type

    result: dict[str, Any] = {"status": "offline"}

    try:
        result = _run_protocol_query(host, port, query_port, server_type, timeout=5.0)
    except Exception as err:
        logger.debug("Query failed for %s (%s:%s): %s", server.name, host, port, err)
        fallback = _tcp_fallback_result(host, port, server_type, query_port, err, timeout=5.0)
        result = fallback if fallback is not None else {"status": "offline", "ping_ms": None}

    # Update server model fields
    server.status = result.get("status", "offline")
    if result.get("status") == "online":
        if "current_players" in result:
            server.current_players = result["current_players"]
        if "max_players" in result:
            server.max_players = result["max_players"]
        if "player_list" in result:
            server.player_list = result["player_list"]
        if "current_map" in result and result["current_map"]:
            server.current_map = result["current_map"]
        if "version" in result and result["version"]:
            server.version = result["version"]
        server.ping_ms = result.get("ping_ms")
    else:
        server.ping_ms = None

    server.last_queried_at = timezone.now()
    server.save(
        update_fields=[
            "status",
            "current_players",
            "max_players",
            "player_list",
            "current_map",
            "version",
            "ping_ms",
            "last_queried_at",
            "updated_at",
        ]
    )
    return result
