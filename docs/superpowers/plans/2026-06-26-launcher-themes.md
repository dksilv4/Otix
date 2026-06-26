# Launcher Themes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a theme system to the launcher allowing 4 built-in themes (Default Dark, Light, Retro, Minimal) that can swap components, CSS tokens, and layout. Users select themes in Appearance settings.

**Architecture:** `LauncherThemeProvider` context lazy-loads theme modules and exposes a `component(key)` accessor. Each themeable component calls `component('SlotKey') ?? DefaultComponent`. Theme modules export `LauncherTheme` objects with `meta`, `components`, `tokens`, and `layout`. Default theme maps all 19 slot keys to current components. Other themes override subset.

**Tech Stack:** React 19, TypeScript, TanStack Router, Tailwind v4, localStorage for persistence

## Global Constraints

- Scope: Launcher screens + nav shell
- 4 built-in themes: default, light, retro, minimal
- Storage key: `otix-launcher-theme` in localStorage
- Architecture must allow plugin-contributed themes later (dynamic `import()`)
- No breaking changes to existing component public APIs
- Follow existing file naming convention: `launcher-*` prefix, named exports

---

### Task 1: Create Theme Types

**Files:**
- Create: `frontend/src/features/launcher/themes/types.ts`

**Interfaces:**
- Produces: `LauncherThemeManifest`, `LauncherThemeComponents`, `LauncherThemeLayout`, `LauncherTheme`, `LauncherThemeModule`

- [ ] **Step 1: Create types file**

```typescript
// frontend/src/features/launcher/themes/types.ts

import type { ComponentType } from 'react'

// ── Manifest ──────────────────────────────────────────────

export interface LauncherThemeManifest {
  id: string
  name: string
  description: string
  author: string
  version: string
  preview: string
  tags?: string[]
}

// ── Component prop types (matching existing component signatures) ──

export interface ShelfCardProps {
  game?: import('@/features/launcher/types').LocalGame
  catalogGame?: import('@/features/launcher/types').CatalogGame
  onClick: (id: string) => void
  onAcceptSuggestion?: (game: import('@/features/launcher/types').LocalGame) => void
  onRejectSuggestion?: (game: import('@/features/launcher/types').LocalGame) => void
}

export interface MatchGameModalProps {
  game: import('@/features/launcher/types').LocalGame
  open: boolean
  onOpenChange: (open: boolean) => void
}

export interface GameThumbProps {
  icon: string | undefined
  alt: string
}

export interface PlayButtonProps {
  game: import('@/features/launcher/types').LocalGame
}

export interface ProgressBarProps {
  progress: number
}

export interface WithIdProps {
  id?: string
}

// ── Component slots ──────────────────────────────────────

export interface LauncherThemeComponents {
  // Organisms
  Hero?: ComponentType<object>
  Shelf?: ComponentType<WithIdProps>
  Footer?: ComponentType<WithIdProps>
  GameButtons?: ComponentType<object>

  // Molecules
  FloatingSelector?: ComponentType<object>
  ShelfCard?: ComponentType<ShelfCardProps>
  GameStats?: ComponentType<object>
  GameCompanies?: ComponentType<object>
  GameDetailInfo?: ComponentType<object>
  EmptyState?: ComponentType<object>
  LoadingState?: ComponentType<WithIdProps>
  MatchGameModal?: ComponentType<MatchGameModalProps>
  DiskSpaceWidget?: ComponentType<WithIdProps>
  ScanWidget?: ComponentType<WithIdProps>

  // Atoms
  GameThumb?: ComponentType<GameThumbProps>
  PlayButton?: ComponentType<PlayButtonProps>
  PlaytimeStats?: ComponentType<object>
  RatingStats?: ComponentType<object>
  ProgressBar?: ComponentType<ProgressBarProps>
}

// ── Layout ────────────────────────────────────────────────

export interface LauncherThemeLayout {
  navPosition?: 'top' | 'left'
  heroHeight?: 'full' | 'half' | 'compact'
  heroParallax?: boolean
  shelfDensity?: 'comfortable' | 'compact'
  showFloatingSelector?: boolean
  backgroundType?: 'solid' | 'gradient' | 'shader' | 'image'
}

// ── Theme ─────────────────────────────────────────────────

export interface LauncherTheme {
  meta: LauncherThemeManifest
  components?: Partial<LauncherThemeComponents>
  tokens?: Record<string, string>
  layout?: Partial<LauncherThemeLayout>
}

export interface LauncherThemeModule {
  default: LauncherTheme
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/launcher/themes/types.ts
git commit -m "feat: add launcher theme types"
```

---

### Task 2: Create Theme Registry

**Files:**
- Create: `frontend/src/features/launcher/themes/registry.ts`

**Interfaces:**
- Consumes: `LauncherThemeModule` from Task 1
- Produces: `THEME_REGISTRY`, `getThemeModule(themeId: string): Promise<LauncherThemeModule>`

- [ ] **Step 1: Create registry file**

```typescript
// frontend/src/features/launcher/themes/registry.ts

import type { LauncherThemeModule } from './types'

interface RegistryEntry {
  id: string
  loader: () => Promise<LauncherThemeModule>
}

const ENTRIES: RegistryEntry[] = [
  {
    id: 'default',
    loader: () => import('./default/index').then(m => m as unknown as LauncherThemeModule),
  },
  {
    id: 'light',
    loader: () => import('./light/index').then(m => m as unknown as LauncherThemeModule),
  },
  {
    id: 'retro',
    loader: () => import('./retro/index').then(m => m as unknown as LauncherThemeModule),
  },
  {
    id: 'minimal',
    loader: () => import('./minimal/index').then(m => m as unknown as LauncherThemeModule),
  },
]

const moduleCache = new Map<string, LauncherThemeModule>()

export async function getThemeModule(themeId: string): Promise<LauncherThemeModule> {
  // Check cache first
  const cached = moduleCache.get(themeId)
  if (cached) return cached

  const entry = ENTRIES.find(e => e.id === themeId)
  if (!entry) {
    // Unknown theme — fall back to default
    console.warn(`Unknown theme "${themeId}", falling back to default`)
    return getThemeModule('default')
  }

  const mod = await entry.loader()
  moduleCache.set(themeId, mod)
  return mod
}

export function getThemeIds(): string[] {
  return ENTRIES.map(e => e.id)
}

// Preload default theme eagerly so it's always available
getThemeModule('default')
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors (note: will error until theme modules exist — that's expected, tasks 3, 6, 7, 8 create them).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/launcher/themes/registry.ts
git commit -m "feat: add theme registry with lazy loading"
```

---

### Task 3: Create LauncherThemeProvider + Hook

**Files:**
- Create: `frontend/src/features/launcher/themes/launcher-theme-context.tsx`

