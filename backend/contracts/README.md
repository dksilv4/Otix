# API parity contract

The frozen legacy API surface used to drive the DRF port (wave #4).

## `frozen-routes.json`

`263` routes (`GET 119 / POST 95 / DELETE 33 / PUT 11 / PATCH 5`) captured by
introspecting the **live FastAPI app's router graph** — the FastAPI/Pydantic
`app.openapi()` schema generator is currently broken (an unresolved pydantic
`ForwardRef('User | None')` on a `current_user` dependency raises
`PydanticUserError: class-not-fully-defined`), so the route *surface* is frozen
instead of the full OpenAPI schema. Response-shape parity must be read from the
legacy code per area (`backend/otix/api/<area>/**` + `backend/otix/schemas/**`)
until schema generation is fixed.

Each entry: `{ "method": "GET", "path": "/api/v1/media/{media_type}/{media_id}" }`
(path params are `{name}` templates).

## Regenerating

The introspection must run where the FastAPI backend + its deps live (a running
backend container):

```bash
docker exec otix-worker-1 python -c "
import json
from fastapi.routing import APIRoute
INC = '_IncludedRouter'
def walk(routes, prefix, out):
    for r in routes:
        if type(r).__name__ == INC:
            walk(getattr(r.original_router, 'routes', []) or [], prefix + (getattr(r.include_context, 'prefix', '') or ''), out)
        elif isinstance(r, APIRoute):
            for m in r.methods:
                if m in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE'):
                    out.append({'method': m, 'path': prefix + r.path})
from otix.api.router import api_router
out = []
walk(api_router.routes, '/api/v1', out)
uniq = sorted({(e['method'], e['path']): e for e in out}.values(), key=lambda e: (e['method'], e['path']))
print(json.dumps({'frozen_at': 'YYYY-MM-DD', 'source': 'live backend container', 'total': len(uniq), 'routes': uniq}))
" > contracts/frozen-routes.json
```

## Checking coverage

```bash
PYTHONPATH=. DJANGO_SETTINGS_MODULE=config.settings.dev .venv/bin/python scripts/parity_report.py
```

Prints how many of the 263 routes DRF already serves and the remaining list
grouped by area. Port an area, rerun, watch it shrink.
