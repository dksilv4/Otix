"""Database hydration utilities and bulk persistence helpers.

Provides safe bulk operations that respect PostgreSQL bind parameter limits,
external ID resolution, and transactional seed boundary decorators.
"""

from __future__ import annotations

import asyncio
import functools
from collections.abc import Callable, Sequence
from typing import Any

from django.apps import apps
from django.db import transaction


def safe_bulk_create(
    model_class: Any,
    instances: Sequence[Any],
    batch_size: int = 500,
    ignore_conflicts: bool = True,
) -> list[Any]:
    """Execute ``bulk_create`` guaranteeing no PostgreSQL 65,535 parameter overflow.

    Calculates maximum safe batch size based on the model's concrete field count,
    ensuring ``batch_size * num_fields <= 65535``.
    """
    if not instances:
        return []

    # Calculate number of concrete database columns
    concrete_fields = getattr(model_class._meta, "concrete_fields", ())
    num_fields = max(len(concrete_fields), 1)

    # 65535 is PostgreSQL's hard maximum query parameter count ($1..$65535)
    max_safe_batch = 65535 // num_fields
    effective_batch_size = max(1, min(batch_size, max_safe_batch))

    return list(
        model_class.objects.bulk_create(
            instances,
            batch_size=effective_batch_size,
            ignore_conflicts=ignore_conflicts,
        )
    )


def prefetch_external_ids(
    provider: str,
    external_ids: set[str] | Sequence[str],
    content_type: Any,
) -> dict[str, int]:
    """Single-query mapping of provider external IDs to internal object IDs.

    Args:
        provider: Provider identifier string (e.g. 'tmdb', 'igdb').
        external_ids: Collection of external ID strings to query.
        content_type: ContentType instance, model class, or integer content type ID.

    Returns:
        Dictionary mapping external_id string to internal object_id integer.
    """
    if not external_ids:
        return {}

    ExternalID = apps.get_model("media", "ExternalID")
    ContentType = apps.get_model("contenttypes", "ContentType")

    # Resolve content_type
    filter_kwargs: dict[str, Any] = {
        "provider": provider,
        "external_id__in": list(external_ids),
    }

    if isinstance(content_type, int):
        filter_kwargs["content_type_id"] = content_type
    elif isinstance(content_type, ContentType):
        filter_kwargs["content_type"] = content_type
    elif hasattr(content_type, "_meta") and isinstance(content_type, type):
        # Model class (e.g. Person, MediaItem)
        filter_kwargs["content_type"] = ContentType.objects.get_for_model(content_type)
    else:
        filter_kwargs["content_type"] = content_type

    qs = ExternalID.objects.filter(**filter_kwargs).values_list("external_id", "object_id")
    return dict(qs)


def atomic_seed(func: Callable[..., Any]) -> Callable[..., Any]:
    """Decorator wrapping seed and hydration functions within a database transaction.

    Supports both synchronous and asynchronous functions.
    """
    if asyncio.iscoroutinefunction(func):

        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            async with transaction.atomic():
                return await func(*args, **kwargs)

        return async_wrapper

    @functools.wraps(func)
    def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
        with transaction.atomic():
            return func(*args, **kwargs)

    return sync_wrapper
