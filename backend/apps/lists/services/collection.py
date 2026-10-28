"""Collection service logic: TMDB collection hydration and franchise normalization."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from django.contrib.contenttypes.models import ContentType
from django.utils.text import slugify

from apps.lists.models import Collection, CollectionItem
from apps.media.models import ExternalID, Franchise, Movie
from core.providers.tmdb.transformers import image_url

if TYPE_CHECKING:
    from apps.media.models import MediaItem

logger = logging.getLogger(__name__)

_SUFFIXES = (
    " collection",
    " franchise",
    " film series",
    " series",
    " saga",
    " trilogy",
)


def normalize_franchise_name(name: str) -> str:
    """Normalize a franchise/collection name for cross-provider matching.

    Strips common suffixes, lowers, removes punctuation, collapses whitespace.
    ``"The Witcher Collection"`` and ``"The Witcher Franchise"`` both become
    ``"the witcher"``.
    """
    normalized = (name or "").lower().strip()
    for suffix in _SUFFIXES:
        if normalized.endswith(suffix):
            normalized = normalized[: -len(suffix)].strip()
            break
    normalized = re.sub(r"[^\w\s]", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _resolve_image(path_or_url: str | None) -> str | None:
    if not path_or_url:
        return None
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        return path_or_url
    return image_url(path_or_url, size="original")


def upsert_collection_from_tmdb(
    coll_data: dict[str, Any], media_item: MediaItem | None = None
) -> Collection | None:
    """Upsert a Collection entity from TMDB collection data and link media_item.

    Accepts both detail-level collection payload (from ``/collection/{id}``) and
    the minimal ``belongs_to_collection`` dict embedded in movie detail.
    """
    if not isinstance(coll_data, dict):
        return None
    tmdb_id = coll_data.get("id")
    if tmdb_id is None:
        return None

    str_tmdb_id = str(tmdb_id)
    content_type = ContentType.objects.get_for_model(Collection)
    ext = ExternalID.objects.filter(
        content_type=content_type,
        provider="tmdb",
        external_id=str_tmdb_id,
    ).first()

    collection: Collection | None = None
    if ext is not None:
        collection = Collection.objects.filter(pk=ext.object_id).first()

    name = (coll_data.get("name") or "").strip() or "Collection"
    overview = coll_data.get("overview")
    poster_url = _resolve_image(coll_data.get("poster_path") or coll_data.get("poster_url"))
    backdrop_url = _resolve_image(coll_data.get("backdrop_path") or coll_data.get("backdrop_url"))

    if collection is None:
        norm_name = normalize_franchise_name(name)
        franchise: Franchise | None = None
        if norm_name:
            franchise, _ = Franchise.objects.get_or_create(
                slug=slugify(norm_name)[:1000],
                defaults={
                    "name": name.replace(" Collection", "").replace(" collection", "").strip()
                    or norm_name
                },
            )

        collection = Collection.objects.create(
            name=name,
            overview=overview,
            poster_url=poster_url,
            backdrop_url=backdrop_url,
            franchise=franchise,
        )
        ExternalID.objects.create(
            content_type=content_type,
            provider="tmdb",
            external_id=str_tmdb_id,
            object_id=collection.pk,
        )
    else:
        updates: dict[str, Any] = {}
        if name and collection.name != name:
            updates["name"] = name
        if overview and not collection.overview:
            updates["overview"] = overview
        if poster_url and not collection.poster_url:
            updates["poster_url"] = poster_url
        if backdrop_url and not collection.backdrop_url:
            updates["backdrop_url"] = backdrop_url
        if updates:
            for field, val in updates.items():
                setattr(collection, field, val)
            collection.save(update_fields=tuple(updates.keys()))

    if media_item is not None:
        movie = Movie.objects.filter(media_item_id=media_item.pk).first()
        if movie is not None and movie.collection_id != collection.pk:
            movie.collection = collection
            movie.save(update_fields=("collection",))

        CollectionItem.objects.get_or_create(
            collection=collection,
            media_item=media_item,
            defaults={"sort_order": 0},
        )

    return collection
