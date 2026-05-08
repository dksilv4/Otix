from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db, get_optional_user
from otix.api.schemas.interaction import UserInteractionState
from otix.api.schemas.list import (
    ListItemAdd,
    ListItemReorder,
    UserListCreate,
    UserListDetailOut,
    UserListOut,
    UserListUpdate,
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

    if not lst.is_public and (current_user is None or current_user.id != lst.user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")

    detail = UserListDetailOut(
        id=lst.id,
        user_id=lst.user_id,
        name=lst.name,
        description=lst.description,
        is_public=lst.is_public,
        created_at=lst.created_at,
        updated_at=lst.updated_at,
        items=[],
    )

    for item in lst.items:
        summary = MediaItemSummary.model_validate(item.media_item)
        detail.items.append(summary)

    # Embed user interaction state when authenticated
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
