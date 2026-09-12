"""ASGI config for the Otix backend.

SSE streaming (``core.sse``) serves async-generator ``text/event-stream``
responses natively over ASGI, so long-lived/idle streams don't occupy a worker
thread. Run with an ASGI server (uvicorn/daphne) for realtime to behave; this is
the entry point it uses. WebSocket support is not part of the surface.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

application = get_asgi_application()
