# TODO: Review this file
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

# ── Image override ──────────────────────────────────────────────


class ImageOverrideItem(BaseModel):
    image_type: str = Field(..., description="poster, backdrop, logo, or textless_poster")
    language_code: str = Field(..., description="ISO 639-1 language code, or '*' for all")
    url: str = Field(..., max_length=2000)


class MediaImageOverrideOut(BaseModel):
    id: str
    media_item_id: str
    image_type: str
    language_code: str
    url: str
    is_active: bool
    created_by_user_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Edit proposal ───────────────────────────────────────────────

ALLOWED_CHANGE_FIELDS = {
    "title", "overview", "tagline", "status", "release_date",
    "original_language", "poster_url", "backdrop_url", "logo_url",
    "textless_poster_url", "runtime",
}


class MediaEditProposalCreate(BaseModel):
    changes: dict[str, str | None] = Field(
        default_factory=dict, description="Key-value pairs of MediaItem fields to change"
    )
    image_overrides: list[ImageOverrideItem] | None = Field(
        None, description="Language-specific image overrides to apply on approval"
    )

    @field_validator("changes")
    @classmethod
    def validate_changes(cls, v: dict) -> dict:
        for key, val in v.items():
            if key not in ALLOWED_CHANGE_FIELDS:
                raise ValueError(f"Field '{key}' is not allowed for editing")
            if val is not None and not isinstance(val, str):
                raise ValueError(f"Field '{key}' must be a string or null")
        return v


class ProposerUserOut(BaseModel):
    id: str
    username: str
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


class MediaEditProposalOut(BaseModel):
    id: str
    media_item_id: str
    proposer_user_id: str | None = None
    approver_user_id: str | None = None
    status: str
    changes: dict
    image_overrides: list[ImageOverrideItem] | None = None
    rejection_reason: str | None = None
    proposer: ProposerUserOut | None = None
    approver: ProposerUserOut | None = None
    upvote_count: int = 0
    downvote_count: int = 0
    my_vote: str | None = Field(None, description="Current user's vote on this proposal")
    created_at: datetime
    updated_at: datetime

    # Populated by API layer from the MediaItem relationship
    media_title: str | None = None
    media_type: str | None = None
    media_poster_url: str | None = None

    model_config = {"from_attributes": True}


class MediaEditProposalList(BaseModel):
    items: list[MediaEditProposalOut]
    total: int


class ApproveRejectRequest(BaseModel):
    rejection_reason: str | None = Field(None, description="Required when rejecting a proposal")


class ProposalVoteCreate(BaseModel):
    vote_type: str

    @field_validator("vote_type")
    @classmethod
    def validate_vote_type(cls, v: str) -> str:
        if v not in ("up", "down"):
            raise ValueError("vote_type must be 'up' or 'down'")
        return v


class VoteResponse(BaseModel):
    my_vote: str | None = None
    upvote_count: int = 0
    downvote_count: int = 0


# ── Media assets for selection ───────────────────────────────────


class MediaAssetOut(BaseModel):
    id: str
    asset_type: str
    url: str
    width: int | None = None
    height: int | None = None
    lang: str | None = None
    style: str | None = None
    score: int | None = None
    provider: str | None = None

    model_config = {"from_attributes": True}


class MediaAssetList(BaseModel):
    items: list[MediaAssetOut]
    total: int
