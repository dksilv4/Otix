## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

- Always use the existing modal framework that is already established in the codebase to create new modals and user interfaces. Do not create new modal styles or frameworks.

## Colours / theming

Never hardcode colours in UI (no raw hex, `rgb()`/`oklch()` literals, Tailwind palette classes like `bg-emerald-500` / `text-white`, or one-off inline colour styles) unless the user explicitly asks for an exception.

Use existing theme tokens and CSS variables instead (`bg-primary`, `text-primary-foreground`, `text-muted-foreground`, `var(--primary)`, `var(--dk-surface-*)`, semantic media tokens, etc.). Prefer semantic pairs (`bg-primary` + `text-primary-foreground`) over guessing a foreground.

If a needed colour role does not exist yet, ask the user for confirmation before introducing a new theme variable or token. Do not invent new colour tokens unilaterally.

## API casing

Django and Otix Server speak **snake_case**. The web `apiClient` (`frontend/src/lib/api/client.ts`) converts automatically via axios interceptors:

- **Requests:** camelCase JSON bodies and query params → snake_case (except `FormData`)
- **Responses (and error bodies):** snake_case JSON → camelCase

Frontend code must read and write camelCase (`displayName`, `authUrl`, `totalInEpic`). Do not dual-read snake_case on `apiClient` results. This conversion does **not** apply to Django↔node proxy payloads, SSE/`fetch` unless those helpers also convert, or Python.

## Frontend component files

Frontend component files (`.tsx` under components/pages/etc.) must only contain component functions and may only export components.

Do not define or export utility helpers, formatters, parsers, constants bags, or other non-component logic in a component file. Put those in:

- the feature’s utils file or folder (`frontend/src/features/<feature>/utils.ts` or `frontend/src/features/<feature>/utils/`), or
- the shared utils folder (`frontend/src/lib/utils/`) when the helper is cross-feature.

