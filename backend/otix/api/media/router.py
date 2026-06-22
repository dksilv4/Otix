# TODO: Review this file
from fastapi import APIRouter

from otix.api.media.admin import media_router as admin_router
from otix.api.media.browse import media_router as browse_router
from otix.api.media.detail import media_router as detail_router
from otix.api.media.match_proposal import router as match_proposal_router
from otix.api.media.search import media_router as search_router

media_router = APIRouter(prefix="/media", tags=["media"])
media_router.include_router(search_router)
media_router.include_router(match_proposal_router)
media_router.include_router(detail_router)
media_router.include_router(admin_router)
media_router.include_router(browse_router)
