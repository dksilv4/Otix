from __future__ import annotations

from fastapi import APIRouter

from otix.api.company.detail import router as detail_router

company_router = APIRouter(prefix="/company", tags=["company"])

company_router.include_router(detail_router)