**Interfaces:**
- Consumes: `LauncherTheme`, `LauncherThemeComponents`, `LauncherThemeModule` from Task 1; `getThemeModule` from Task 2
- Produces: `LauncherThemeProvider`, `useLauncherTheme()`

- [ ] **Step 1: Create context and hook file**

```typescript
// frontend/src/features/launcher/themes/launcher-theme-context.tsx

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
  type ComponentType,
} from 'react'
import type { LauncherTheme, LauncherThemeComponents } from './types'
import { getThemeModule } from './registry'

const STORAGE_KEY = 'otix-launcher-theme'
const DEFAULT_THEME_ID = 'default'

// ── Context shape ────────────────────────────────────────

interface LauncherThemeContextValue {
  theme: LauncherTheme | null
  themeId: string
  setThemeId: (id: string) => void
  component: <K extends keyof LauncherThemeComponents>(
    key: K,
  ) => ComponentType<any> | null
}

const LauncherThemeContext = createContext<LauncherThemeContextValue>({
  theme: null,
  themeId: DEFAULT_THEME_ID,
  setThemeId: () => {},
  component: () => null,
})

// ── Storage helpers ──────────────────────────────────────

function loadThemeId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored || DEFAULT_THEME_ID
  } catch {
    return DEFAULT_THEME_ID
  }
}

function saveThemeId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Storage unavailable — silent fail
  }
}

// ── CSS token injection ──────────────────────────────────

function applyTokens(tokens: Record<string, string> | undefined): () => void {
  if (!tokens) return () => {}

  const root = document.documentElement
  const applied: string[] = []

  for (const [key, value] of Object.entries(tokens)) {
    const prev = root.style.getPropertyValue(key)
    root.style.setProperty(key, value)
    applied.push(key)
    // Store previous value for cleanup
    ;(root.style as any)[`__prev_${key}`] = prev
  }

  // Return cleanup function
  return () => {
    for (const key of applied) {
      const prev = (root.style as any)[`__prev_${key}`]
      if (prev !== undefined) {
        root.style.setProperty(key, prev)
        delete (root.style as any)[`__prev_${key}`]
      } else {
        root.style.removeProperty(key)
      }
    }
  }
}

// ── Provider ─────────────────────────────────────────────

export function LauncherThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState(loadThemeId)
  const [theme, setTheme] = useState<LauncherTheme | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Load theme module when themeId changes
  useEffect(() => {
    let cancelled = false

    getThemeModule(themeId).then(mod => {
      if (cancelled) return
      setTheme(mod.default)
    })

    return () => {
      cancelled = true
    }
  }, [themeId])

  // Apply/cleanup CSS tokens when theme changes
  useEffect(() => {
    // Run previous cleanup
    cleanupRef.current?.()

    if (theme?.tokens) {
      cleanupRef.current = applyTokens(theme.tokens)
    } else {
      cleanupRef.current = null
    }

    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [theme])

  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id)
    saveThemeId(id)
  }, [])

  const component = useCallback(
    <K extends keyof LauncherThemeComponents>(
      key: K,
    ): ComponentType<any> | null => {
      if (!theme?.components) return null
      return (theme.components as Record<K, ComponentType<any>>)[key] ?? null
    },
    [theme],
  )

  return (
    <LauncherThemeContext.Provider value={{ theme, themeId, setThemeId, component }}>
      {children}
    </LauncherThemeContext.Provider>
  )
}

// ── Hook ─────────────────────────────────────────────────

export function useLauncherTheme(): LauncherThemeContextValue {
  return useContext(LauncherThemeContext)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors from this file (may have errors from missing theme modules).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/launcher/themes/launcher-theme-context.tsx
git commit -m "feat: add LauncherThemeProvider with lazy loading and token injection"
```

---

### Task 4: Create Default Theme Module

**Files:**
- Create: `frontend/src/features/launcher/themes/default/manifest.json`
- Create: `frontend/src/features/launcher/themes/default/index.tsx`

**Interfaces:**
- Consumes: `LauncherTheme`, `LauncherThemeModule` from Task 1
- Produces: Default theme module with all 19 components mapped

- [ ] **Step 1: Create manifest**

```json
{
  "id": "default",
  "name": "Otix Dark",
  "description": "The default dark launcher theme with glass-morphism cards and parallax hero.",
  "author": "Otix",
  "version": "1.0.0",
  "preview": "",
  "tags": ["dark", "glass", "default"]
}
```

- [ ] **Step 2: Create theme module**

```typescript
// frontend/src/features/launcher/themes/default/index.tsx

import type { LauncherThemeModule } from '../types'

// Organisms
import { LauncherGameHero } from '@/features/launcher/components/organisms/launcher-game-hero'
import { LauncherShelf } from '@/features/launcher/components/organisms/launcher-shelf'
import { LauncherFooter } from '@/features/launcher/components/organisms/launcher-footer'
import { LauncherGameButtons } from '@/features/launcher/components/organisms/launcher-game-buttons'

// Molecules
import { FloatingGameSelector } from '@/features/launcher/components/molecules/launcher-floating-game-selector'
import { ShelfCard } from '@/features/launcher/components/molecules/launcher-shelf-card'
import { LauncherGameStats } from '@/features/launcher/components/molecules/launcher-game-stats'
import { LauncherGameCompanies } from '@/features/launcher/components/molecules/launcher-game-companies'
import { LauncherGameDetailInfo } from '@/features/launcher/components/molecules/launcher-game-detail-info'
import { LauncherEmptyState } from '@/features/launcher/components/molecules/launcher-empty-state'
import { LauncherLoading } from '@/features/launcher/components/molecules/launcher-loading'
import { MatchGameModal } from '@/features/launcher/components/molecules/launcher-match-game-modal'
import { DiskSpaceWidget } from '@/features/launcher/components/molecules/launcher-disk-space-widget'
import { LauncherScanWidget } from '@/features/launcher/components/molecules/launcher-scan-widget'

// Atoms
import GameThumb from '@/features/launcher/components/atoms/launcher-game-thumb'
import { PlayGameButton } from '@/features/launcher/components/atoms/launcher-play-game-button'
import { LauncherPlaytimeStats } from '@/features/launcher/components/atoms/launcher-playtime-stats'
import { LauncherRatingStats } from '@/features/launcher/components/atoms/launcher-rating-stats'
import { LauncherProgressBar } from '@/features/launcher/components/atoms/launcher-progress-bar'

const theme: LauncherThemeModule = {
  default: {
    meta: {
      id: 'default',
      name: 'Otix Dark',
      description: 'The default dark launcher theme with glass-morphism cards and parallax hero.',
      author: 'Otix',
      version: '1.0.0',
      preview: '',
    },
    components: {
      Hero: LauncherGameHero,
      Shelf: LauncherShelf,
      Footer: LauncherFooter,
      GameButtons: LauncherGameButtons,
      FloatingSelector: FloatingGameSelector,
      ShelfCard: ShelfCard,
      GameStats: LauncherGameStats,
      GameCompanies: LauncherGameCompanies,
      GameDetailInfo: LauncherGameDetailInfo,
      EmptyState: LauncherEmptyState,
      LoadingState: LauncherLoading,
      MatchGameModal: MatchGameModal,
      DiskSpaceWidget: DiskSpaceWidget,
      ScanWidget: LauncherScanWidget,
      GameThumb: GameThumb,
      PlayButton: PlayGameButton,
      PlaytimeStats: LauncherPlaytimeStats,
      RatingStats: LauncherRatingStats,
      ProgressBar: LauncherProgressBar,
    },
    tokens: {},
    layout: {
      navPosition: 'left',
      heroHeight: 'full',
      heroParallax: true,
      shelfDensity: 'comfortable',
      showFloatingSelector: true,
      backgroundType: 'gradient',
    },
  },
}

export default theme
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: Errors — `LauncherProgressBar` does not exist yet. This is expected; Task 7 creates it.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/launcher/themes/default/
git commit -m "feat: add default theme module with all 19 component mappings"
```

