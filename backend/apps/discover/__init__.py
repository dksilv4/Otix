"""Discover domain: curated read-only media feeds (hero, list_type, ...).

Sibling to the catalog browse routes in ``apps.media`` but mounted under
``/api/v1/discover/`` with list_type semantics that need their own validation
and date-window logic. No models; the domain reads ``apps.media`` rows only.
"""
