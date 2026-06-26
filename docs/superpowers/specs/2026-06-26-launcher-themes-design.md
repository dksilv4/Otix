# Launcher Themes — Design Spec

**Date:** 2026-06-26
**Status:** Design approved, awaiting spec review

## Overview

Add a theme system to the launcher. Themes can completely redesign the launcher — swapping components, overriding CSS tokens, and changing layout. Users select from built-in themes in Appearance settings. Architecture designed to allow plugin-contributed themes later.

- **Scope:** Launcher screens + nav shell
- **Initial themes:** 4 built-in (Default Dark, Light, Retro, Minimal)
- **Distribution:** Built-in only for now; plugin marketplace support later
- **Storage:** `localStorage` key `otix-launcher-theme`

## Architecture

```
ThemeProvider (existing, extended)
  ├── launcherTheme: string              ← NEW field
  └── setLauncherTheme(id: string)       ← NEW setter

LauncherThemeProvider (NEW context)
  ├── Lazy-imports active theme module
  ├── Injects theme tokens as CSS custom properties
  ├── Exposes theme components via useLauncherTheme() hook
  └── Reads/writes localStorage['otix-launcher-theme']

Theme Module (per theme: themes/<id>/)
  ├── manifest.json       meta, preview, version
  ├── index.tsx           component overrides + tokens + layout export
  └── components/         theme-specific component files
```

### Load flow

1. `LauncherThemeProvider` mounts, reads `otix-launcher-theme` from localStorage (default: `"default"`)
2. `useEffect` triggers dynamic `import("../themes/${id}/index.tsx")`
3. While loading, children render with default components (no flash)
4. Module loaded → inject tokens on wrapper div via CSS custom properties
5. `useLauncherTheme().component('Hero')` returns themed component or `null`
6. Consumer: `const Hero = useLauncherTheme().component('Hero') ?? DefaultHero`

### Provider placement

```
ThemeProvider (existing)
  └─ LauncherThemeProvider (NEW, wraps launcher routes)
       └─ Launcher route tree
```

## `LauncherTheme` Interface

```typescript
// frontend/src/features/launcher/themes/types.ts

interface LauncherThemeManifest {
  id: string
  name: string
  description: string
  author: string
  version: string
  preview: string              // path to preview image asset
  tags?: string[]
}

interface LauncherThemeComponents {
  // Organisms
  Hero?: ComponentType<HeroProps>
  Shelf?: ComponentType<ShelfProps>
  Footer?: ComponentType<FooterProps>
  GameButtons?: ComponentType<GameButtonsProps>

  // Molecules
  FloatingSelector?: ComponentType<FloatingSelectorProps>
  ShelfCard?: ComponentType<ShelfCardProps>
  GameStats?: ComponentType<GameStatsProps>
  GameCompanies?: ComponentType<GameCompaniesProps>
  GameDetailInfo?: ComponentType<GameDetailInfoProps>
  EmptyState?: ComponentType<EmptyStateProps>
  LoadingState?: ComponentType<LoadingStateProps>
  MatchGameModal?: ComponentType<MatchGameModalProps>
  DiskSpaceWidget?: ComponentType<DiskSpaceWidgetProps>
  ScanWidget?: ComponentType<ScanWidgetProps>

  // Atoms
  GameThumb?: ComponentType<GameThumbProps>
  PlayButton?: ComponentType<PlayButtonProps>
  PlaytimeStats?: ComponentType<PlaytimeStatsProps>
  RatingStats?: ComponentType<RatingStatsProps>
  ProgressBar?: ComponentType<ProgressBarProps>
}

interface LauncherThemeLayout {
  navPosition?: 'top' | 'left'
  heroHeight?: 'full' | 'half' | 'compact'
  heroParallax?: boolean
  shelfDensity?: 'comfortable' | 'compact'
  showFloatingSelector?: boolean
  backgroundType?: 'solid' | 'gradient' | 'shader' | 'image'
}

interface LauncherTheme {
  meta: LauncherThemeManifest
  components?: Partial<LauncherThemeComponents>
  tokens?: Record<string, string>     // CSS custom property overrides
  layout?: Partial<LauncherThemeLayout>
}

interface LauncherThemeModule {
  default: LauncherTheme
}
```

## Hook & Context

```typescript
// frontend/src/features/launcher/themes/launcher-theme-context.tsx

interface LauncherThemeContextValue {
  theme: LauncherTheme
  component: <K extends keyof LauncherThemeComponents>(
    key: K
  ) => ComponentType<PropsFor<K>> | null
}

function useLauncherTheme(): LauncherThemeContextValue
function LauncherThemeProvider({ children }: { children: ReactNode })
```

### Component consumption pattern

Every themeable component follows this pattern:

```typescript
function LauncherHero(props: HeroProps) {
  const { component } = useLauncherTheme()
  const ThemedHero = component('Hero') ?? DefaultHero
  return <ThemedHero {...props} />
}
```

## Overridable Components (19 slots)

