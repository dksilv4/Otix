# Project: Otix Full-Stack Performance Audit, Scientific Benchmarking & Architectural Consolidation

## Architecture
- **Frontend (`frontend/`):** React 18/19, Vite 5, TypeScript, Tailwind CSS, TanStack Query, Radix UI primitives. Automated `apiClient` interceptors with snake_case ↔ camelCase bidirectional translation.
- **Backend (`backend/`):** Django 5.2, Django REST Framework 3.16, SQLite (`:memory:` for testing) / PostgreSQL + pgvector, Celery, Redis. REST API output contract strictly in snake_case.
- **Desktop (`desktop/`):** Electron 35/42, TypeScript, Node.js IPC bridge with `contextBridge.exposeInMainWorld`, Electron-Builder packaging.
- **Node Companion Daemon (`node/`):** Go 1.24+, local HTTP server on loopback, pure-Go SQLite persistence, system tray, game process tracker, and file organizer.
- **Unified Build & Packaging Topology:** Centralized distribution under repository root `dist/`:
  - `dist/desktop/` (Electron installer, portable executable, desktop bundle)
  - `dist/frontend/` (Production Vite web bundle)
  - `dist/node/` (Compiled Go companion daemon binaries and archives)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Multi-Tier Baseline Diagnostic Report | Comprehensive report documenting baseline execution times, memory, query counts, IPC frequency across all 4 tiers | M1 | ORIGINAL_REQUEST §R1 |
| F2 | Automated Scientific Benchmark Harnesses | Automated micro-benchmark scripts measuring latency, queries, allocations for frontend utilities, backend endpoints, and daemons | M1 | ORIGINAL_REQUEST §R1, Acceptance Criteria |
| F3 | Go Daemon Windows Compilation Fix | Fix `main.go:94` `syscall.Handle` conversion and `challenger_m3_test.go` Unix build tag to ensure clean compilation on Windows | M2 | Survey 3, ORIGINAL_REQUEST §R4 |
| F4 | Go Daemon Organizer Windows Temp Fix | Fix path segment filtering in `internal/organize/organize.go` to avoid false-positive noise classification of `AppData\Local\Temp` | M2 | Survey 3, ORIGINAL_REQUEST §R4 |
| F5 | Go Daemon Lifecycle & Idle Optimization | Implement `Server.Stop()` cleanup hooks to stop background goroutines and eliminate 300ms idle Win32 polling overhead | M2 | Survey 3, ORIGINAL_REQUEST §R4 |
| F6 | Desktop Vitest & IPC Hardening | Resolve 3 failing desktop Vitest tests (`node-daemon-adversarial.test.ts` SIGTERM parameter and `updater.test.ts` fixture), optimize IPC bridge | M2 | Survey 1, ORIGINAL_REQUEST §R4 |
| F7 | Frontend Utility Benchmarking & Consolidation | Scientifically benchmark and deduplicate utilities: consolidate 9 `formatBytes`/`formatFileSize` functions and duplicate date/time formatters into `src/lib/utils/` | M3 | Survey 1, ORIGINAL_REQUEST §R2 |
| F8 | Frontend Custom Hook Optimization | Audit and optimize custom hooks (`use-media-stream-player`, `use-claimed-free-games`, etc.) to eliminate unnecessary re-renders and memory leaks | M3 | Survey 1, ORIGINAL_REQUEST §R2 |
| F9 | Frontend Architectural Rule Compliance | Convert non-arrow component (`SettingsSaveProvider`), extract hooks from provider files, move non-component helpers out of `.tsx` files | M3 | Survey 1, ORIGINAL_REQUEST §R2 |
| F10 | Frontend Theming & Design System Enforcement | Replace hardcoded colors with semantic CSS tokens, eliminate arbitrary dots/bubbles before text, align custom overlays with modal framework | M3 | Survey 1, ORIGINAL_REQUEST §R2 |
| F11 | Frontend ESLint Fixes | Resolve 31 ESLint errors (4 conditional hooks in path picker modals, render-time ref mutation in `use-game-servers-refresh.ts`, unused variables) | M3 | Survey 1, ORIGINAL_REQUEST §R2 |
| F12 | Backend Query Optimization: `/friends/activity` | Replace $1 + 3N$ friend activity loop with batched `__in` queries to reduce DB query count and latency | M4 | Survey 2, ORIGINAL_REQUEST §R3 |
| F13 | Backend Query Optimization: `/media` & Catalog | Add `movie__collection` and collection movie prefetching in `list_media` to resolve N+1 queries in `enrich_summaries` | M4 | Survey 2, ORIGINAL_REQUEST §R3 |
| F14 | Backend Serialization Optimization | Eliminate redundant queries in `MediaItemDetailSerializer.get_game` and avoid duplicate re-queries on rehydration | M4 | Survey 2, ORIGINAL_REQUEST §R3 |
| F15 | Backend Query Optimization: `/chat/conversations` | Batch unread count computation and constrain message prefetching to eliminate unbounded memory loads and N+1 queries | M4 | Survey 2, ORIGINAL_REQUEST §R3 |
| F16 | Backend Indexing & Ranking Optimization | Add index on `accounts.User.total_xp` and streamline ranking calculation queries | M4 | Survey 2, ORIGINAL_REQUEST §R3 |
| F17 | Backend Snake_Case Contract Guarantee | Ensure 100% API contract fidelity and pure snake_case response serialization for `apiClient` compatibility | M4 | Survey 2, ORIGINAL_REQUEST §R3 |
| F18 | Centralized Root Build Configuration | Reconfigure root `package.json`, `desktop/electron-builder.json5`, and packaging scripts to target `dist/desktop`, `dist/frontend`, `dist/node` | M5 | Survey 3, ORIGINAL_REQUEST §R5 |
| F19 | Build Pipeline Documentation & Clean Root | Document centralized build pipeline topology; verify zero scripts in root directory and clean `.gitignore` | M5 | Survey 3, ORIGINAL_REQUEST §R5 |
| F20 | Full-Stack Regression Verification & Gate | Run complete test suites (Frontend Vitest, Desktop Vitest, Django tests, Go daemon tests), typechecks (`tsc --noEmit`), and adversarial benchmarks | M6 | ORIGINAL_REQUEST §Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Baseline Diagnostic & Benchmark Suite | Full-stack baseline profiling across 4 tiers; automated benchmark scripts; diagnostic report | None | DONE |
| M2 | Desktop & Go Companion Daemon Efficiency | Windows build & test fixes in `node/`; daemon lifecycle & idle optimization; desktop test fixes & IPC streamlining | M1 | DONE |
| M3 | Frontend Consolidation & Rule Compliance | Utility deduplication with micro-benchmarks; hook optimization; ESLint fixes; component purity & semantic theme tokens | M1 | DONE |
| M4 | Backend REST Optimization & Query Hardening | Fix N+1 queries in activity, media, chat, and xp; optimize serializers; preserve snake_case contract | M1 | IN_PROGRESS |
| M5 | Centralized Root Build & Distribution (`dist/`) | Consolidate outputs into `dist/desktop/`, `dist/frontend/`, `dist/node/`; update packaging scripts; document topology | M2, M3, M4 | DONE |
| M6 | Regression Verification, Adversarial Hardening & Audit | 100% test pass across all 4 tiers; typechecks; linter checks; adversarial benchmark confirmation; audit verification | M5 | PLANNED |

