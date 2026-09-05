"""Celery application instance.

Declarative only: tasks live in later app work. Workers/beat + the task layer
are wired in a dedicated task; do not add eager/queue runtime behaviour here.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

app = Celery("otix")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
