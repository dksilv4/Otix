"""ASGI config for the Otix backend.

SSE/WebSocket support lands with the ASGI/streaming task; this is the standard
entry point gunicorn/uvicorn use today.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

application = get_asgi_application()