## Interface Contracts
### Frontend ↔ Backend (REST API via `apiClient`)
- Backend MUST emit pure `snake_case` JSON.
- Frontend `apiClient` (`frontend/src/lib/api/client.ts`) converts request params/body from `camelCase` to `snake_case` and response keys from `snake_case` to `camelCase`.
- Endpoint URLs must not rely on `APPEND_SLASH` (`APPEND_SLASH = False` in Django settings).
- Pagination envelope: `{ count: number, next: string | null, previous: string | null, results: T[] }`.

### Desktop ↔ Node Companion Daemon (HTTP & IPC)
- Electron discovers daemon via binary paths in priority order: production bundled path, local repo root `dist/node/`, and development fallback.
- Health check: `GET http://127.0.0.1:<port>/api/health` with `X-Otix-Node-Key` token header.
- Daemon graceful shutdown: SIGTERM or POST `/api/shutdown`.

### Build & Packaging Distribution
- All final distribution outputs MUST reside under root `dist/`:
  - `dist/desktop/`: Windows installer executable (`Otix-Setup-*.exe`), portable executable (`Otix-*.exe`), unpackaged app.
  - `dist/frontend/`: Static Vite production distribution assets (`index.html`, `assets/*`).
  - `dist/node/`: Compiled Go companion daemon binaries (`otix-node-windows-*.exe`, archives).
- No scripts in repository root directory.

## Code Layout
- `frontend/src/lib/utils/`: Shared cross-feature utilities.
- `frontend/src/features/<feature>/utils/`: Feature-specific utilities.
- `frontend/src/features/<feature>/hooks/`: Feature-specific custom hooks.
- `backend/apps/<app>/services/`: Domain business logic and query orchestration.
- `backend/apps/<app>/serializers/`: DRF serializers (snake_case output).
- `desktop/src/main/`: Electron main process logic.
- `node/cmd/` & `node/internal/`: Go companion daemon packages.
- `scripts/`: Central automation and packaging scripts (Powershell and Bash).
- `dist/`: Central root distribution directory for all package outputs.
