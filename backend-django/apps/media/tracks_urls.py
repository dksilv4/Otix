"""Music-track rating routes (media domain, distinct ``/tracks`` prefix).

Mounted at ``/api/v1/tracks/`` by ``config/urls.py``. No trailing slashes
(FastAPI parity; ``APPEND_SLASH`` off). ``track_id`` is an integer converter
matching the greenfield ``media.Track`` PK. Mirrors the media rating family but
targets a ``Track`` rather than a hub ``MediaItem``.

Populated by the wave-#4 tail owner.
"""

urlpatterns = []
