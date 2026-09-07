"""Single-use OAuth flow state.

The legacy store kept provider state (PKCE verifier, linked ``user_id``, flow
marker) in Redis with a TTL and consumed it on the unauthenticated callback
step. Here that state lives in the DB instead: it is ephemeral, single-use,
scoped to one API process (the browser/Electron begins the flow on this API and
lands the callback back on it), so a table is simpler than Redis and needs no
extra broker to be running. Expiry is enforced at read time by ``created_at``
rather than a cron sweep (rows are deleted on consume; stale rows are inert).
"""

from django.db import models

from core.models import BaseModel

OAUTH_STATE_TTL_SECONDS = 600  # parity with legacy TTL["AUTH"][..._STATE] = 600


class OAuthState(BaseModel):
    """One in-flight OAuth initiate; ``key`` is the ``state`` query value."""

    key = models.CharField(max_length=64, unique=True, db_index=True)
    # JSON payload: {"v": "1", "flow": "youtube"|"drive"|…, "verifier": str,
    #                "user_id": int|null}
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, editable=False)

    class Meta(BaseModel.Meta):
        db_table = "oauth_state"

    def __str__(self) -> str:
        return f"OAuthState({self.key})"
