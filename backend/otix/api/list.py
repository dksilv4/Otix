from __future__ import annotations

import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db, get_optional_user
from otix.api.schemas.interaction import UserInteractionState
from otix.api.schemas.list import (
    CollaboratorInvite,
    CollaboratorOut,
    CollaboratorUpdate,
    ListExportRequest,
    ListItemAdd,
    ListItemReorder,
    ListLikeStatus,
    RankHistoryOut,
    UserListCreate,
    UserListDetailOut,
    UserListOut,
    UserListUpdate,
    UserRef,
)
from otix.api.schemas.media import MediaItemSummary
from otix.domain.user import User
from otix.services.interaction_service import InteractionService
from otix.services.list_service import ListService

list_router = APIRouter(prefix="/list", tags=["list"])


@list_router.post("", response_model=UserListOut, status_code=status.HTTP_201_CREATED)
async def create_list(
    body: UserListCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserListOut:
    service = ListService(db)
    lst = await service.create_list(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        is_public=body.is_public,
    )
    return UserListOut(
        id=lst.id,
        user_id=lst.user_id,
        name=lst.name,
        description=lst.description,
        is_public=lst.is_public,
        created_at=lst.created_at,
        updated_at=lst.updated_at,
    )


@list_router.get("", response_model=list[UserListOut])
async def discover_public_lists(
    db: AsyncSession = Depends(get_db),
) -> list[UserListOut]:
    service = ListService(db)
    items, _ = await service.list_public_lists()
    return [
        UserListOut(
            id=item.id,
            user_id=item.user_id,
            name=item.name,
            description=item.description,
            is_public=item.is_public,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in items
    ]


@list_router.get("/mine", response_model=list[UserListOut])
async def my_lists(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[UserListOut]:
    service = ListService(db)
    items = await service.list_user_lists(user_id=current_user.id)
    return [
        UserListOut(
            id=item.id,
            user_id=item.user_id,
            name=item.name,
            description=item.description,
            is_public=item.is_public,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in items
    ]


@list_router.get("/{list_id}", response_model=UserListDetailOut)
async def get_list(
    list_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> UserListDetailOut:
    service = ListService(db)
    lst = await service.get_list_with_items(list_id)
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")

    # Check access: public, owner, or accepted collaborator
    can_access = lst.is_public or (
        current_user is not None
        and (current_user.id == lst.user_id or await service._can_access_list(list_id, current_user.id))
    )
    if not can_access:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")

    like_count, is_liked = await service.get_like_status(
        list_id, current_user.id if current_user else None
    )

    # Collaborators
    collabs = await service.get_collaborators(list_id)
    collaborator_outs = [
        CollaboratorOut(
            id=c.id,
            user_id=c.user_id,
            permission=c.permission,
            status=c.status,
            created_at=c.created_at,
            user=UserRef(id=c.user.id, username=c.user.username, avatar_url=c.user.avatar_url) if c.user else None,
        )
        for c in collabs
    ]

    detail = UserListDetailOut(
        id=lst.id,
        user_id=lst.user_id,
        name=lst.name,
        description=lst.description,
        is_public=lst.is_public,
        like_count=like_count,
        is_liked=is_liked,
        created_at=lst.created_at,
        updated_at=lst.updated_at,
        items=[],
        collaborators=collaborator_outs,
    )

    for item in lst.items:
        summary = MediaItemSummary.model_validate(item.media_item)
        detail.items.append(summary)

    if current_user is not None and detail.items:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id,
            media_item_ids=[s.id for s in detail.items],
        )
        for summary in detail.items:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    return detail


@list_router.patch("/{list_id}", response_model=UserListOut)
async def update_list(
    list_id: str,
    body: UserListUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserListOut:
    service = ListService(db)
    lst = await service.update_list(
        list_id=list_id,
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        is_public=body.is_public,
    )
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    return UserListOut(
        id=lst.id,
        user_id=lst.user_id,
        name=lst.name,
        description=lst.description,
        is_public=lst.is_public,
        created_at=lst.created_at,
        updated_at=lst.updated_at,
    )


@list_router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_list(
    list_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = ListService(db)
    deleted = await service.delete_list(list_id=list_id, user_id=current_user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")


@list_router.post("/{list_id}/item", status_code=status.HTTP_201_CREATED)
async def add_to_list(
    list_id: str,
    body: ListItemAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserListOut:
    service = ListService(db)
    item = await service.add_item(
        list_id=list_id,
        user_id=current_user.id,
        media_item_id=body.media_item_id,
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    # Return updated list
    lst = await service.get_list(list_id)
    return UserListOut(
        id=lst.id,
        user_id=lst.user_id,
        name=lst.name,
        description=lst.description,
        is_public=lst.is_public,
        created_at=lst.created_at,
        updated_at=lst.updated_at,
    )


@list_router.delete("/{list_id}/item/{media_item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_list(
    list_id: str,
    media_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = ListService(db)
    removed = await service.remove_item(
        list_id=list_id,
        user_id=current_user.id,
        media_item_id=media_item_id,
    )
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")


@list_router.put("/{list_id}/item", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_list(
    list_id: str,
    body: ListItemReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = ListService(db)
    ok = await service.reorder_items(
        list_id=list_id,
        user_id=current_user.id,
        media_item_ids=body.media_item_ids,
    )
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")


# ── Collaborators ──────────────────────────────────────────────────


@list_router.get("/{list_id}/collaborators", response_model=list[CollaboratorOut])
async def list_collaborators(
    list_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CollaboratorOut]:
    service = ListService(db)
    collabs = await service.get_collaborators(list_id)
    return [
        CollaboratorOut(
            id=c.id,
            user_id=c.user_id,
            permission=c.permission,
            status=c.status,
            created_at=c.created_at,
            user=UserRef(id=c.user.id, username=c.user.username, avatar_url=c.user.avatar_url) if c.user else None,
        )
        for c in collabs
    ]


@list_router.post("/{list_id}/collaborators", response_model=CollaboratorOut, status_code=status.HTTP_201_CREATED)
async def invite_collaborator(
    list_id: str,
    body: CollaboratorInvite,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CollaboratorOut:
    service = ListService(db)
    collab = await service.add_collaborator(
        list_id=list_id,
        actor_id=current_user.id,
        target_user_id=body.user_id,
        permission=body.permission,
    )
    if collab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    return CollaboratorOut(
        id=collab.id,
        user_id=collab.user_id,
        permission=collab.permission,
        status=collab.status,
        created_at=collab.created_at,
    )


@list_router.delete("/{list_id}/collaborators/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_collaborator(
    list_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = ListService(db)
    removed = await service.remove_collaborator(
        list_id=list_id,
        actor_id=current_user.id,
        target_user_id=user_id,
    )
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)


@list_router.post("/{list_id}/collaborators/accept", status_code=status.HTTP_204_NO_CONTENT)
async def accept_collaboration(
    list_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = ListService(db)
    ok = await service.accept_collaboration(list_id=list_id, user_id=current_user.id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")


@list_router.post("/{list_id}/collaborators/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline_collaboration(
    list_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = ListService(db)
    ok = await service.decline_collaboration(list_id=list_id, user_id=current_user.id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")


# ── Likes ──────────────────────────────────────────────────────────


@list_router.post("/{list_id}/like", response_model=ListLikeStatus)
async def like_list(
    list_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ListLikeStatus:
    service = ListService(db)
    await service.like_list(list_id=list_id, user_id=current_user.id)
    count, is_liked = await service.get_like_status(list_id, current_user.id)
    return ListLikeStatus(like_count=count, is_liked=is_liked)


@list_router.delete("/{list_id}/like", response_model=ListLikeStatus)
async def unlike_list(
    list_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ListLikeStatus:
    service = ListService(db)
    await service.unlike_list(list_id=list_id, user_id=current_user.id)
    count, is_liked = await service.get_like_status(list_id, current_user.id)
    return ListLikeStatus(like_count=count, is_liked=is_liked)


# ── Export ─────────────────────────────────────────────────────────


@list_router.get("/{list_id}/export")
async def export_list(
    list_id: str,
    format: str = Query("json"),
    db: AsyncSession = Depends(get_db),
) -> PlainTextResponse:
    service = ListService(db)
    lst = await service.get_list_with_items(list_id)
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    if not lst.is_public:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")

    items = []
    for item in lst.items:
        items.append({
            "rank": item.sort_order + 1,
            "title": item.media_item.title,
            "media_type": item.media_item.media_type,
            "release_date": str(item.media_item.release_date) if item.media_item.release_date else "",
            "avg_rating": item.media_item.avg_rating,
        })

    if format == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=["rank", "title", "media_type", "release_date", "avg_rating"])
        writer.writeheader()
        writer.writerows(items)
        return PlainTextResponse(content=output.getvalue(), media_type="text/csv")

    # JSON
    return PlainTextResponse(
        content=json.dumps({"list_name": lst.name, "items": items}, indent=2),
        media_type="application/json",
    )


# ── Rank history ───────────────────────────────────────────────────


@list_router.get("/{list_id}/history", response_model=list[RankHistoryOut])
async def list_rank_history(
    list_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[RankHistoryOut]:
    service = ListService(db)
    entries = await service.get_rank_history(list_id)
    return [
        RankHistoryOut(
            id=e.id,
            media_item_id=e.media_item_id,
            user_id=e.user_id,
            old_sort_order=e.old_sort_order,
            new_sort_order=e.new_sort_order,
            changed_at=e.changed_at,
            media_item=MediaItemSummary.model_validate(e.media_item) if e.media_item else None,
        )
        for e in entries
    ]
