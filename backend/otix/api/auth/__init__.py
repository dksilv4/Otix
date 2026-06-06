from __future__ import annotations
from fastapi import APIRouter

# ── Auth flows (register, login, refresh, logout, password recovery, verification, sessions, 2FA, me, and OAuth) ──
from otix.api.auth.register import router as register_router
from otix.api.auth.login import router as login_router
from otix.api.auth.refresh import router as refresh_router
from otix.api.auth.logout import router as logout_router
from otix.api.auth.forgot_password import router as forgot_password_router
from otix.api.auth.reset_password import router as reset_password_router
from otix.api.auth.verify_email import router as verify_email_router
from otix.api.auth.sessions import router as sessions_router
from otix.api.auth.two_factor import router as two_factor_router
from otix.api.auth.me import router as me_router

from otix.api.auth.oauth.steam.login import router as steam_login_init_router
from otix.api.auth.oauth.steam.login.callback import router as steam_login_callback_router

from otix.api.auth.oauth import integrations_router

auth_router = APIRouter(prefix="/auth", tags=["auth"])

auth_router.include_router(register_router)
auth_router.include_router(login_router)
auth_router.include_router(refresh_router)
auth_router.include_router(logout_router)
auth_router.include_router(forgot_password_router)
auth_router.include_router(reset_password_router)
auth_router.include_router(verify_email_router)
auth_router.include_router(sessions_router)
auth_router.include_router(two_factor_router)
auth_router.include_router(me_router)
auth_router.include_router(steam_login_init_router)
auth_router.include_router(steam_login_callback_router)
auth_router.include_router(integrations_router)

