# Production Readiness — Frontend & Desktop

**Date:** 2026-06-27
**Scope:** Fix broken tests + add critical-path coverage for frontend and desktop.
**Out of scope:** Backend tests, E2E tests, CI pipeline changes, main.ts full refactor.

## Phase 1: Fix Test Infrastructure

### 1.1 Desktop: electron mock
- **Problem:** `electron` module is not mocked in vitest. Tests that touch `db/connection.ts` call `app.getPath('userData')` which is undefined.
- **Fix:** Add `desktop/__mocks__/electron.ts` with stubs for `app.getPath`, `app.getAppPath`, `app.isPackaged`, `app.on`, `app.whenReady`. Register via vitest config's `resolve.alias`.
- **Affected tests:** `detector.test.ts` (~20 failures), `orchestrator.test.ts` (1 failure).

### 1.2 Desktop: better-sqlite3 native rebuild
- **Problem:** Native module compiled against wrong Node.js version (NODE_MODULE_VERSION mismatch).
- **Fix:** Run `npm rebuild better-sqlite3` in desktop directory. Add `pretest` script hook if missing.

### 1.3 Desktop: vitest config update
- Add `mock` directory to resolve aliases.
- Add `setupFiles` for global test setup.

## Phase 2: Fix Broken Tests

### 2.1 Desktop tests (22 failures → 0)

| Test file | Failures | Root cause | Fix |
|---|---|---|---|
| `tests/detector.test.ts` | ~20 | No electron mock, db calls fail | Phase 1.1 mock |
| `game/__tests__/orchestrator.test.ts` | 1 | `scanPlugin` returns undefined instead of error object | Check orchestrator code — likely a missing `return` or error not propagated |
| `tests/db/migration-service.test.ts` | 2 | `better-sqlite3` native module version mismatch | Phase 1.2 rebuild |

### 2.2 Frontend tests (4 failures → 0)

| Test file | Failure | Fix |
|---|---|---|
| `src/lib/api/client.test.ts` | Import `./api-client` doesn't exist | Check what file actually exists — rename import or rename file to match |
| `src/old-features/dk-ui/dk-ui.test.tsx` | Dialog backdrop selector `.bg-black\/40` wrong | Match the actual CSS class used by the current dialog component |
| `src/old-features/list/molecules/list-card.test.tsx` | Expects `truncate` class but gets `dk-list-card__title` | Match actual class name from the component |
| `src/old-features/list/organisms/list-composer.test.tsx` | Backdrop click doesn't fire onClose | Match actual backdrop selector or use userEvent on the actual element |
| `src/features/media/music/...test.tsx` | Selector `.absolute.inset-0` finds nothing | Match actual rating component structure |

## Phase 3: Critical Path Tests

### 3.1 Desktop: Launcher scan → match → library
- **File:** `desktop/game/__tests__/orchestrator.test.ts` (extend existing)
- **What:** Test `scanAllPlugins` orchestrates plugin scans, results flow to `onMatchingProgress`, and matched games land in the library.
- **Why:** This is the core user flow — scanning for games is the primary feature.

### 3.2 Frontend: Launcher data hooks
- **File:** `frontend/src/features/launcher/hooks/__tests__/use-launcher-data.test.ts` (new)
- **What:** Test `useGameShelves`, `useGameActions`, `useGameUIState` with mocked API responses.
- **Why:** These hooks power the launcher page — the main screen users see.

### 3.3 Frontend: Auth session lifecycle
- **File:** `frontend/src/features/auth/__tests__/auth-session.test.tsx` (new)
- **What:** Test login, token refresh, logout flows via the auth context/hooks.
- **Why:** Auth is the trust boundary — broken auth = unusable app.

### 3.4 Desktop: Plugin discovery → enable → scan
- **File:** `desktop/tests/plugins/lifecycle.test.ts` (new)
- **What:** Test `PluginManager.discoverPlugins()`, enable a plugin, verify it can scan.
- **Why:** Plugin system is the extension point — broken plugins block integrations.

## Phase 4: Verification

- Run `desktop: npm test` — all 6+ files pass, ~31+ tests pass, 0 failures.
- Run `frontend: npm test` — all 23+ files pass, ~135+ tests pass, 0 failures.
- Manual: `npm run test` in both dirs, confirm exit code 0.

## Risks

- The orchestrator test fix may reveal deeper issues in `GameScanOrchestrator` — if scan logic is broken, fix it rather than skip the test.
- Adding electron mock may uncover other tests that need it — add stubs as needed.
- The import issue in `client.test.ts` may indicate the source file was deleted/moved — restore or update.
