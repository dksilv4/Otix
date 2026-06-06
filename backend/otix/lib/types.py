# TODO: Review this file
"""Shared type aliases.

Avoids typing.Any in favour of precise, narrow types.
"""

from __future__ import annotations

type JSONValue = str | int | float | bool | None | list[JSONValue] | dict[str, JSONValue]
"""Recursive type for arbitrary JSON data (external API responses)."""
