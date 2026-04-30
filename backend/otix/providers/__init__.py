"""External API integrations.

RULES:
- Each provider is independent — no cross-provider imports.
- Follow BaseProvider → BaseTransformer → BaseHydrator pattern.
- Must NOT import from services, api, or tasks.
- May import from otix.domain and otix.lib.
"""
