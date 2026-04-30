from __future__ import annotations

import secrets
from datetime import datetime
from typing import Annotated

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from otix.infrastructure.database import Base


def gen_otix_id() -> str:
    """Generate a unique otix_id in the format oti_XXXXXXXXXXXX."""
    return f"oti_{secrets.token_hex(6)}"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=func.now(), onupdate=func.now()
    )


# Primary key type — otix_id string with auto-generation.
otix_pk = Annotated[str, mapped_column(String(16), primary_key=True, default=gen_otix_id)]

# Foreign key type — references an otix_id in another table.
otix_fk = Annotated[str, mapped_column(String(16))]
