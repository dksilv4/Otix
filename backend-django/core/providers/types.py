"""Shared typing aliases for the provider HTTP layers."""

from __future__ import annotations

from typing import Any

# A JSON document value — used to type raw provider API payloads.
JSONValue = str | int | float | bool | None | list[Any] | dict[str, Any]
