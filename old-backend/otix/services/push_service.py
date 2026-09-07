from __future__ import annotations

import json

import structlog
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.push_subscription import PushSubscription

logger = structlog.get_logger()

VAPID_CLAIMS = {"sub": "mailto:notifications@otix.app"}


class PushService:
    def __init__(self, session: AsyncSession, vapid_private_key: str, vapid_public_key: str):
        self.session = session
        self.vapid_private_key = vapid_private_key
        self.vapid_public_key = vapid_public_key

    async def subscribe(self, user_id: str, endpoint: str, p256dh: str, auth: str) -> PushSubscription:
        sub = PushSubscription(
            user_id=user_id,
            endpoint=endpoint,
            p256dh_key=p256dh,
            auth_key=auth,
        )
        self.session.add(sub)
        await self.session.flush()
        return sub

    async def unsubscribe(self, user_id: str, endpoint: str) -> None:
        await self.session.execute(
            delete(PushSubscription).where(
                PushSubscription.user_id == user_id,
                PushSubscription.endpoint == endpoint,
            )
        )
        await self.session.flush()

    async def get_subscriptions(self, user_id: str) -> list[PushSubscription]:
        result = await self.session.scalars(
            select(PushSubscription).where(PushSubscription.user_id == user_id)
        )
        return list(result)

    async def send_notification(
        self,
        user_id: str,
        title: str,
        body: str | None,
        type_: str,
        metadata: dict | None = None,
    ) -> int:
        subs = await self.get_subscriptions(user_id)
        if not subs:
            return 0

        payload = {
            "id": "",
            "type": type_,
            "title": title,
            "body": body,
            "metadata": metadata or {},
        }

        data = json.dumps(payload)
        sent = 0

        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {
                            "p256dh": sub.p256dh_key,
                            "auth": sub.auth_key,
                        },
                    },
                    data=data,
                    vapid_private_key=self.vapid_private_key,
                    vapid_claims=VAPID_CLAIMS,
                )
                sent += 1
            except WebPushException as exc:
                if exc.response and exc.response.status_code == 410:
                    # Subscription expired/gone — remove it
                    await self.session.delete(sub)
                    logger.info("removed expired push subscription", endpoint=sub.endpoint[:50])
                else:
                    logger.warning("push delivery failed", error=str(exc), endpoint=sub.endpoint[:50])

        await self.session.flush()
        return sent
