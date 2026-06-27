from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.user import User
from otix.services.push_service import PushService
from otix.services.vapid import get_vapid_public_key, vapid_private_key

router = APIRouter(prefix="/push", tags=["push"])


class SubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class UnsubscribeRequest(BaseModel):
    endpoint: str


@router.get("/vapid-public-key")
async def vapid_public_key_endpoint():
    return {"public_key": get_vapid_public_key()}


@router.post("/subscribe", status_code=201)
async def subscribe(
    body: SubscribeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = PushService(db, vapid_private_key, get_vapid_public_key())
    await service.subscribe(current_user.id, body.endpoint, body.p256dh, body.auth)
    await db.commit()
    return {"message": "Subscribed"}


@router.delete("/subscribe", status_code=200)
async def unsubscribe(
    body: UnsubscribeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = PushService(db, vapid_private_key, get_vapid_public_key())
    await service.unsubscribe(current_user.id, body.endpoint)
    await db.commit()
    return {"message": "Unsubscribed"}
