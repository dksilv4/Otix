from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db, get_optional_user
from otix.api.search import providers as psvc
from otix.api.search import search as svc
from otix.domain.user import User
from otix.schemas.media import (
    CompanySearchListResponse,
    MediaItemListResponse,
    MediaItemSummary,
    ProviderSearchRequest,
    ProviderSearchResponse,
    SteamGridSearchRequest,
    SteamGridSearchResponse,
    StructuredSearchResponse,
)

search_router = APIRouter(tags=["search"])


# ── Suggestions ──────────────────────────────────────────────────────


@search_router.get("/suggestions", response_model=list[MediaItemSummary])
async def suggestions(
    q: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=20),
    media_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> list[MediaItemSummary]:
    return await svc.search_suggestions(q=q, limit=limit, media_type=media_type, db=db, current_user=current_user)


# ── Search ────────────────────────────────────────────────────────────


@search_router.get("", response_model=MediaItemListResponse)
async def search(
    q: str = Query(..., min_length=1),
    media_type: str | None = Query(None),
    sort_by: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    return await svc.search_media(
        q=q, media_type=media_type, sort_by=sort_by,
        page=page, page_size=page_size, db=db, current_user=current_user,
    )


# ── Grouped search ────────────────────────────────────────────────────


@search_router.get("/grouped", response_model=StructuredSearchResponse)
async def grouped(
    q: str = Query(..., min_length=1),
    media_type_limit: int = Query(10, ge=1, le=25),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> StructuredSearchResponse:
    return await svc.search_grouped(
        q=q, media_type_limit=media_type_limit, db=db, current_user=current_user,
    )


# ── Companies ─────────────────────────────────────────────────────────


@search_router.get("/companies", response_model=CompanySearchListResponse)
async def companies(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> CompanySearchListResponse:
    return await svc.search_companies(q=q, limit=limit, db=db)


# ── Poll search updates ───────────────────────────────────────────────


@search_router.get("/poll", response_model=MediaItemListResponse)
async def poll(
    q: str = Query(..., min_length=1),
    media_type: str | None = Query(None),
    known_ids: str = Query(""),
    page_size: int = Query(24, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    return await svc.poll_search_updates(
        q=q, media_type=media_type, known_ids=known_ids,
        page_size=page_size, db=db, current_user=current_user,
    )


# ── Search external games ─────────────────────────────────────────────


@search_router.get("/external", response_model=MediaItemListResponse)
async def external(
    q: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
) -> MediaItemListResponse:
    return await svc.search_external_games(q=q, limit=limit, db=db)


# ── Multi-provider search ─────────────────────────────────────────────


@search_router.post("/providers", response_model=ProviderSearchResponse)
async def providers(
    body: ProviderSearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> ProviderSearchResponse:
    return await psvc.search_providers(body=body, db=db, current_user=current_user)


# ── SteamGridDB search ────────────────────────────────────────────────


@search_router.post("/steamgrid", response_model=SteamGridSearchResponse)
async def steamgrid(
    body: SteamGridSearchRequest,
    current_user: User | None = Depends(get_optional_user),
) -> SteamGridSearchResponse:
    return await psvc.search_steamgrid(body=body)
