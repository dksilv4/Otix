"""Async provider-client HTTP machinery (port of ``otix.providers.base``).

Like the rest of ``core`` this is app-agnostic infra, not an installed app:
``BaseProvider`` gives every concrete provider client (TMDB/IGDB/SteamGrid/
MusicBrainz, ported later) the same rate-limited, circuit-broken, retry/cached
HTTP layer. Subclasses supply an ``httpx.AsyncClient`` and a provider name and
inherit ``_get``/``_post``.
"""
