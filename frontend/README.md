# Otix Frontend

Media command center — track movies, shows, games, and music, log workouts, and discover your next obsession.

Built with **React 19**, **Vite 8**, **TanStack Router**, and **TanStack Query**.

---

## Tech Stack

| Layer       | Choice                                                                |
|-------------|-----------------------------------------------------------------------|
| Framework | React 19, TypeScript 6 |
| Bundler | Vite 8 |
| Routing | TanStack Router v1 (file-based) |
| Data Fetching | TanStack Query v5, Axios |
| Styling | Tailwind CSS v4, Sass, shadcn/ui, class-variance-authority |
| Animations | Framer Motion v12 |
| 3D | Three.js (shader background) |
| Validation | Zod v4 |
| Icons | lucide-react, @heroicons/react |
| HTTP | Axios with camelCase/snake_case interceptor + auto token refresh |
| Desktop | Electron (optional, via IPC bridge) |
| Testing | Vitest + Testing Library, Playwright |
| Linting | ESLint 10 + Prettier + husky/lint-staged |

---

## Project Structure

Feature-based architecture with atomic design.

```
src/
├── features/              # Feature modules
│   ├── _config/           # Feature flags, slot system, shared layouts
│   ├── activity/          # Activity feed / sidebar
│   ├── auth/              # Login, register, 2FA, OAuth, password reset
│   ├── discover/          # Home / discovery feed
│   ├── launcher/          # Game launcher UI
│   ├── library/           # Media library
│   ├── list/              # User lists
│   ├── media/             # Movie, show, game, music detail pages
│   ├── navigation/        # Sidebar / nav components
│   ├── people/            # People / cast detail pages
│   ├── plugins/           # Plugin system
│   ├── search/            # Global search
│   ├── settings/          # User settings (profile, preferences, integrations)
│   └── user/              # User profile pages
├── lib/                   # Core infra
│   ├── api/               # Axios client, SSE streams
│   ├── config/            # Environment config (API base URL, flags)
│   ├── desktop/           # Electron IPC typed wrapper
│   ├── hooks/             # Shared hooks (useSseStream)
│   ├── modals/            # Modal / slide panel system
│   ├── providers/         # React context providers (auth, theme, etc.)
│   ├── query/             # TanStack Query client setup with persistence
│   ├── router/            # TanStack Router setup
│   └── utils/             # cn(), formatDuration, formatBytes, etc.
├── components/            # Global components (shader bg, 404, error boundary)
├── assets/                # Images, logos, provider badges
├── types/                 # Shared TypeScript types
├── old-features/          # Legacy feature modules (migration in progress)
├── main.tsx               # App entry point
└── index.css              # Tailwind + design tokens + glass styles
```

### Feature Module Convention

Each feature follows:

```
features/[feature-name]/
├── components/
│   ├── atoms/             # Small, reusable UI primitives
│   ├── molecules/         # Composed atoms (used across organisms)
│   └── organisms/         # Complex UI sections (used across pages)
├── pages/                 # Route-level page components
├── sections/              # Page sections
├── hooks/                 # Feature-specific hooks
├── queries/               # TanStack Query definitions
├── providers/             # Feature-specific context providers
├── types/                 # Shared TypeScript types
├── utils/                 # Utility functions
├── constants/             # Constants
├── router.tsx             # Route definitions (named router.tsx, not [feature].router.ts)
└── index.ts               # Barrel exports
```

**Coding standards:**

- **No `any` types** — `any` is banned. Use `unknown` + type narrowing, or define explicit interfaces. Exception: third-party library type workarounds (documented with `// eslint-disable-next-line @typescript-eslint/no-explicit-any` — at most 5 per file, must have a comment explaining why).
- **File names** — kebab-case: `auth-register-page.tsx`, `settings-profile-page.tsx`, `launcher-game-card.tsx`
- **Component exports** — PascalCase matches file: file `auth-register-page.tsx` exports `AuthRegisterPage`
- **Hooks** — camelCase: `useAuth`, `useLauncherGame`

---

## Getting Started

### Prerequisites

- Node.js 22+
- npm (or your preferred package manager)

### Install

```bash
npm install
```

### Environment Variables

No `.env` file is required for development. Defaults:

| Variable           | Dev Default                    | Prod Default               |
|--------------------|--------------------------------|----------------------------|
| `VITE_API_BASE_URL` | `http://localhost:8000/api` | `https://otix.app/api` |

Set via `VITE_API_BASE_URL=... npm run dev` when connecting to a non-local backend.

### Development

```bash
npm run dev
```

Starts Vite dev server at `http://localhost:5173`. Proxies `/api` and `/media` to `http://localhost:8000`.

### Build

```bash
npm run build
```

Runs `tsc -b` type-checking, then `vite build`. Output goes to `dist/`.

### Preview Production Build

```bash
npm run preview
```

---

## Scripts

| Script                   | Purpose                                                |
|--------------------------|--------------------------------------------------------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview production build locally |
| `npm run test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint source files |
| `npm run format` | Format with Prettier |
| `npm run generate:types` | Regenerate OpenAPI types from backend (`openapi-typescript`) |

---

## Testing

- **Vitest** with jsdom environment for unit/component tests
- **Testing Library** (`@testing-library/react`, `@testing-library/user-event`)
- **Playwright** available for E2E tests

Tests live co-located next to their modules.

```bash
npm run test           # CI mode
npm run test:coverage  # With coverage
```

---

## Docker

```bash
docker build -t otix-frontend .
docker run -p 80:80 otix-frontend
```

Multi-stage build: `node:22-alpine` builder → `nginx:1.27-alpine` runner. Serves from port 80 with SPA fallback routing and `/api` reverse proxy.

---

## Architecture Highlights

- **Feature Flags** — 60+ granular toggles via `src/features/_config/registry.ts` with dependency tracking
- **Slot System** — Plugin/slot architecture for extensible UI surfaces via `src/features/_config/slots/`
- **SSE Client** — Real-time task & event streams (`useSseStream` hook)
- **Auth** — Email/password + OAuth (Steam, Google, Spotify, Plex, TMDb) + 2FA + auto token refresh
- **Desktop Bridge** — Optional Electron IPC layer for game scanning, launching, FPS monitoring, save syncing
- **Design System** — shadcn/ui (New York style, zinc base), dark/light themes, glass-morphism, Three.js shader backgrounds with quality tiers

---

## Path Aliases

| Alias       | Target                     |
|-------------|----------------------------|
| `@/` | `src/` |
| `@auth` | `src/features/auth` |
| `@media` | `src/features/media` |
| `@discover` | `src/features/discover` |
| `@activity` | `src/features/activity` |
| `@navigation` | `src/features/navigation` |
| `@search` | `src/features/search` |
| `@launcher` | `src/features/launcher` |
| `@library` | `src/features/library` |
| `@people` | `src/features/people` |
| `@settings` | `src/features/settings` |
| `@user` | `src/features/user` |
| `@list` | `src/features/list` |
| `@company` | `src/old-features/company` |
| `@ui` | `src/old-features/dk-ui` |
| `@desktop` | `../desktop` |

---

## API Types

```bash
npm run generate:types
```

Regenerates `src/api-types.d.ts` from the backend's OpenAPI spec at `http://localhost:8000/openapi.json`. The backend must be running locally.
