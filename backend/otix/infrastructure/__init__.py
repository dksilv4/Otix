"""Cross-cutting infrastructure: config, DB, Redis, logging.

RULES:
- Pure wiring. No domain knowledge.
- Must NOT import from any other otix module.
"""
