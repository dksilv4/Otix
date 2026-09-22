"""Proxy-fetch dispatch: choose between the server's own httpx fetch and a
connected client device that holds the user's provider key.

The seed services already accept a raw provider dict (``seed_*_from_*``), and
the only server-side fetch is the httpx call inside ``fetch_and_seed_*``. So
when the server lacks a provider key but an online, capable ``ClientDevice``
holds one, the sync orchestrator parks the ``SyncJob`` as ``awaiting_client``
and publishes a ``fetch_request`` on the owning user's persistent SSE channel
(``fetch:{user_id}:requests:events``). The client fetches with its own key and
POSTs the raw dict back to ``/fetch/result``, which seeds and completes the job.

This module is deliberately provider-key aware but engine-agnostic: the proxy
gate only guards providers whose engine needs a server API key. Keyless /
unknown providers always resolve to the server path so nothing here changes
existing behaviour for them.
"""

from __future__ import annotations

import json
import logging

from django.conf import settings

from apps.integrations.models import ClientDevice, SyncJob
from core import progress as progress_lib
from core.redis import get_client

logger = logging.getLogger(__name__)

# Providers whose engine needs a server API key before it can fetch. Absent
# from this map (plex/youtube/steam/unknown) → the server
# always handles them; there is nothing to proxy.
_PROVIDER_REQUIRED_SETTINGS = {
    "tmdb": ("TMDB_API_KEY",),
    "igdb": ("IGDB_CLIENT_ID", "IGDB_CLIENT_SECRET"),
    "steamgrid": ("STEAM_GRID_API_KEY",),
    "omdb": ("OMDB_API_KEY",),
    "fanart": ("FANART_API_KEY",),
}

# Status a job is parked in while an external client fetches its raw payload.
AWAITING_CLIENT = "awaiting_client"


def server_can_fetch(provider: str) -> bool:
    """True when the server holds the keys a fetch for *provider* needs.

    Providers without a keyed profile (or unknown ones) are treated as
    server-handled so the gate is a no-op for keyless providers.
    """
    if provider == "tmdb":
        return bool(getattr(settings, "TMDB_RAT", None) or getattr(settings, "TMDB_API_KEY", None))
    required = _PROVIDER_REQUIRED_SETTINGS.get(provider)
    if not required:
        return True
    return all(getattr(settings, name, None) for name in required)


def fetch_request_channel(user_id: int) -> str:
    """Persistent SSE channel a user's connected devices listen on."""
    return f"fetch:{user_id}:requests:events"


def _publish_fetch_request(job: SyncJob, task_id: str) -> None:
    payload = {
        "task_id": task_id,
        "provider": job.provider,
        "entity_type": job.entity_type,
        "external_id": job.external_id,
    }
    get_client().publish(
        fetch_request_channel(job.user_id),
        json.dumps(payload, separators=(",", ":")),
    )


def dispatch_to_client(job: SyncJob, *, task_id: str) -> bool:
    """Park *job* awaiting an online capable client; False when none exists.

    Picks the most-recently-seen online capable device holding a key for
    ``job.provider``, adopts its owner as ``job.user``, flips the claimed
    (``running``) job to ``awaiting_client``, and publishes a ``fetch_request``
    on that user's channel plus an ``awaiting_client`` frame on the job's own
    sync namespace (so the original requester's SSE shows the state). Returns
    False when no capable device is online or the job is no longer ``running``
    (e.g. it was already parked or completed between claim and dispatch).
    """
    device = ClientDevice.capable_devices(job.provider)[:1]
    if not device:
        return False

    owner = device[0].user_id
    parked = SyncJob.objects.filter(pk=job.pk, status="running").update(
        status=AWAITING_CLIENT, user_id=owner
    )
    if not parked:
        return False

    job.user_id = owner
    _publish_fetch_request(job, task_id)
    context = {
        "provider": job.provider,
        "entity_type": job.entity_type,
        "external_id": job.external_id,
    }
    progress_lib.RedisProgress(f"{job.provider}:sync").publish(
        task_id, "awaiting_client", device=device[0].kind, **context
    )
    logger.info(
        "sync job %s dispatched to client %s (%s) for %s",
        task_id,
        device[0].device_id,
        device[0].kind,
        job.provider,
    )
    return True
