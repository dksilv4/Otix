"""Settings package.

Entry points (``manage.py``, gunicorn/uvicorn, Celery) always select a concrete
module via ``DJANGO_SETTINGS_MODULE``. To keep bare imports of this package
sane for tooling that has not set the variable yet, default to local
development settings rather than hardcoding any one environment.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
