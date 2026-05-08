from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.auth import (
    LoginRequest,
    RefreshResponse,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    UserUpdateRequest,
)
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.services.auth_service import AuthService, get_refresh_cookie_config

auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    service = AuthService(db)
    try:
        user = await service.register(
            email=body.email,
            username=body.username,
            password=body.password,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    access_token, refresh_token, _ = await service.login(body.email, body.password)
    assert access_token and refresh_token  # just registered, must succeed

    response.set_cookie(value=refresh_token, **get_refresh_cookie_config())
    return TokenResponse(access_token=access_token)


@auth_router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    service = AuthService(db)
    result = await service.login(body.identity, body.password)
    if result is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    access_token, refresh_token, _ = result
    response.set_cookie(value=refresh_token, **get_refresh_cookie_config())
    return TokenResponse(access_token=access_token)


@auth_router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> RefreshResponse:
    refresh_token = request.cookies.get(settings.auth_refresh_cookie_name)
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    service = AuthService(db)
    result = await service.refresh(refresh_token)
    if result is None:
        cookie_config = get_refresh_cookie_config()
        response.delete_cookie(key=cookie_config["key"], path=cookie_config["path"], domain=cookie_config["domain"])
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    access_token, new_refresh_token, _ = result
    response.set_cookie(value=new_refresh_token, **get_refresh_cookie_config())
    return RefreshResponse(access_token=access_token)


@auth_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = AuthService(db)
    await service.logout(current_user.id)

    cookie_config = get_refresh_cookie_config()
    response.delete_cookie(key=cookie_config["key"], path=cookie_config["path"], domain=cookie_config["domain"])


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        is_verified=user.is_verified,
        avatar_url=user.avatar_url,
        bio=user.bio,
        background_url=user.background_url,
    )


@auth_router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return _user_response(current_user)


@auth_router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    if body.username is not None:
        current_user.username = body.username
    if body.email is not None:
        current_user.email = body.email
    if body.bio is not None:
        current_user.bio = body.bio
    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url
    if body.background_url is not None:
        current_user.background_url = body.background_url
    await db.commit()
    await db.refresh(current_user)
    return _user_response(current_user)
