"""List domain logic as plain callables over the models.

Views stay thin; every query/mutation lives here. The functions mirror the
legacy ``ListService`` (``old-backend/otix/services/list_service.py``):

- ownership/access rules are identical (owner, or accepted collaborator; writes
  like update/delete/add-item/reorder are owner-only, while collaborator
  management additionally allows accepted EDIT/ADMIN collaborators);
- ``None`` / ``False`` returns signal "not found" so views can raise 404s.
"""

from django.db.models import BooleanField, IntegerField, Max, Prefetch, Q, Value
from django.db.models.query import QuerySet

from apps.lists.models import (
    ListItemRankHistory,
    MediaListCollaborator,
    MediaListLike,
    UserList,
    UserListItem,
)

#: Permissions that let an accepted collaborator manage other collaborators.
_COLLAB_EDIT_PERMISSIONS = ("EDIT", "ADMIN")


def _with_empty_like_state(lst: UserList) -> UserList:
    """Attach the legacy placeholder like keys shared by every ``UserListOut``."""
    lst.like_count = 0
    lst.is_liked = False
    return lst


def _public_annotation() -> dict:
    return {
        "like_count": Value(0, output_field=IntegerField()),
        "is_liked": Value(False, output_field=BooleanField()),
    }


def list_public_lists() -> QuerySet[UserList]:
    """Public lists, newest-updated first (paginated by the view)."""
    return (
        UserList.objects.filter(is_public=True)
        .annotate(**_public_annotation())
        .order_by("-updated_at")
    )


def list_user_lists(user_id: int) -> QuerySet[UserList]:
    """Lists owned by or shared (accepted collaborator) with the user."""
    return (
        UserList.objects.filter(
            Q(user_id=user_id)
            | Q(collaborators__user_id=user_id, collaborators__status="accepted")
        )
        .distinct()
        .annotate(**_public_annotation())
        .order_by("-updated_at")
    )


def create_list(user_id: int, name: str, description: str | None, is_public: bool) -> UserList:
    """Create a list owned by ``user_id``."""
    lst = UserList.objects.create(
        user_id=user_id,
        name=name,
        description=description,
        is_public=is_public,
    )
    return _with_empty_like_state(lst)


def get_list(list_id: int) -> UserList | None:
    """Fetch a list by id regardless of ownership/visibility."""
    return UserList.objects.filter(pk=list_id).first()


def get_owner_list(list_id: int, user_id: int) -> UserList | None:
    """Fetch a list only when ``user_id`` is its owner."""
    return UserList.objects.filter(pk=list_id, user_id=user_id).first()


def get_owned_list(list_id: int, user_id: int) -> UserList | None:
    """Fetch a list the user owns or can manage (accepted EDIT/ADMIN collaborator).

    Used by collaborator-management writes, mirroring legacy ``_get_owned_list``.
    """
    lst = get_list(list_id)
    if lst is None:
        return None
    if lst.user_id == user_id:
        return lst
    is_editor = MediaListCollaborator.objects.filter(
        list_id=list_id,
        user_id=user_id,
        status="accepted",
        permission__in=_COLLAB_EDIT_PERMISSIONS,
    ).exists()
    return lst if is_editor else None


def update_list(
    list_id: int,
    user_id: int,
    name: str | None = None,
    description: str | None = None,
    is_public: bool | None = None,
) -> UserList | None:
    """Update the owner's list fields; ``None`` leaves a field unchanged."""
    lst = get_owner_list(list_id, user_id)
    if lst is None:
        return None
    if name is not None:
        lst.name = name
    if description is not None:
        lst.description = description
    if is_public is not None:
        lst.is_public = is_public
    lst.save()
    return _with_empty_like_state(lst)


def delete_list(list_id: int, user_id: int) -> bool:
    """Delete the owner's list; ``False`` when missing or not owned."""
    lst = get_owner_list(list_id, user_id)
    if lst is None:
        return False
    lst.delete()
    return True


def add_item(list_id: int, user_id: int, media_item_id: int) -> UserList | None:
    """Append a media item to the owner's list and return the list."""
    lst = get_owner_list(list_id, user_id)
    if lst is None:
        return None
    max_order = UserListItem.objects.filter(list_id=list_id).aggregate(
        max_order=Max("sort_order")
    )["max_order"]
    UserListItem.objects.create(
        list_id=list_id,
        media_item_id=media_item_id,
        sort_order=(max_order + 1) if max_order is not None else 0,
    )
    return _with_empty_like_state(lst)


def remove_item(list_id: int, user_id: int, media_item_id: int) -> bool:
    """Remove a media item from the owner's list."""
    if get_owner_list(list_id, user_id) is None:
        return False
    removed, _ = UserListItem.objects.filter(
        list_id=list_id, media_item_id=media_item_id
    ).delete()
    return removed > 0


def reorder_items(list_id: int, user_id: int, media_item_ids: list[int]) -> bool:
    """Apply a new ordering to the owner's list, recording rank history.

    Only ids currently on the list are touched. The legacy service read the old
    sort order *after* writing the new one (so it never recorded history); here
    the pre-write order is captured so ``list_item_rank_history`` rows reflect
    the intended deltas.
    """
    if get_owner_list(list_id, user_id) is None:
        return False
    existing = dict(
        UserListItem.objects.filter(list_id=list_id).values_list("media_item_id", "sort_order")
    )
    for index, media_item_id in enumerate(media_item_ids):
        old_order = existing.get(media_item_id)
        if old_order is None or old_order == index:
            continue
        UserListItem.objects.filter(
            list_id=list_id, media_item_id=media_item_id
        ).update(sort_order=index)
        ListItemRankHistory.objects.create(
            list_id=list_id,
            media_item_id=media_item_id,
            user_id=user_id,
            old_sort_order=old_order,
            new_sort_order=index,
        )
    return True


