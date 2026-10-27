# E2E Test Infra: Otix Core Platform & UI/UX Elevation

## Test Philosophy
- Opaque-box, requirement-driven verification derived directly from ORIGINAL_REQUEST.md.
- Verification methodology: Category-Partition + Boundary Value Analysis + Pairwise Feature Combination + Real-World Workload Testing.
- Strict Acceptance Gates: All TypeScript compiles cleanly, all Vitest suites pass, and all Django test suites pass.

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 |
|---|---------|--------|:------:|:------:|:------:|
| F1 | Discover 3D Carousel Math & Perspective | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| F2 | Personalized "New Seasons" Shelf | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| F3 | Profile XP Shimmer Bar & Level Tiers | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| F4 | Friends Social Interface Soft Glassmorphism | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| F5 | Pages Redesign & Route Decoupling | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| F6 | Unified Borderless Glassmorphic Player | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| F7 | Auto-Aspect Ratio & Docked Controls Pod | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| F8 | YouTube Embed Origin & Electron Fix | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| F9 | Media Detail Page AI Quick-Glance Modal | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| F10 | Stream Availability & Latency Optimization | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| F11 | Library Overview Tab Overhaul | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| F12 | In-Tab Header Loading Spinner | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| F13 | Library Tab Position Customization & Persistence | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| F14 | Context Menu Smooth Scrolling & Actions | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| F15 | Desktop Daemon Immediate IPC Push | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| F16 | Desktop Update Tamper Verification | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| F17 | TypeScript & Automated Test Suites | ORIGINAL_REQUEST §Acceptance | 5 | 5 | ✓ |

## Test Architecture
- **Frontend Test Suite**:
  - Location: `/Users/dk/Documents/GitHub/Otix/frontend`
  - Runner: `npm test` (Vitest v4 with jsdom environment)
  - Typecheck: `npx tsc --noEmit`
- **Desktop Test Suite**:
  - Location: `/Users/dk/Documents/GitHub/Otix/desktop`
  - Runner: `npm test` (Vitest v4 with Node environment)
- **Backend Test Suite**:
  - Location: `/Users/dk/Documents/GitHub/Otix/backend`
  - Runner: `uv run python manage.py test apps.media` and `uv run python manage.py test apps.discover`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Seamless Discovery to Streaming Flow: User browses 3D fan carousel, sees personalized new season, opens AI Quick-Glance preview, and clicks 1-Click Stream to launch the unified player with docked controls | F1, F2, F6, F7, F9, F10 | High |
| 2 | Production Trailer Experience in Desktop Shell: User launches trailer in Electron desktop build under `app://otix` origin, verifies YouTube embed loads without Error 150/101, toggles theater mode to full viewport width | F6, F7, F8 | High |
| 3 | Library Organization & Fluid Navigation: User accesses library overview with live statistics and reels, navigates between tabs without page flash (in-tab spinner), opens Tab Settings to reorder tabs, verifies persistent order across reloads | F11, F12, F13 | Medium |
| 4 | Rich Context Menu in Fast-Scrolling Media Shelves: User right-clicks media cards during inertia scrolling without premature dismissals, triggers AI Quick Glance and external links | F14, F9 | Medium |
| 5 | Desktop Daemon & Secure Update Pipeline: Local node daemon pushes instant status transitions over IPC on boot, auto-updater validates package SHA-512 and digital signature prior to install execution | F15, F16 | High |

## Coverage Thresholds
- Tier 1: >=5 per feature (85 total across 17 features)
- Tier 2: >=5 per feature (boundary and error-case scenarios)
- Tier 3: Pairwise combinations across UI, Player, Library, and Desktop domains
- Tier 4: >=5 realistic full-stack application scenarios
- Acceptance Gate: 100% clean TypeScript compilation, 100% passing tests across all test suites