---

### Task 5: Wrap LauncherThemeProvider in Launcher Tree

**Files:**
- Modify: `frontend/src/features/launcher/pages/launcher-home-page.tsx`

**Interfaces:**
- Consumes: `LauncherThemeProvider` from Task 3

- [ ] **Step 1: Add provider wrapper**

The `LauncherHomePage` is the layout route for `/launcher`. Wrap its content with `LauncherThemeProvider` so all child routes (`/launcher/` and `/launcher/$gameId`) have access.

```typescript
// frontend/src/features/launcher/pages/launcher-home-page.tsx

import { Helmet } from 'react-helmet-async'
import { Outlet } from '@tanstack/react-router'
import { QueryErrorBoundary } from '@/components/query-error-boundary'
import { FloatingGameSelector } from '@/features/launcher/components/molecules/launcher-floating-game-selector'
import { WebPreviewBanner } from '@/features/launcher/components/molecules/launcher-web-preview-banner'
import { FpsPermissionDialog } from '@/features/launcher/components/molecules/launcher-fps-permission-dialog'
import { useHydrateLocalGames } from '@/features/launcher/hooks/use-launcher-hydrate'
import { LauncherThemeProvider } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherHomePage() {
  useHydrateLocalGames()
  return (
    <LauncherThemeProvider>
      <QueryErrorBoundary label="launcher">
        <div id="launcher-root" className="w-full h-screen bg-[#0a0a0d] text-white relative shadow-[0_24px_50px_rgba(0,0,0,0.85)] font-sans select-none">
          <Helmet><title>Launcher · Otix</title></Helmet>
          <WebPreviewBanner />
          <FloatingGameSelector />
          <FpsPermissionDialog />
          <Outlet />
        </div>
      </QueryErrorBoundary>
    </LauncherThemeProvider>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: May fail if theme modules aren't yet created — expected at this stage.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/launcher/pages/launcher-home-page.tsx
git commit -m "feat: wrap launcher with LauncherThemeProvider"
```

---

### Task 6: Wire Organisms to useLauncherTheme (4 components)

**Files:**
- Modify: `frontend/src/features/launcher/components/organisms/launcher-game-hero.tsx`
- Modify: `frontend/src/features/launcher/components/organisms/launcher-shelf.tsx`
- Modify: `frontend/src/features/launcher/components/organisms/launcher-footer.tsx`
- Modify: `frontend/src/features/launcher/components/organisms/launcher-game-buttons.tsx`

**Interfaces:**
- Consumes: `useLauncherTheme` from Task 3

**Pattern:** Each component adds at the top:
```typescript
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'
```
Then wraps its return in themed/null-check.

- [ ] **Step 1: Wire LauncherGameHero**

```typescript
// In launcher-game-hero.tsx — add import:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

// Inside the component, before the return:
const { component } = useLauncherTheme()
const ThemedHero = component('Hero')
if (ThemedHero) return <ThemedHero />

// If ThemedHero is null (default theme), continue to existing return.
// So wrap existing return in: if (!ThemedHero) { ... }
```

The actual edit — find the `export function LauncherGameHero()` function body. Add at the very top of the function body:

```typescript
export function LauncherGameHero() {
  const { component } = useLauncherTheme()
  const ThemedHero = component('Hero')

  // ... existing code continues, but wrap the return:
  if (ThemedHero) {
    return <ThemedHero />
  }

  return (
    // ... existing JSX unchanged
  )
}
```

- [ ] **Step 2: Wire LauncherShelf**

```typescript
// Add import:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherShelf({ id }: LauncherShelfProps) {
  const { component } = useLauncherTheme()
  const ThemedShelf = component('Shelf')
  if (ThemedShelf) return <ThemedShelf id={id} />

  // ... existing code unchanged
}
```

- [ ] **Step 3: Wire LauncherFooter**

```typescript
// Add import:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherFooter({ id }: { id?: string }) {
  const { component } = useLauncherTheme()
  const ThemedFooter = component('Footer')
  if (ThemedFooter) return <ThemedFooter id={id} />

  // ... existing code unchanged
}
```

- [ ] **Step 4: Wire LauncherGameButtons**

```typescript
// Add import:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherGameButtons() {
  const { component } = useLauncherTheme()
  const ThemedButtons = component('GameButtons')
  if (ThemedButtons) return <ThemedButtons />

  // ... existing code unchanged
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors in these 4 files.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/launcher/components/organisms/
git commit -m "feat: wire launcher organisms to useLauncherTheme"
```

---

### Task 7: Wire Molecules to useLauncherTheme (10 components)

**Files:**
- Modify: `frontend/src/features/launcher/components/molecules/launcher-floating-game-selector.tsx`
- Modify: `frontend/src/features/launcher/components/molecules/launcher-shelf-card.tsx`
- Modify: `frontend/src/features/launcher/components/molecules/launcher-game-stats.tsx`
- Modify: `frontend/src/features/launcher/components/molecules/launcher-game-companies.tsx`
- Modify: `frontend/src/features/launcher/components/molecules/launcher-game-detail-info.tsx`
- Modify: `frontend/src/features/launcher/components/molecules/launcher-empty-state.tsx`
- Modify: `frontend/src/features/launcher/components/molecules/launcher-loading.tsx`
- Modify: `frontend/src/features/launcher/components/molecules/launcher-match-game-modal.tsx`
- Modify: `frontend/src/features/launcher/components/molecules/launcher-disk-space-widget.tsx`
- Modify: `frontend/src/features/launcher/components/molecules/launcher-scan-widget.tsx`

**Interfaces:**
- Consumes: `useLauncherTheme` from Task 3

- [ ] **Step 1: Wire FloatingGameSelector**

```typescript
// Add at top of launcher-floating-game-selector.tsx:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

// At top of FloatingGameSelector function body:
export function FloatingGameSelector() {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('FloatingSelector')
  if (ThemedComponent) return <ThemedComponent />

  // ... rest unchanged
}
```

