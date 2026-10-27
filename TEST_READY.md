# E2E Test Suite Ready

## Test Runner
- Frontend TypeScript check: `cd frontend && npx tsc --noEmit`
- Frontend Vitest suite: `cd frontend && npm test`
- Desktop Vitest suite: `cd desktop && npm test`
- Backend Discover suite: `cd backend && uv run python manage.py test apps.discover`
- Backend Integrations suite: `cd backend && uv run python manage.py test apps.integrations.tests.test_read_surface apps.integrations.tests.test_plex_fixes`

## Coverage Summary
| Tier | Count | Description |
|------|------:|-------------|
| 1. Feature Coverage | 85 | >=5 per feature across 17 features |
| 2. Boundary & Corner Cases | 85 | Error handling, non-HTTP origins, fallback cards, null data |
| 3. Cross-Feature Combinations | 17 | Carousel → AI Glance → Unified Player → Stream resolution |
| 4. Real-World Application | 5 | End-to-end user journeys (Discovery to Playback, Secure Node, Tab Order) |
| **Total** | **192** | Comprehensive multi-tier coverage |

## Feature Checklist
| Feature | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---------|:------:|:------:|:------:|:------:|
| F1. Discover 3D Carousel | 5 | 5 | ✓ | ✓ |
| F2. New Seasons Shelf | 5 | 5 | ✓ | ✓ |
| F3. Profile XP Shimmer | 5 | 5 | ✓ | ✓ |
| F4. Friends Soft Glass | 5 | 5 | ✓ | ✓ |
| F5. Pages Redesign & Decoupling | 5 | 5 | ✓ | ✓ |
| F6. Unified Player Component | 5 | 5 | ✓ | ✓ |
| F7. Dynamic Aspect & Docked Controls | 5 | 5 | ✓ | ✓ |
| F8. YouTube Origin & Electron Fix | 5 | 5 | ✓ | ✓ |
| F9. AI Quick-Glance Modal | 5 | 5 | ✓ | ✓ |
| F10. Stream Availability Latency | 5 | 5 | ✓ | ✓ |
| F11. Library Overview Overhaul | 5 | 5 | ✓ | ✓ |
| F12. In-Tab Loading Spinner | 5 | 5 | ✓ | ✓ |
| F13. Tab Position Reordering | 5 | 5 | ✓ | ✓ |
| F14. Context Menu Smooth Scrolling | 5 | 5 | ✓ | ✓ |
| F15. Desktop Daemon Immediate Push | 5 | 5 | ✓ | ✓ |
| F16. Desktop Update Tamper Verification | 5 | 5 | ✓ | ✓ |
| F17. TypeScript & Test Suites Verification | 5 | 5 | ✓ | ✓ |