def get_collaborators(list_id: int) -> QuerySet[MediaListCollaborator]:
    """All collaborator rows for a list (any status), user joined."""
    return (
        MediaListCollaborator.objects.filter(list_id=list_id)
        .select_related("user")
        .order_by("id")
    )


def add_collaborator(
    list_id: int, actor_id: int, target_user_id: int, permission: str
) -> MediaListCollaborator | None:
    """Invite ``target_user_id`` to a list the actor owns/manages.

    Returns the existing row when the user is already a collaborator (idempotent).
    """
    if get_owned_list(list_id, actor_id) is None:
        return None
    collab, _ = MediaListCollaborator.objects.get_or_create(
        list_id=list_id,
        user_id=target_user_id,
        defaults={"permission": permission, "status": "pending"},
    )
    return collab


def remove_collaborator(list_id: int, actor_id: int, target_user_id: int) -> bool:
    """Remove a collaborator row (any status) from a list the actor manages."""
    if get_owned_list(list_id, actor_id) is None:
        return False
    removed, _ = MediaListCollaborator.objects.filter(
        list_id=list_id, user_id=target_user_id
    ).delete()
    return removed > 0


def accept_collaboration(list_id: int, user_id: int) -> bool:
    """Accept the user's pending invitation to a list."""
    updated = MediaListCollaborator.objects.filter(
        list_id=list_id, user_id=user_id, status="pending"
    ).update(status="accepted")
    return updated > 0


def decline_collaboration(list_id: int, user_id: int) -> bool:
    """Decline (delete) the user's pending invitation to a list."""
    removed, _ = MediaListCollaborator.objects.filter(
        list_id=list_id, user_id=user_id, status="pending"
    ).delete()
    return removed > 0


def get_like_status(list_id: int, user_id: int | None) -> tuple[int, bool]:
    """Like count for a list and, for an authed viewer, whether they liked it."""
    count = MediaListLike.objects.filter(list_id=list_id).count()
    is_liked = False
    if user_id is not None:
        is_liked = MediaListLike.objects.filter(list_id=list_id, user_id=user_id).exists()
    return count, is_liked


def like_list(list_id: int, user_id: int) -> None:
    """Like a list (idempotent)."""
    MediaListLike.objects.get_or_create(list_id=list_id, user_id=user_id)


def unlike_list(list_id: int, user_id: int) -> None:
    """Remove the user's like (idempotent)."""
    MediaListLike.objects.filter(list_id=list_id, user_id=user_id).delete()


def get_list_detail(list_id: int, user_id: int | None) -> UserList | None:
    """A list with items/collaborators/like state, for the detail route.

    Returns ``None`` when the list does not exist or the viewer cannot access a
    private list (owner or accepted collaborator), matching the legacy 404.
    """
    items_qs = UserListItem.objects.select_related("media_item").order_by("sort_order", "id")
    lst = (
        UserList.objects.prefetch_related(
            Prefetch("items", queryset=items_qs),
            "items__media_item__assets",
            "items__media_item__external_ids",
            Prefetch(
                "collaborators",
                queryset=MediaListCollaborator.objects.select_related("user").order_by("id"),
            ),
        )
        .filter(pk=list_id)
        .first()
    )
    if lst is None:
        return None
    if not lst.is_public:
        if user_id is None:
            return None
        if lst.user_id != user_id:
            allowed = any(
                c.user_id == user_id and c.status == "accepted"
                for c in lst.collaborators.all()
            )
            if not allowed:
                return None
    lst.ordered_media_items = [item.media_item for item in lst.items.all()]
    lst.collaborator_rows = list(lst.collaborators.all())
    like_count, is_liked = get_like_status(lst.pk, user_id)
    lst.like_count = like_count
    lst.is_liked = is_liked
    return lst


def get_list_export(list_id: int) -> tuple[str, list[dict]] | None:
    """Export payload for a public list; ``None`` when missing or private."""
    lst = (
        UserList.objects.filter(pk=list_id)
        .prefetch_related(
            Prefetch(
                "items",
                queryset=UserListItem.objects.select_related("media_item").order_by(
                    "sort_order", "id"
                ),
            )
        )
        .first()
    )
    if lst is None or not lst.is_public:
        return None
    items = []
    for entry in lst.items.all():
        media_item = entry.media_item
        items.append(
            {
                "rank": entry.sort_order + 1,
                "title": media_item.title,
                "media_type": media_item.media_type,
                "release_date": media_item.release_date.isoformat()
                if media_item.release_date
                else "",
                "avg_rating": media_item.avg_rating,
            }
        )
    return lst.name, items


def get_rank_history(list_id: int) -> list[ListItemRankHistory]:
    """Most-recent 50 rank changes for a list."""
    return list(
        ListItemRankHistory.objects.select_related("media_item")
        .prefetch_related("media_item__assets", "media_item__external_ids")
        .filter(list_id=list_id)
        .order_by("-changed_at")[:50]
    )
