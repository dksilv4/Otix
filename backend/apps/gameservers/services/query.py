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


def query_minecraft(host: str, port: int, timeout: float = 3.0) -> dict[str, Any]:
    """Query a Minecraft server using the Server List Ping protocol."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect((host, port))
        connect_time = time.monotonic()

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


def query_a2s(host: str, query_port: int, timeout: float = 3.0) -> dict[str, Any]:
    """Query a Steam / Source server using the Valve A2S_INFO protocol."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        start_time = time.monotonic()
        # Header: -1 (4 bytes 0xFF), 'T', "Source Engine Query\x00"
        query_payload = b"\xFF\xFF\xFF\xFFTSource Engine Query\x00"
        sock.sendto(query_payload, (host, query_port))

        response, _ = sock.recvfrom(4096)
        if len(response) < 5:
            raise ValueError("Response too short")

        header = response[:4]
        if header != b"\xFF\xFF\xFF\xFF":
            raise ValueError("Invalid header")

        res_type = response[4]
        # Challenge response 0x41 ('A') -> re-send with challenge
        if res_type == 0x41:
            challenge = response[5:9]
            query_payload = b"\xFF\xFF\xFF\xFFTSource Engine Query\x00" + challenge
            sock.sendto(query_payload, (host, query_port))
            response, _ = sock.recvfrom(4096)
            if len(response) < 5 or response[:4] != b"\xFF\xFF\xFF\xFF":
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


def query_generic(host: str, port: int, timeout: float = 3.0) -> dict[str, Any]:
    """Fallback TCP ping for generic game servers."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    start_time = time.monotonic()
    try:
        sock.connect((host, port))
        latency_ms = int((time.monotonic() - start_time) * 1000)
        return {
            "status": "online",
            "ping_ms": latency_ms,
        }
    finally:
        sock.close()


def query_game_server(server: Any) -> dict[str, Any]:
    """Execute live query against a DedicatedGameServer and persist its state."""
    host = server.host
    port = server.port
    query_port = server.effective_query_port
    server_type = server.server_type

    result: dict[str, Any] = {"status": "offline"}

    try:
        if server_type == "minecraft":
            result = query_minecraft(host, port)
        elif server_type == "steam_source":
            result = query_a2s(host, query_port)
        else:
            result = query_generic(host, port)
    except Exception as err:
        logger.debug("Query failed for %s (%s:%s): %s", server.name, host, port, err)
        result = {"status": "offline", "ping_ms": None}

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
