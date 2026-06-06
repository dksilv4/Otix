from __future__ import annotations
from fastapi import APIRouter

from otix.api.auth.two_factor.setup import router as setup_router
from otix.api.auth.two_factor.enable import router as enable_router
from otix.api.auth.two_factor.disable import router as disable_router
from otix.api.auth.two_factor.login_verify import router as login_verify_router

router = APIRouter()

router.include_router(setup_router)
router.include_router(enable_router)
router.include_router(disable_router)
router.include_router(login_verify_router)
