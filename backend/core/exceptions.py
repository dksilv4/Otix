"""Reserved for project-wide exception contracts.

Intended future work (do not build prematurely):
- a custom DRF ``EXCEPTION_HANDLER`` producing a stable error envelope
  (``{"error": {"code": ..., "message": ..., "details": ...}}``);
- HTTP-agnostic domain errors raised inside ``services/`` layers.

``OtixError`` is the base those service-layer errors will derive from.
"""


class OtixError(Exception):
    """Base class for domain-level, HTTP-agnostic errors raised by services."""
