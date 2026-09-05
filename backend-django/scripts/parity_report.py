#!/usr/bin/env python
"""Parity report against the frozen FastAPI route contract.

Usage (from backend-django/):

    DJANGO_SETTINGS_MODULE=config.settings.dev .venv/bin/python scripts/parity_report.py

Loads ``contracts/frozen-routes.json`` (263 method+path routes captured from the
live FastAPI app) and walks the Django URLconf to say which legacy paths DRF
already serves and which still need porting, grouped by area (first path
segment). Rerun after porting each area in wave #4 and watch "remaining" shrink.

Method-level fidelity is not yet checked (Django urlpatterns don't declare HTTP
methods); the report tracks path-template coverage only and flags Django paths
that have no frozen counterpart.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
import django  # noqa: E402

django.setup()

from django.urls import URLPattern, URLResolver, get_resolver  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent.parent
CONTRACT_PATH = BASE_DIR / "contracts" / "frozen-routes.json"

_CONVERTOR_RE = re.compile(r"<[^:>]+(?::[^>]+)?>")  # Django <int:pk> / <str:name>
_PARAM_RE = re.compile(r"\{[^}]+\}")  # FastAPI {media_id}


def normalize(template: str) -> str:
    """Normalize a Django or FastAPI path template for comparison.

    Both ``{media_id}`` and ``<int:media_id>`` become ``{}`` (param count
    significant, names ignored); a trailing slash is trimmed.
    """
    t = _CONVERTOR_RE.sub("{}", template)
    t = _PARAM_RE.sub("{}", t)
    return t.rstrip("/") or "/"


def collect_django_patterns(resolver: Any, base: str) -> list[str]:
    """Return every leaf path template reachable from ``resolver``."""
    found: list[str] = []
    for entry in resolver.url_patterns:
        if isinstance(entry, URLResolver):
            sub = entry.pattern
            route = getattr(sub, "_route", None)
            if route is None:
                route = ""
            found.extend(collect_django_patterns(entry, base + route))
        elif isinstance(entry, URLPattern):
            route = getattr(entry.pattern, "_route", None)
            if route is None:
                continue
            found.append("/" + (base + route).lstrip("/"))
    return found


def main() -> None:
    if not CONTRACT_PATH.exists():
        raise SystemExit(f"Missing contract: {CONTRACT_PATH}")
    contract = json.loads(CONTRACT_PATH.read_text())
    frozen = [(r["method"], r["path"]) for r in contract["routes"]]
    frozen_templates = {normalize(p) for _, p in frozen}

    django_templates = set(normalize(p) for p in collect_django_patterns(get_resolver(), ""))

    ported = [(m, p) for m, p in frozen if normalize(p) in django_templates]
    remaining = [(m, p) for m, p in frozen if normalize(p) not in django_templates]

    print(
        f"contract: {len(frozen)} routes (frozen {contract.get('frozen_at', '?')}); "
        f"DRF ported: {len(ported)}; remaining: {len(remaining)}"
    )

    by_area: dict[str, list[tuple[str, str]]] = {}
    for method, path in remaining:
        area = path.split("/")[3] if len(path.split("/")) > 3 else "(root)"
        by_area.setdefault(area, []).append((method, path))

    for area in sorted(by_area):
        rows = sorted(by_area[area])
        methods = ", ".join(sorted({m for m, _ in rows}))
        print(f"  {area:<14} {len(rows):>3} missing [{methods}]:")
        for method, path in rows:
            print(f"      {method:<6} {path}")

    extras = django_templates - frozen_templates
    if extras:
        print(f"\nDjango paths with no frozen counterpart ({len(extras)}):")
        for p in sorted(extras):
            print(f"      {p}")


if __name__ == "__main__":
    main()