| Category | Slot Key | Source File |
|----------|----------|-------------|
| Organism | `Hero` | `components/organisms/game-hero.tsx` |
| Organism | `Shelf` | `components/organisms/shelf.tsx` |
| Organism | `Footer` | `components/organisms/footer.tsx` |
| Organism | `GameButtons` | `components/organisms/game-buttons.tsx` |
| Molecule | `FloatingSelector` | `components/molecules/floating-game-selector.tsx` |
| Molecule | `ShelfCard` | `components/molecules/shelf-card.tsx` |
| Molecule | `GameStats` | `components/molecules/game-stats.tsx` |
| Molecule | `GameCompanies` | `components/molecules/game-companies.tsx` |
| Molecule | `GameDetailInfo` | `components/molecules/game-detail-info.tsx` |
| Molecule | `EmptyState` | `components/molecules/empty-state.tsx` |
| Molecule | `LoadingState` | `components/molecules/loading.tsx` |
| Molecule | `MatchGameModal` | `components/molecules/match-game-modal.tsx` |
| Molecule | `DiskSpaceWidget` | `components/molecules/disk-space-widget.tsx` |
| Molecule | `ScanWidget` | `components/molecules/scan-widget.tsx` |
| Atom | `GameThumb` | `components/atoms/game-thumb.tsx` |
| Atom | `PlayButton` | `components/atoms/play-game-button.tsx` |
| Atom | `PlaytimeStats` | `components/atoms/playtime-stats.tsx` |
| Atom | `RatingStats` | `components/atoms/rating-stats.tsx` |
| Atom | `ProgressBar` | inline in `pages/launcher-game-page.tsx` |

Unchanged: hooks, queries, data fetching, game actions. Themes are pure presentation.

## Theme Directory Structure

```
frontend/src/features/launcher/themes/
  types.ts
  launcher-theme-context.tsx
  registry.ts                    // maps theme id → import path
  default/
    manifest.json
    index.tsx                    // re-exports all 19 defaults
  light/
    manifest.json
    index.tsx                    // tokens + layout overrides only
  retro/
    manifest.json
    index.tsx
    components/                  // retro-specific overrides
  minimal/
    manifest.json
    index.tsx
    components/                  // minimal-specific overrides
```

## Four Built-in Themes

### 1. Default (Dark) — `id: "default"`
Current launcher, unchanged.
- Dark surfaces (`#0a0a0d`), glass-morphism cards, accent-color hero parallax
- Left nav, full hero height, parallax on, gradient background
- All 19 components = defaults (identity mapping in theme module)

### 2. Light — `id: "light"`
Clean white/grey launcher.
- Light surfaces, subtle box-shadows instead of glass, same component structure
- Half-height hero, no parallax (static hero image), solid background
- Same components as default (uses all 19 defaults)
- Only overrides: `tokens` + `layout`

### 3. Retro — `id: "retro"`
CRT / 90s console aesthetic.
- Scanlines CSS overlay, monospace pixel font, green/amber phosphor on black
- Overrides: `Hero`, `GameThumb`, `ProgressBar`, `PlayButton`, `FloatingSelector`, `Footer`
- Layout: compact hero, compact shelf density, top nav position
- Tokens: monospace font, sharp border radii, no glass, hard shadows, scanline animation

### 4. Minimal — `id: "minimal"`
Stripped down, high contrast, fast.
- Flat colors, no glass, no parallax, no shader background, no animations
- Overrides: `Hero`, `ShelfCard`, `FloatingSelector`, `GameStats`
- Layout: compact hero, no parallax, solid background, floating selector hidden
- Tokens: border-radius 0, no shadows, animation-duration 0ms

## Settings UI

New card in Appearance settings (`settings-appearance.tsx`), placed between "Theme" and "Accent Color":

- Theme grid: 4 theme cards (preview image + name), 4 across
- Selected state: accent border + checkmark overlay
- Click selects → shows description + larger preview below
- Changes saved to `localStorage['otix-launcher-theme']` immediately
- `LauncherThemeProvider` detects change and lazy-loads new theme

## Nav Shell Integration

`NavShell` reads `useLauncherTheme().theme.layout.navPosition`:
- `'left'` — current pill nav (default)
- `'top'` — horizontal top bar (retro style)

Layout only applies on launcher routes. Elsewhere nav stays default (left). Detect via route matching.

## Extension Path: Plugin Themes (future)

Theme modules match plugin module shape. To add plugin themes later:

1. Add `theme` contribution point to plugin manifest schema
2. Plugin `main.js` exports `LauncherThemeModule`
3. `registry.ts` merges built-in + plugin theme entries
4. Same `LauncherThemeProvider` handles both — zero changes needed

## Implementation Order

1. Create theme types (`themes/types.ts`)
2. Create `LauncherThemeProvider` + `useLauncherTheme` hook
3. Extract default theme module (`themes/default/`)
4. Add `component()` fallback pattern to all 19 components
5. Build Light theme (tokens + layout only — validates the system)
6. Build Retro theme (component overrides — validates component swap)
7. Build Minimal theme
8. Add settings UI card to Appearance page
9. Integrate `navPosition` into NavShell
10. Test: switch themes, verify all 19 fallback paths work, no flash on load
