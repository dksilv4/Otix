## Multi-agent guideline synchronization

Whenever `CLAUDE.md` is updated or modified, all instruction and configuration files read by AI coding agents (`AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursorrules`, `.windsurfrules`) must also be updated and/or created to stay in complete parity. This ensures all agents operate under identical project preferences and rules.

## Modal framework

Always use the existing modal framework that is already established in the codebase to create new modals and user interfaces. Do not create new modal styles or frameworks.

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

- **Arrow functions only:** All frontend React components must be defined as arrow functions (`export const ComponentName = (...) => { ... };` or `const ComponentName = (...) => { ... };`). Never use function declarations (`function ComponentName(...)` or `export default function ComponentName(...)`). For generic components, use `const ComponentName = <T extends ...>(...) => { ... };` (or `<T,>` if single bare type parameter).
- **No helper functions in component files:** Frontend component files (`.tsx` under components/pages/features/etc.) must strictly contain React component definitions and their component-specific props/types, and may only export components.
- Do not define or export utility helpers, formatters, parsers, calculations, constants bags, or other non-component logic in a component file. Put those in:
  - the feature’s utils file or folder (`frontend/src/features/<feature>/utils.ts` or `frontend/src/features/<feature>/utils/`), or
  - the shared utils folder (`frontend/src/lib/utils/`) when the helper is cross-feature.
- Custom hooks must be placed in dedicated hook files (under a `hooks/` directory or hook module), not defined alongside components in component files.

## Script placement

Do not place scripts in the root/parent directory (no `.sh`, `.ps1`, `.py`, `.js`, `.mjs`, etc. at the repository root). All scripts must reside in dedicated script directories (such as `scripts/`, `backend/scripts/`, `desktop/scripts/`, etc.). Keep the parent/root directory clean of standalone execution scripts.