- [ ] **Step 2: Wire ShelfCard**

```typescript
// Add import:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export const ShelfCard = memo(function ShelfCard({ game, catalogGame, onClick, onAcceptSuggestion, onRejectSuggestion }: ShelfCardProps) {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('ShelfCard')
  if (ThemedComponent) return <ThemedComponent game={game} catalogGame={catalogGame} onClick={onClick} onAcceptSuggestion={onAcceptSuggestion} onRejectSuggestion={onRejectSuggestion} />

  // ... rest unchanged
})
```

- [ ] **Step 3: Wire LauncherGameStats**

```typescript
// Add import:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherGameStats() {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('GameStats')
  if (ThemedComponent) return <ThemedComponent />

  // ... rest unchanged
}
```

- [ ] **Step 4: Wire LauncherGameCompanies**

```typescript
// Add import:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherGameCompanies() {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('GameCompanies')
  if (ThemedComponent) return <ThemedComponent />

  // ... rest unchanged
}
```

- [ ] **Step 5: Wire LauncherGameDetailInfo**

```typescript
// Add import:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherGameDetailInfo() {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('GameDetailInfo')
  if (ThemedComponent) return <ThemedComponent />

  // ... rest unchanged
}
```

- [ ] **Step 6: Wire LauncherEmptyState**

```typescript
// Add import:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherEmptyState() {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('EmptyState')
  if (ThemedComponent) return <ThemedComponent />

  // ... rest unchanged
}
```

- [ ] **Step 7: Wire LauncherLoading**

```typescript
// Add import:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherLoading({ id }: { id?: string }) {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('LoadingState')
  if (ThemedComponent) return <ThemedComponent id={id} />

  // ... rest unchanged
}
```

- [ ] **Step 8: Wire MatchGameModal**

```typescript
// Add import:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function MatchGameModal({ game, open, onOpenChange }: Props) {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('MatchGameModal')
  if (ThemedComponent) return <ThemedComponent game={game} open={open} onOpenChange={onOpenChange} />

  // ... rest unchanged
}
```

- [ ] **Step 9: Wire DiskSpaceWidget**

```typescript
// Add import:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function DiskSpaceWidget({ id }: { id?: string }) {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('DiskSpaceWidget')
  if (ThemedComponent) return <ThemedComponent id={id} />

  // ... rest unchanged
}
```

- [ ] **Step 10: Wire LauncherScanWidget**

```typescript
// Add import:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherScanWidget({ id }: { id?: string }) {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('ScanWidget')
  if (ThemedComponent) return <ThemedComponent id={id} />

  // ... rest unchanged
}
```

- [ ] **Step 11: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors in molecule files.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/features/launcher/components/molecules/
git commit -m "feat: wire launcher molecules to useLauncherTheme"
```

---

### Task 8: Extract ProgressBar + Wire Atoms (5 components)

**Files:**
- Create: `frontend/src/features/launcher/components/atoms/launcher-progress-bar.tsx`
- Modify: `frontend/src/features/launcher/pages/launcher-game-page.tsx`
- Modify: `frontend/src/features/launcher/components/atoms/launcher-game-thumb.tsx`
- Modify: `frontend/src/features/launcher/components/atoms/launcher-play-game-button.tsx`
- Modify: `frontend/src/features/launcher/components/atoms/launcher-playtime-stats.tsx`
- Modify: `frontend/src/features/launcher/components/atoms/launcher-rating-stats.tsx`

**Interfaces:**
- Consumes: `useLauncherTheme` from Task 3; `LauncherProgressBar` produced here for Task 4 (default theme)

- [ ] **Step 1: Create LauncherProgressBar atom**

```typescript
// frontend/src/features/launcher/components/atoms/launcher-progress-bar.tsx

interface LauncherProgressBarProps {
  progress: number // 0-100
}

export function LauncherProgressBar({ progress }: LauncherProgressBarProps) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 h-0.5 bg-white/5">
      <div
        className="h-full bg-[var(--color-accent)] transition-[width]"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Update launcher-game-page.tsx to use extracted ProgressBar**

Replace the inline progress bar JSX with the extracted component:

```typescript
// Add import at top:
import { LauncherProgressBar } from '@/features/launcher/components/atoms/launcher-progress-bar'

// In the JSX, replace:
// {showProgress && (
//   <div className="fixed bottom-0 inset-x-0 z-50 h-0.5 bg-white/5">
//     <div className="h-full bg-[var(--color-accent)] transition-[width]"
//       style={{ width: `${progress}%` }} />
//   </div>
// )}
// With:
{showProgress && <LauncherProgressBar progress={progress} />}
```

- [ ] **Step 3: Wire LauncherProgressBar to theme (add useLauncherTheme)**

```typescript
// Add to launcher-progress-bar.tsx, inside the component:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherProgressBar({ progress }: LauncherProgressBarProps) {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('ProgressBar')
  if (ThemedComponent) return <ThemedComponent progress={progress} />

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 h-0.5 bg-white/5">
      <div
        className="h-full bg-[var(--color-accent)] transition-[width]"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Wire GameThumb**

```typescript
// Add import at top of launcher-game-thumb.tsx:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

const GameThumb = ({ icon, alt }: { icon: string | undefined; alt: string }) => {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('GameThumb')
  if (ThemedComponent) return <ThemedComponent icon={icon} alt={alt} />

  // ... rest unchanged
}
```

- [ ] **Step 5: Wire PlayGameButton**

```typescript
// Add import at top of launcher-play-game-button.tsx:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function PlayGameButton({ game }: Props) {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('PlayButton')
  if (ThemedComponent) return <ThemedComponent game={game} />

  // ... rest unchanged
}
```

- [ ] **Step 6: Wire LauncherPlaytimeStats**

```typescript
// Add import at top of launcher-playtime-stats.tsx:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherPlaytimeStats() {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('PlaytimeStats')
  if (ThemedComponent) return <ThemedComponent />

  // ... rest unchanged
}
```

- [ ] **Step 7: Wire LauncherRatingStats**

```typescript
// Add import at top of launcher-rating-stats.tsx:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherRatingStats() {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('RatingStats')
  if (ThemedComponent) return <ThemedComponent />

  // ... rest unchanged
}
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors. All imports should resolve now.

- [ ] **Step 9: Verify app renders without errors**

