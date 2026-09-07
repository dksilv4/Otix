#!/usr/bin/env python
"""Parity report: frozen FastAPI route contract vs the Django urlconf.

Usage (from backend/):

    DJANGO_SETTINGS_MODULE=config.settings.dev .venv/bin/python scripts/parity_report.py

Loads ``contracts/frozen-routes.json`` (263 method+path routes captured from
the live FastAPI app), walks the Django urlconf, and reports which frozen
routes DRF already serves — at METHOD+path granularity, by inspecting each DRF
view's lowercase handler methods. Output is grouped by area (first path
segment). Rerun after porting each area in wave #4 to watch "remaining" shrink.

Method fidelity: a Django ``path()`` does not declare HTTP methods, so a route
whose template exists but whose view lacks the frozen method is reported as a
method-gap, not silently counted as ported. DRF support is derived from the
view class's lowercase handler methods (get/post/put/patch/delete); plain
function views are assumed to answer any method. OPTIONS/HEAD are ignored
(contract methods are GET/POST/PUT/PATCH/DELETE). Django site-admin routes are
reported only as a suppressed count in the extras tail.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))  # make config/ importable regardless of CWD

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django  # noqa: E402

django.setup()

from django.urls import URLPattern, URLResolver, get_resolver  # noqa: E402

CONTRACT_PATH = BASE_DIR / "contracts" / "frozen-routes.json"

_CONVERTOR_RE = re.compile(r"<[^:>]+(?::[^>]+)?>")  # Django <int:pk> / <str:name>
_PARAM_RE = re.compile(r"\{[^}]+\}")  # FastAPI {media_id}
_HANDLER_METHODS = ("get", "post", "put", "patch", "delete")
_ALL_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


def normalize(template: str) -> str:
    """Normalize a Django/FastAPI path template for comparison.

    Both ``{media_id}`` and ``<int:media_id>`` become ``{}`` (param count
    significant, names ignored); a trailing slash is trimmed.
    """
    t = _CONVERTOR_RE.sub("{}", template)
    t = _PARAM_RE.sub("{}", t)
    return t.rstrip("/") or "/"


def view_methods(view: Any) -> set[str]:
    """Best-effort set of HTTP methods a Django/DRF view actually handles.

    DRF/class views expose handlers as lowercase methods on the view class
    (reachable via ``callback.cls``); a plain function view answers any method.
    """
    cls = getattr(view, "cls", None)
    target = cls if cls is not None else view
    handled = {
        m
        for m in _HANDLER_METHODS
        if getattr(target, m, None) is not None
        and not getattr(getattr(target, m), "_django_http_unhandled", False)
    }
    if not handled:
        return set(_ALL_METHODS)
    return {m.upper() for m in handled}


def collect_patterns(resolver: Any, base: str) -> list[tuple[str, Any]]:
    """Return ``(normalized_template, view_callable)`` for every URL leaf."""
    found: list[tuple[str, Any]] = []
    for entry in resolver.url_patterns:
        if isinstance(entry, URLResolver):
            sub = entry.pattern
            route = getattr(sub, "_route", None) or ""
            found.extend(collect_patterns(entry, base + route))
        elif isinstance(entry, URLPattern):
            route = getattr(entry.pattern, "_route", None)
            if route is None:
                continue
            full = "/" + (base + route).lstrip("/")
            found.append((normalize(full), entry.callback))
    return found


def main() -> None:
    if not CONTRACT_PATH.exists():
        raise SystemExit(f"Missing contract: {CONTRACT_PATH}")
    contract = json.loads(CONTRACT_PATH.read_text())
    frozen: list[tuple[str, str]] = [(r["method"], r["path"]) for r in contract["routes"]]

    django: dict[str, Any] = {}
    for template, view in collect_patterns(get_resolver(), ""):
        django.setdefault(template, view)

    ported: list[tuple[str, str]] = []
    method_gaps: list[tuple[str, str, set[str]]] = []
    remaining: list[tuple[str, str]] = []
    for method, path in frozen:
        template = normalize(path)
        view = django.get(template)
        if view is None:
            remaining.append((method, path))
        elif method in view_methods(view):
            ported.append((method, path))
        else:
            method_gaps.append((method, path, view_methods(view)))

    print(
        f"contract: {len(frozen)} routes (frozen {contract.get('frozen_at', '?')}); "
        f"DRF ported: {len(ported)}; method-gaps: {len(method_gaps)}; "
        f"remaining: {len(remaining)}"
    )

    if method_gaps:
        print("\nMETHOD GAPS (path served, but that method missing):")
        by_area: dict[str, list[tuple[str, str, list[str]]]] = {}
        for method, path, methods in method_gaps:
            area = path.split("/")[3] if len(path.split("/")) > 3 else "(root)"
            by_area.setdefault(area, []).append((method, path, sorted(methods)))
        for area in sorted(by_area):
            print(f"  {area}:")
            for method, path, methods in by_area[area]:
                print(f"    {method:<6} {path}    (serves {methods})")

    if remaining:
        print("\nREMAINING (path not served):")
        by_area = {}
        for method, path in remaining:
            area = path.split("/")[3] if len(path.split("/")) > 3 else "(root)"
            by_area.setdefault(area, []).append((method, path))
        for area in sorted(by_area):
            rows = sorted(by_area[area])
            methods = ", ".join(sorted({m for m, _ in rows}))
            print(f"  {area:<14} {len(rows):>3} missing [{methods}]:")
            for method, path in rows:
                print(f"    {method:<6} {path}")

    extras = set(django) - {normalize(p) for _, p in frozen}
    if extras:
        non_admin = sorted(e for e in extras if not e.startswith("/admin/"))
        print(
            f"\nDjango paths with no frozen counterpart: {len(extras)} "
            f"({len(extras) - len(non_admin)} Django site-admin suppressed)"
        )
        for p in non_admin:
            print(f"  {p}")


if __name__ == "__main__":
    main()
