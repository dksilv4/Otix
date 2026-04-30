"""HTTP route handlers ONLY.

RULES:
- No business logic — delegate to services.
- No direct database queries — go through a service.
- This package must NOT import from otix.tasks.
"""
