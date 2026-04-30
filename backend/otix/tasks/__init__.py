"""Celery task definitions ONLY.

RULES:
- Thin wrappers that call services. No business logic here.
- Must NOT import from otix.api.
"""