Run: `npm run dev`
Navigate to launcher. Verify it renders as before (default theme = identity mapping).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/launcher/components/atoms/launcher-progress-bar.tsx
git add frontend/src/features/launcher/pages/launcher-game-page.tsx
git add frontend/src/features/launcher/components/atoms/launcher-game-thumb.tsx
git add frontend/src/features/launcher/components/atoms/launcher-play-game-button.tsx
git add frontend/src/features/launcher/components/atoms/launcher-playtime-stats.tsx
git add frontend/src/features/launcher/components/atoms/launcher-rating-stats.tsx
git commit -m "feat: extract ProgressBar atom and wire all atoms to useLauncherTheme"
```

---

### Task 9: Create Light Theme

**Files:**
- Create: `frontend/src/features/launcher/themes/light/manifest.json`
- Create: `frontend/src/features/launcher/themes/light/index.tsx`

**Interfaces:**
- Consumes: `LauncherThemeModule` from Task 1; `getThemeIds`, `getThemeModule` from Task 2 (registry picks it up automatically via dynamic import)

- [ ] **Step 1: Create manifest**

```json
{
  "id": "light",
  "name": "Light",
  "description": "A clean light launcher with subtle shadows and a static hero.",
  "author": "Otix",
  "version": "1.0.0",
  "preview": "",
  "tags": ["light", "clean", "minimal"]
}
```

- [ ] **Step 2: Create light theme module**

```typescript
// frontend/src/features/launcher/themes/light/index.tsx

import type { LauncherThemeModule } from '../types'

const theme: LauncherThemeModule = {
  default: {
    meta: {
      id: 'light',
      name: 'Light',
      description: 'A clean light launcher with subtle shadows and a static hero.',
      author: 'Otix',
      version: '1.0.0',
      preview: '',
    },
    // No component overrides — uses all defaults (19 components fall through)
    components: {},
    tokens: {
      // Surface overrides — light palette
      '--dk-surface-root': '#ffffff',
      '--dk-surface-base': '#f8f9fa',
      '--dk-surface-raised': '#ffffff',
      '--dk-surface-overlay': '#f1f3f5',
      '--dk-surface-glass': 'rgba(255,255,255,0.7)',
      '--dk-surface-glass-hover': 'rgba(255,255,255,0.85)',
      '--dk-surface-glass-active': 'rgba(255,255,255,0.95)',
      '--dk-surface-ghost': 'transparent',
      '--dk-surface-ghost-hover': 'rgba(0,0,0,0.04)',
      '--dk-surface-ghost-active': 'rgba(0,0,0,0.08)',
      '--dk-surface-field': '#f1f3f5',
      '--dk-surface-elevated': '#ffffff',
      '--dk-separator': 'rgba(0,0,0,0.08)',
      '--dk-border': 'rgba(0,0,0,0.12)',
      '--dk-border-accent': 'var(--primary)',
      '--dk-muted-foreground': '#6c757d',
      // Text
      '--color-foreground': '#1a1a2e',
      // Background
      '--color-background': '#ffffff',
      // Card
      '--color-card': '#ffffff',
      '--color-card-foreground': '#1a1a2e',
      // Remove glass shadows, use subtle box shadows
      '--dk-shadow-glass': '0 1px 3px rgba(0,0,0,0.08)',
      '--dk-shadow-dialog': '0 8px 30px rgba(0,0,0,0.12)',
    },
    layout: {
      navPosition: 'left',
      heroHeight: 'half',
      heroParallax: false,
      shelfDensity: 'comfortable',
      showFloatingSelector: true,
      backgroundType: 'solid',
    },
  },
}

export default theme
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors. Dynamic import in registry should find this module.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/launcher/themes/light/
git commit -m "feat: add light launcher theme"
```

---

### Task 10: Create Retro Theme

**Files:**
- Create: `frontend/src/features/launcher/themes/retro/manifest.json`
- Create: `frontend/src/features/launcher/themes/retro/index.tsx`
- Create: `frontend/src/features/launcher/themes/retro/components/retro-hero.tsx`
- Create: `frontend/src/features/launcher/themes/retro/components/retro-game-thumb.tsx`
- Create: `frontend/src/features/launcher/themes/retro/components/retro-progress-bar.tsx`
- Create: `frontend/src/features/launcher/themes/retro/components/retro-play-button.tsx`
- Create: `frontend/src/features/launcher/themes/retro/components/retro-floating-selector.tsx`
- Create: `frontend/src/features/launcher/themes/retro/components/retro-footer.tsx`

**Interfaces:**
- Consumes: `LauncherThemeModule` and component prop types from Task 1

- [ ] **Step 1: Create manifest**

```json
{
  "id": "retro",
  "name": "Retro",
  "description": "CRT monitor aesthetic with scanlines, phosphor glow, and pixel-perfect fonts.",
  "author": "Otix",
  "version": "1.0.0",
  "preview": "",
  "tags": ["retro", "crt", "pixel", "90s"]
}
```

- [ ] **Step 2: Create retro-hero.tsx**

```typescript
// frontend/src/features/launcher/themes/retro/components/retro-hero.tsx

import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { heroImage } from '@/features/launcher/utils'

