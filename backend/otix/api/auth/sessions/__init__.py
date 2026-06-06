from __future__ import annotations

from fastapi import APIRouter

from otix.api.auth.sessions.list import router as list_router
from otix.api.auth.sessions.revoke import router as revoke_router
from otix.api.auth.sessions.revoke_all import router as revoke_all_router

router = APIRouter()
router.include_router(list_router)
router.include_router(revoke_router)
router.include_router(revoke_all_router)
