"""Celery application instance.

Config-driven: broker/result-backend and any periodic ``beat_schedule`` come
from ``django.conf:settings`` under the ``CELERY_`` namespace, and tasks are
autodiscovered from installed apps' ``tasks`` modules (``run_sync_job`` lives in
``apps/integrations/tasks``). No runtime/eager behaviour is hardcoded here — the
test settings opt into eager mode so job lifecycles run inline in the suite.
"""

import os

from celery import Celery
from celery.signals import task_postrun, task_prerun
from django.db import connections

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

app = Celery("otix")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@task_prerun.connect
def on_task_prerun(*args, **kwargs):
    from django.conf import settings

    if not getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        for conn in connections.all(initialized_only=True):
            if not conn.in_atomic_block:
                conn.close_if_unusable_or_obsolete()


@task_postrun.connect
def on_task_postrun(*args, **kwargs):
    from django.conf import settings

    if not getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        for conn in connections.all(initialized_only=True):
            if not conn.in_atomic_block:
                conn.close_if_unusable_or_obsolete()