export function RetroHero() {
  const { data: game } = useLauncherGame()

  return (
    <div className="relative w-full h-[40vh] overflow-hidden bg-black font-mono">
      {/* CRT scanlines overlay */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background: 'repeating-linear-gradient(0deg, rgba(0,255,65,0.03) 0px, rgba(0,255,65,0.03) 1px, transparent 1px, transparent 3px)',
        }}
      />
      {/* Phosphor glow */}
      <div className="absolute inset-0 z-[5] pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(0,255,65,0.08)_0%,transparent_70%)]" />
      {/* Background image */}
      {game?.cover_url && (
        <img
          src={heroImage(game.cover_url)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-30"
          style={{ filter: 'grayscale(100%) brightness(0.6)' }}
        />
      )}
      {/* Game title */}
      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <div className="text-center">
          <h1
            className="text-4xl font-bold tracking-[0.2em] uppercase"
            style={{
              color: '#00ff41',
              fontFamily: '"Courier New", monospace',
              textShadow: '0 0 10px rgba(0,255,65,0.5), 0 0 40px rgba(0,255,65,0.2)',
            }}
          >
            {game?.name ?? 'Otix Launcher'}
          </h1>
          <div className="mt-2 text-[#00ff41]/60 text-sm tracking-[0.15em] animate-pulse">
            PRESS START
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create retro-game-thumb.tsx**

```typescript
// frontend/src/features/launcher/themes/retro/components/retro-game-thumb.tsx

import type { GameThumbProps } from '../../types'

export function RetroGameThumb({ icon, alt }: GameThumbProps) {
  return (
    <div className="relative w-16 h-16 border-2 border-[#00ff41]/40 bg-black overflow-hidden"
      style={{ boxShadow: '0 0 8px rgba(0,255,65,0.2), inset 0 0 8px rgba(0,255,65,0.05)' }}>
      {icon ? (
        <img src={icon} alt={alt} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[#00ff41]/40 text-xs font-mono">
          ?
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create retro-progress-bar.tsx**

```typescript
// frontend/src/features/launcher/themes/retro/components/retro-progress-bar.tsx

import type { ProgressBarProps } from '../../types'

export function RetroProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 h-1 bg-black border-t border-[#00ff41]/30">
      <div
        className="h-full bg-[#00ff41]"
        style={{
          width: `${progress}%`,
          boxShadow: '0 0 6px rgba(0,255,65,0.6)',
          transition: 'width 50ms linear',
        }}
      />
      {/* LED segments */}
      <div className="absolute inset-0 flex" style={{ gap: '4px' }}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="h-full flex-1 border-r border-black/60 last:border-r-0" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create retro-play-button.tsx**

```typescript
// frontend/src/features/launcher/themes/retro/components/retro-play-button.tsx

import type { PlayButtonProps } from '../../types'

export function RetroPlayButton({ game }: PlayButtonProps) {
  return (
    <button
      className="px-8 py-3 bg-[#00ff41] text-black font-bold font-mono text-lg tracking-wider uppercase
        border-b-4 border-[#00aa2c] active:border-b-0 active:mt-1 transition-all"
      style={{
        boxShadow: '0 0 15px rgba(0,255,65,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
        textShadow: '0 1px 0 rgba(0,0,0,0.2)',
      }}
      onClick={() => {
        // Launch game — same logic as default via window.desktopAPI
        window.desktopAPI?.launchGame(game.id)
      }}
    >
      ▶ PLAY
    </button>
  )
}
```

- [ ] **Step 6: Create retro-floating-selector.tsx**

```typescript
// frontend/src/features/launcher/themes/retro/components/retro-floating-selector.tsx

import { usePopularGames } from '@/features/launcher/queries'
import { useLocalGames } from '@/old-features/game-scanner/game-queries'
import { toDisplayGame } from '@/features/launcher/utils'
import { useNavigate } from '@tanstack/react-router'

export function RetroFloatingSelector() {
  const navigate = useNavigate()
  const { data: popularGames } = usePopularGames()
  const { data: localGames = [] } = useLocalGames()
  const allGames = [...localGames.map(toDisplayGame), ...(popularGames ?? [])].slice(0, 10)

  return (
    <div className="fixed top-4 right-4 z-50 bg-black border border-[#00ff41]/30 p-2 font-mono text-sm"
      style={{ boxShadow: '0 0 15px rgba(0,255,65,0.15)' }}>
      <div className="text-[#00ff41]/60 text-xs mb-1 tracking-wider">SELECT GAME</div>
      {allGames.map((game, i) => (
        <button
          key={game.id}
          className="block w-full text-left px-2 py-1 text-[#00ff41] hover:bg-[#00ff41]/10 text-xs tracking-wider"
          onClick={() => navigate({ to: '/launcher/$gameId', params: { gameId: game.id } })}
        >
          <span className="text-[#00ff41]/40 mr-2">{String(i + 1).padStart(2, '0')}</span>
          {game.name}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Create retro-footer.tsx**

```typescript
// frontend/src/features/launcher/themes/retro/components/retro-footer.tsx

import type { WithIdProps } from '../../types'

export function RetroFooter({ id }: WithIdProps) {
  return (
    <footer id={id} className="bg-black border-t border-[#00ff41]/20 py-2 px-4 font-mono text-xs text-[#00ff41]/50 tracking-wider">
      <div className="flex justify-between items-center max-w-7xl mx-auto">
        <span>OTIX v1.0 // RETRO THEME</span>
        <span className="animate-pulse">█</span>
        <span>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
      </div>
    </footer>
  )
}
```

- [ ] **Step 8: Create retro theme index.tsx**

```typescript
// frontend/src/features/launcher/themes/retro/index.tsx

import type { LauncherThemeModule } from '../types'
import { RetroHero } from './components/retro-hero'
import { RetroGameThumb } from './components/retro-game-thumb'
import { RetroProgressBar } from './components/retro-progress-bar'
import { RetroPlayButton } from './components/retro-play-button'
import { RetroFloatingSelector } from './components/retro-floating-selector'
import { RetroFooter } from './components/retro-footer'

const theme: LauncherThemeModule = {
  default: {
    meta: {
      id: 'retro',
      name: 'Retro',
      description: 'CRT monitor aesthetic with scanlines, phosphor glow, and pixel-perfect fonts.',
      author: 'Otix',
      version: '1.0.0',
      preview: '',
    },
    components: {
      Hero: RetroHero,
      GameThumb: RetroGameThumb,
      ProgressBar: RetroProgressBar,
      PlayButton: RetroPlayButton,
      FloatingSelector: RetroFloatingSelector,
      Footer: RetroFooter,
    },
    tokens: {
      '--dk-font-sans': '"Courier New", monospace',
      '--dk-radius-sm': '0px',
      '--dk-radius-md': '0px',
      '--dk-radius-lg': '0px',
      '--dk-radius-xl': '0px',
      '--dk-shadow-glass': '0 0 10px rgba(0,255,65,0.15)',
      '--dk-shadow-dialog': '0 0 20px rgba(0,255,65,0.2)',
      '--dk-surface-glass': 'rgba(0,0,0,0.85)',
      '--dk-surface-base': '#0a0a0a',
      '--color-background': '#000000',
      '--color-foreground': '#00ff41',
    },
    layout: {
      navPosition: 'top',
      heroHeight: 'compact',
      heroParallax: false,
      shelfDensity: 'compact',
      showFloatingSelector: true,
      backgroundType: 'solid',
    },
  },
}

export default theme
```

- [ ] **Step 9: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/launcher/themes/retro/
git commit -m "feat: add retro CRT launcher theme"
```

---

### Task 11: Create Minimal Theme

**Files:**
- Create: `frontend/src/features/launcher/themes/minimal/manifest.json`
- Create: `frontend/src/features/launcher/themes/minimal/index.tsx`
- Create: `frontend/src/features/launcher/themes/minimal/components/minimal-hero.tsx`
- Create: `frontend/src/features/launcher/themes/minimal/components/minimal-shelf-card.tsx`
- Create: `frontend/src/features/launcher/themes/minimal/components/minimal-game-stats.tsx`

**Interfaces:**
- Consumes: `LauncherThemeModule` and prop types from Task 1

- [ ] **Step 1: Create manifest**

```json
{
  "id": "minimal",
  "name": "Minimal",
  "description": "Stripped-down, high-contrast launcher. No glass, no animations, maximum speed.",
  "author": "Otix",
  "version": "1.0.0",
  "preview": "",
  "tags": ["minimal", "flat", "fast", "high-contrast"]
}
```

- [ ] **Step 2: Create minimal-hero.tsx**

```typescript
// frontend/src/features/launcher/themes/minimal/components/minimal-hero.tsx

import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { heroImage } from '@/features/launcher/utils'

export function MinimalHero() {
  const { data: game } = useLauncherGame()

  return (
    <div className="relative w-full h-[30vh] bg-[#111] flex items-center px-8">
      {game?.cover_url && (
        <img
          src={heroImage(game.cover_url)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
      )}
      <div className="relative z-10">
        <h1 className="text-3xl font-bold text-white">{game?.name ?? 'Otix'}</h1>
        {game?.summary && (
          <p className="mt-2 text-sm text-white/60 max-w-lg line-clamp-2">{game.summary}</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create minimal-shelf-card.tsx**

```typescript
// frontend/src/features/launcher/themes/minimal/components/minimal-shelf-card.tsx

import { memo } from 'react'
import type { ShelfCardProps } from '../../types'

export const MinimalShelfCard = memo(function MinimalShelfCard({
  game,
  catalogGame,
  onClick,
}: ShelfCardProps) {
  const id = game?.id ?? catalogGame?.id ?? ''
  const name = game?.name ?? catalogGame?.name ?? 'Unknown'
  const cover = game?.cover_url ?? catalogGame?.cover_url

  return (
    <button
      onClick={() => onClick(id)}
      className="group w-full aspect-[3/4] bg-[#1a1a1a] border border-white/10 hover:border-white/30 transition-colors overflow-hidden"
    >
      {cover ? (
        <img src={cover} alt={name} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white/20 text-xs uppercase tracking-wider p-2 text-center">
          {name}
        </div>
      )}
    </button>
  )
})
```

- [ ] **Step 4: Create minimal-game-stats.tsx**

```typescript
// frontend/src/features/launcher/themes/minimal/components/minimal-game-stats.tsx

import { useLauncherGame } from '@/features/launcher/hooks/use-launcher-game'
import { useGamePlaytime } from '@/features/launcher/hooks/use-launcher-playtime'

export function MinimalGameStats() {
  const { data: game } = useLauncherGame()
  const { playtimeMinutes } = useGamePlaytime()

  return (
    <div className="flex gap-6 text-sm text-white/60 font-mono">
      {playtimeMinutes != null && playtimeMinutes > 0 && (
        <span>{Math.round(playtimeMinutes / 60)}h played</span>
      )}
      {game?.rating != null && game.rating > 0 && (
        <span>★ {game.rating.toFixed(1)}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create minimal theme index.tsx**

```typescript
// frontend/src/features/launcher/themes/minimal/index.tsx

import type { LauncherThemeModule } from '../types'
import { MinimalHero } from './components/minimal-hero'
import { MinimalShelfCard } from './components/minimal-shelf-card'
import { MinimalGameStats } from './components/minimal-game-stats'

const theme: LauncherThemeModule = {
  default: {
    meta: {
      id: 'minimal',
      name: 'Minimal',
      description: 'Stripped-down, high-contrast launcher. No glass, no animations, maximum speed.',
      author: 'Otix',
      version: '1.0.0',
      preview: '',
    },
    components: {
      Hero: MinimalHero,
      ShelfCard: MinimalShelfCard,
      GameStats: MinimalGameStats,
      // FloatingSelector is deliberately omitted — layout.showFloatingSelector: false hides it
    },
    tokens: {
      '--dk-radius-sm': '0px',
      '--dk-radius-md': '0px',
      '--dk-radius-lg': '0px',
      '--dk-radius-xl': '0px',
      '--dk-radius-2xl': '0px',
      '--dk-radius-3xl': '0px',
      '--dk-radius-full': '0px',
      '--dk-shadow-xs': 'none',
      '--dk-shadow-sm': 'none',
      '--dk-shadow-md': 'none',
      '--dk-shadow-lg': 'none',
      '--dk-shadow-xl': 'none',
      '--dk-shadow-glass': 'none',
      '--dk-shadow-dialog': 'none',
      '--dk-duration-fast': '0ms',
      '--dk-duration-normal': '0ms',
      '--dk-duration-slow': '0ms',
      '--dk-duration-page': '0ms',
      '--dk-surface-glass': 'rgba(0,0,0,0.95)',
      '--dk-surface-glass-hover': 'rgba(0,0,0,0.98)',
    },
    layout: {
      navPosition: 'left',
      heroHeight: 'compact',
      heroParallax: false,
      shelfDensity: 'compact',
      showFloatingSelector: false,
      backgroundType: 'solid',
    },
  },
}

export default theme
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/launcher/themes/minimal/
git commit -m "feat: add minimal launcher theme"
```

---

### Task 12: Add Launcher Theme Card to Appearance Settings

**Files:**
- Modify: `frontend/src/features/settings/sections/settings-appearance.tsx`

**Interfaces:**
- Consumes: `useLauncherTheme` (or direct localStorage read for settings page); theme registry from Task 2

- [ ] **Step 1: Add launcher theme card to appearance settings**

Insert a new card between the "Theme" card and "Accent Color" card. The card shows 4 theme preview slots in a grid, highlights the active one, and switches on click.

Since the settings page may not be inside `LauncherThemeProvider`, read/write `localStorage['otix-launcher-theme']` directly and use the theme registry for metadata.

```typescript
// Add imports at top of settings-appearance.tsx:
import { getThemeIds, getThemeModule } from '@/features/launcher/themes/registry'
import type { LauncherThemeManifest } from '@/features/launcher/themes/types'
import { useState, useEffect } from 'react'

// Add inside AppearanceSection component:

const LAUNCHER_THEME_KEY = 'otix-launcher-theme'

const [launcherThemeId, setLauncherThemeId] = useState(() => {
  try { return localStorage.getItem(LAUNCHER_THEME_KEY) || 'default' }
  catch { return 'default' }
})
const [themeMetas, setThemeMetas] = useState<LauncherThemeManifest[]>([])

useEffect(() => {
  const ids = getThemeIds()
  Promise.all(ids.map(id => getThemeModule(id))).then(modules => {
    setThemeMetas(modules.map(m => m.default.meta))
  })
}, [])
```

Insert the card JSX after the Theme card's closing `</div>` and before the Accent Color card:

```tsx
{/* Launcher Theme */}
<div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
  <h3 className="text-sm font-medium text-white/80 mb-1">Launcher Theme</h3>
  <p className="text-xs text-white/40 mb-4">
    Change the look and feel of the game launcher.
  </p>
  <div className="grid grid-cols-4 gap-3">
    {themeMetas.map(meta => (
      <button
        key={meta.id}
        onClick={() => {
          setLauncherThemeId(meta.id)
          localStorage.setItem(LAUNCHER_THEME_KEY, meta.id)
          // Dispatch storage event so LauncherThemeProvider in other tabs reacts
          window.dispatchEvent(new StorageEvent('storage', {
            key: LAUNCHER_THEME_KEY,
            newValue: meta.id,
          }))
        }}
        className={`
          relative rounded-xl overflow-hidden aspect-[4/3] border-2 transition-all
          ${launcherThemeId === meta.id
            ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/30'
            : 'border-white/10 hover:border-white/30'}
        `}
      >
        {/* Theme preview placeholder — solid color representing theme vibe */}
        <div className={`
          w-full h-full flex items-center justify-center text-xs font-medium
          ${meta.id === 'default' ? 'bg-[#0a0a0d] text-white/60' : ''}
          ${meta.id === 'light' ? 'bg-[#f8f9fa] text-black/60' : ''}
          ${meta.id === 'retro' ? 'bg-black text-[#00ff41]/60 font-mono' : ''}
          ${meta.id === 'minimal' ? 'bg-[#1a1a1a] text-white/40' : ''}
        `}>
          {meta.name}
        </div>
        {/* Checkmark overlay when selected */}
        {launcherThemeId === meta.id && (
          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[var(--primary)] flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </button>
    ))}
  </div>
  {/* Selected theme description */}
  {themeMetas.find(m => m.id === launcherThemeId) && (
    <p className="mt-3 text-xs text-white/50">
      {themeMetas.find(m => m.id === launcherThemeId)!.description}
    </p>
  )}
</div>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors in settings-appearance.tsx.

- [ ] **Step 3: Verify settings page renders**

Run: `npm run dev`
Navigate to /settings/appearance. Verify launcher theme card shows between Theme and Accent Color.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/settings/sections/settings-appearance.tsx
git commit -m "feat: add launcher theme picker to appearance settings"
```

---

### Task 13: Integrate navPosition into NavShell

**Files:**
- Modify: `frontend/src/features/navigation/components/organisms/navigation-shell.tsx`

**Interfaces:**
- Consumes: `useLauncherTheme` from Task 3 (only effective when inside launcher routes)

- [ ] **Step 1: Read navPosition from launcher theme context**

The `NavShell` currently hides pills entirely on `/launcher` and `/game` routes. When a launcher theme requests `navPosition: 'top'`, we should show a top-positioned nav on launcher routes instead of hiding.

```typescript
// In navigation-shell.tsx, add import:
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'
import { useRouterState } from '@tanstack/react-router'

export function NavShell({ children }: { children: ReactNode }) {
  const router = useRouterState()
  const path = router.location.pathname

  // Try to read launcher theme — gracefully handles being outside provider
  let launcherTheme: { navPosition?: string } | null = null
  try {
    const ctx = useLauncherTheme()
    launcherTheme = ctx.theme?.layout ?? null
  } catch {
    // Not inside LauncherThemeProvider — use default (left, hidden on launcher)
  }

  const isLauncherRoute = path.startsWith('/launcher') || path.startsWith('/game')
  const navPosition = launcherTheme?.navPosition ?? 'left'

  // Show nav on launcher routes only if theme requests top position
  const showNavOnLauncher = isLauncherRoute && navPosition === 'top'

  // Show normal nav on non-launcher routes
  const showNormalNav = !isLauncherRoute

  return (
    <NavigationProvider>
      {showNormalNav && (
        <>
          <NavPillLeft />
          <MenuDropdown />
          <NavPillRight />
        </>
      )}
      {showNavOnLauncher && (
        <div className="fixed top-0 inset-x-0 z-[9999] flex justify-center pt-2">
          {/* Top-positioned compact nav for launcher themes */}
          <NavPill className="px-3 py-1.5">
            <MenuToggle />
            <NavSearch />
          </NavPill>
        </div>
      )}
      {children}
    </NavigationProvider>
  )
}
```

- [ ] **Step 2: Verify NavShell compiles and renders**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

Run: `npm run dev`
Navigate to non-launcher routes — nav should work as before.
Navigate to launcher with default theme — nav should be hidden (current behavior).
Switch to retro theme — top nav should appear on launcher.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/navigation/components/organisms/navigation-shell.tsx
git commit -m "feat: integrate launcher theme navPosition into NavShell"
```

---

### Task 14: End-to-End Integration Test

**Files:** No new files — manual verification pass

- [ ] **Step 1: Verify default theme renders correctly**

- Navigate to `/launcher`
- Confirm: dark background, glass cards, parallax hero, floating selector visible
- Navigate to `/launcher/some-game-id`
- Confirm: all 19 components render (hero, shelf, footer, game buttons, stats, companies, detail info, play button, playtime, rating, progress bar)

- [ ] **Step 2: Verify light theme**

- Navigate to `/settings/appearance`
- Click "Light" theme card
- Navigate to `/launcher`
- Confirm: light background, no parallax, half-height hero, box shadows instead of glass
- Navigate to `/launcher/some-game-id`
- Confirm: all components render, tokens applied

- [ ] **Step 3: Verify retro theme**

- In settings, click "Retro"
- Navigate to `/launcher`
- Confirm: CRT scanlines, phosphor green text, monospace font, top nav, compact hero
- Navigate to `/launcher/some-game-id`
- Confirm: retro hero, retro thumb, retro play button (3D bevel), retro progress bar (segmented LED), retro footer, retro floating selector

- [ ] **Step 4: Verify minimal theme**

- In settings, click "Minimal"
- Navigate to `/launcher`
- Confirm: flat colors, no glass, no animations, no floating selector, compact hero
- Navigate to `/launcher/some-game-id`
- Confirm: minimal hero (simple bar), minimal shelf cards (border-only), minimal stats (text-only)

- [ ] **Step 5: Verify theme persistence**

- Select Retro theme
- Refresh page (F5)
- Confirm: Retro theme still active (persisted in localStorage)
- Close tab, open new tab, navigate to launcher
- Confirm: Retro theme still active

- [ ] **Step 6: Verify no flash on theme load**

- Set theme to Light
- Navigate to launcher
- Confirm: default components shown during theme module load, then light tokens apply — no white flash or broken layout

- [ ] **Step 7: Verify non-launcher pages unaffected**

- Navigate to `/discover`, `/settings`, `/media`
- Confirm: these pages render normally regardless of launcher theme selection
- Confirm: nav pills visible and positioned correctly on non-launcher routes

- [ ] **Step 8: Commit final notes**

```bash
git add -A
git commit -m "chore: end-to-end verification of launcher theme system"
```

---

## Implementation Order Summary

| Task | What | Depends On | Notes |
|------|------|------------|-------|
| 1 | Types | — | |
| 2 | Registry | 1 | |
| 3 | Provider + Hook | 1, 2 | |
| 4 | Default theme module | 1, 8 | Needs LauncherProgressBar from Task 8 Step 1 |
| 5 | Wrap provider in launcher tree | 3 | |
| 6 | Wire organisms (4) | 3, 5 | |
| 7 | Wire molecules (10) | 3, 5 | |
| 8 | Extract ProgressBar + wire atoms (5) | 3, 5 | Do ProgressBar extraction (Step 1-3) before Task 4 |
| 9 | Light theme | 1, 2 | |
| 10 | Retro theme | 1, 2 | |
| 11 | Minimal theme | 1, 2 | |
| 12 | Settings UI | 2, 3 | |
| 13 | NavShell integration | 3 | |
| 14 | Integration test | All | |
