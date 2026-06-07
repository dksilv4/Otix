from __future__ import annotations

from fastapi import APIRouter

from otix.api.admin.deleted_tmdb_ids.router import router as deleted_tmdb_ids_router
from otix.api.admin.edit_proposals.router import router as edit_proposals_router
from otix.api.admin.hydration.router import router as hydration_router
from otix.api.admin.metrics.router import router as metrics_router
from otix.api.admin.stats.router import router as stats_router

admin_router = APIRouter(prefix="/admin", tags=["admin"])

admin_router.include_router(stats_router)
admin_router.include_router(metrics_router)
admin_router.include_router(deleted_tmdb_ids_router)
admin_router.include_router(edit_proposals_router)
admin_router.include_router(hydration_router)
