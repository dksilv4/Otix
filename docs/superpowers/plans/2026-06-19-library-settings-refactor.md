# Library Settings Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Rename "Game Library" to "Library" in settings, add per-path + batch scan buttons, restyle to match app glassmorphic pattern.

**Architecture:** Modify constants/router for rename, rewrite `sections/game-library.tsx` as `sections/library.tsx` with scan buttons and modern styling, move Organizer sub-section to Downloads page.

**Tech Stack:** React, TanStack Router, Electron IPC (preload bridge), Tailwind CSS

## Global Constraints

- No new dependencies
- Match existing glassmorphic pattern: `rounded-2xl p-6 bg-white/5 backdrop-blur-xl` for cards, shared `SectionHeader` component
- Scan uses existing `window.desktopAPI.scanPaths()` IPC method
- Per-path scan calls `scanPaths([singlePath], [])` or `scanPaths([], [singlePath])`
- All states covered: loading, empty, scanning, error, populated
- Keep existing game-queries hooks for match/verify flow

---

### Task 1: Rename nav item + route + page files

**Files:**
- Modify: `frontend/src/features/settings/constants.ts`
- Modify: `frontend/src/features/settings/settings.router.ts`
- Rename: `frontend/src/features/settings/pages/settings-game-library-page.tsx` → `settings-library-page.tsx`
- Modify: `frontend/src/features/settings/index.ts`

**Interfaces:**
- Consumes: existing settings route structure
- Produces: renamed constants, route at `/settings/library`, updated exports

- [ ] **Step 1: Update nav constants**

`constants.ts` — change `id` from `'game-library'` to `'library'`, label from `'Game Library'` to `'Library'`:

```ts
// Line 19
{ id: 'library', label: 'Library', icon: Gamepad2, desktop: true },
```

- [ ] **Step 2: Update route path**

`settings.router.ts` — change path from `'/game-library'` to `'/library'`:

```ts
// Line 63
  const settingsLibraryRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/library',
    component: SettingsLibraryPage,
  })
```

Update the import variable name (line 11):

```ts
const SettingsLibraryPage = lazy(() => import('./pages/settings-library-page').then(m => ({ default: m.SettingsLibraryPage })))
```

Update the route push in the array (line 93):

```ts
    settingsLibraryRoute,
```

- [ ] **Step 3: Rename page file**

Rename `pages/settings-game-library-page.tsx` → `pages/settings-library-page.tsx`.

Update its content:

```tsx
import { LibrarySection } from '../sections/library'

export function SettingsLibraryPage() {
  return <LibrarySection />
}
```

- [ ] **Step 4: Update exports in index.ts**

```ts
export { SettingsLibraryPage } from './pages/settings-library-page'
```

Remove the old export for `SettingsGameLibraryPage`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/settings/constants.ts \
        frontend/src/features/settings/settings.router.ts \
        frontend/src/features/settings/pages/settings-library-page.tsx \
        frontend/src/features/settings/pages/settings-game-library-page.tsx \
        frontend/src/features/settings/index.ts
git commit -m "refactor(settings): rename game-library to library"
```

---

### Task 2: Rewrite library.tsx with scan buttons + glassmorphic style

**Files:**
- Create: `frontend/src/features/settings/sections/library.tsx`
- Delete: `frontend/src/features/settings/sections/game-library.tsx`

**Interfaces:**
- Consumes: `SectionHeader` from `../components/section-header`, `useDesktopPlatform` from `@/lib/desktop/platform`, scan/storage utilities from `@/old-features/game-scanner/storage`, game queries from `@/old-features/game-scanner/game-queries`
- Produces: `LibrarySection` component with all states

- [ ] **Step 1: Write the new LibrarySection component**

Create `frontend/src/features/settings/sections/library.tsx`:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { Scan, Folder, Disc, Gamepad2, X, CheckCircle2, Loader2, FolderPlus, Disc3 } from 'lucide-react'
import { SectionHeader } from '../components/section-header'
import { useDesktopPlatform } from '@/lib/desktop/platform'
import { getScanPaths, getIsoPaths, setScanPaths, setIsoPaths, setScannedGames } from '@/old-features/game-scanner/storage'
import { useLocalGames } from '@/old-features/game-scanner/game-queries'
import { useMatchLocalGames } from '@/old-features/game-scanner/queries'
import { useClaimGame } from '@/old-features/library/library-queries'
import type { LocalGame } from '@/old-features/game-scanner/types'
import { getDesktopAPI, hasDesktopAPI } from '@/lib/desktop/api'

// ── Helpers ───────────────────────────────────────────────────────────────

type ScanState = 'idle' | 'scanning' | 'done' | 'error'
type PathEntry = { path: string; scanState: ScanState }

function usePathList(
  initialGetter: () => string[],
  setter: (paths: string[]) => void,
  storageKey: string,
) {
  const [paths, setPaths] = useState<PathEntry[]>(() =>
    initialGetter().map((p) => ({ path: p, scanState: 'idle' as ScanState }))
  )

  const addPath = useCallback(async () => {
    if (!hasDesktopAPI()) return
    const dir = await window.desktopAPI!.selectDirectory()
    if (!dir) return
    setPaths((prev) => {
      if (prev.some((p) => p.path === dir)) return prev
      const next = [...prev, { path: dir, scanState: 'idle' as ScanState }]
      setter(next.map((p) => p.path))
      return next
    })
  }, [setter])

  const removePath = useCallback((path: string) => {
    setPaths((prev) => {
      const next = prev.filter((p) => p.path !== path)
      setter(next.map((p) => p.path))
      return next
    })
  }, [setter])

  const setScanStateFor = useCallback((path: string, state: ScanState) => {
    setPaths((prev) =>
      prev.map((p) => (p.path === path ? { ...p, scanState: state } : p))
    )
  }, [])

  return { paths, setPaths, addPath, removePath, setScanStateFor }
}

// ── Scanner sub-section ───────────────────────────────────────────────────

function ScannersSection() {
  const { isDesktop } = useDesktopPlatform()
  const { data: serverGames = [] } = useLocalGames()
  const [scannedGames, setScannedGamesLocal] = useState<LocalGame[]>(serverGames)
  const [batchScanning, setBatchScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)
  const gamesUnsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    setScannedGamesLocal(serverGames)
  }, [serverGames])

  const gamePaths = usePathList(getScanPaths, (p) => setScanPaths(p))
  const isoPaths = usePathList(getIsoPaths, (p) => setIsoPaths(p))

  const matchMutation = useMatchLocalGames()
  const claimMutation = useClaimGame()
  const [matching, setMatching] = useState(false)

  // Subscribe to scanner progress and games-updated events
  useEffect(() => {
    if (!hasDesktopAPI()) return
    const api = window.desktopAPI as any
    unsubRef.current = api.onScannerProgress?.((data: { currentDir: string; progress: number }) => {
      setScanProgress(data.currentDir)
    })
    gamesUnsubRef.current = api.onGamesUpdated?.(() => {
      // Refresh games list after scan completes
      getDesktopAPI()?.getScannedGames().then((games) => {
        if (games?.length) setScannedGamesLocal(games)
      }).catch(() => {})
    })
    return () => {
      unsubRef.current?.()
      gamesUnsubRef.current?.()
    }
  }, [])

  const doScan = useCallback(async (targetGamePaths: string[], targetIsoPaths: string[], onDone?: () => void) => {
    if (!hasDesktopAPI()) return
    try {
      const api = getDesktopAPI()!
      const games = await api.scanPaths(targetGamePaths, targetIsoPaths)
      if (games?.length) {
        setScannedGamesLocal(games)
      }
    } catch (err) {
      console.error('Scan failed:', err)
    } finally {
      onDone?.()
    }
  }, [])

  const handleScanAll = useCallback(async () => {
    if (batchScanning) return
    setBatchScanning(true)
    setScanProgress('Starting scan...')
    try {
      await doScan(
        gamePaths.paths.map((p) => p.path),
        isoPaths.paths.map((p) => p.path),
      )
    } finally {
      setBatchScanning(false)
      setScanProgress(null)
    }
  }, [batchScanning, gamePaths.paths, isoPaths.paths, doScan])

  const handleScanPath = useCallback(async (path: string, isIso: boolean) => {
    gamePaths.setScanStateFor(path, 'scanning')
    isoPaths.setScanStateFor(path, 'scanning')
    setScanProgress(path)
    try {
      await doScan(
        isIso ? [] : [path],
        isIso ? [path] : [],
      )
      gamePaths.setScanStateFor(path, 'done')
      isoPaths.setScanStateFor(path, 'done')
    } catch {
      gamePaths.setScanStateFor(path, 'error')
      isoPaths.setScanStateFor(path, 'error')
    } finally {
      setScanProgress(null)
    }
  }, [doScan, gamePaths, isoPaths])

  const handleMatchAll = useCallback(async () => {
    setMatching(true)
    try {
      const result = await matchMutation.mutateAsync(scannedGames)
      if (!result) return
      setScannedGamesLocal(result)
    } catch (err) {
      console.error('Match failed:', err)
    } finally {
      setMatching(false)
    }
  }, [scannedGames, matchMutation])

  const handleVerifyAll = useCallback(() => {
    const newlyClaimed: string[] = []
    const withClaimed = scannedGames.map((g) => {
      if (!g.data?.id || g.otixMatchVerified) return g
      newlyClaimed.push(g.data?.id)
      return { ...g, otixMatchVerified: true, otixClaimed: true }
    })
    setScannedGamesLocal(withClaimed)
    for (const mediaId of newlyClaimed) {
      claimMutation.mutate({ mediaType: 'game', mediaId })
    }
  }, [scannedGames, claimMutation])

  const anyScanning = batchScanning ||
    [...gamePaths.paths, ...isoPaths.paths].some((p) => p.scanState === 'scanning')
  const totalPaths = gamePaths.paths.length + isoPaths.paths.length

  if (!isDesktop) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Gamepad2 className="h-10 w-10 text-white/20" />
        <div>
          <p className="text-sm font-medium text-white">Desktop Only</p>
          <p className="text-xs text-white/60 mt-1">
            Library management is only available in the desktop app.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Scan All card */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <SectionHeader
              title="Scan Paths"
              description={
                totalPaths === 0
                  ? 'No scan paths configured. Add game or ISO directories below.'
                  : `${totalPaths} path${totalPaths !== 1 ? 's' : ''} configured · ${scannedGames.length} game${scannedGames.length !== 1 ? 's' : ''} discovered`
              }
            />
          </div>
          <button
            onClick={handleScanAll}
            disabled={anyScanning || totalPaths === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 ml-4"
          >
            {batchScanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Scan className="h-4 w-4" />
            )}
            {batchScanning ? 'Scanning...' : 'Scan All'}
          </button>
        </div>
        {batchScanning && scanProgress && (
          <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
            <Loader2 className="h-3 w-3 animate-spin" />
            Scanning: {scanProgress}
          </div>
        )}
      </div>

      {/* Game Scan Paths */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader
          title="Game Directories"
          description="Folders where Otix looks for installed games (.exe files)."
        />
        <div className="space-y-2">
          {gamePaths.paths.map((entry) => (
            <div
              key={entry.path}
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Folder className="h-4 w-4 shrink-0 text-white/40" />
                <span className="text-sm truncate text-white/80">{entry.path}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {entry.scanState === 'scanning' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <button
                    onClick={() => handleScanPath(entry.path, false)}
                    disabled={anyScanning}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
                    title="Scan this directory"
                  >
                    <Scan className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => gamePaths.removePath(entry.path)}
                  className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
                  title="Remove path"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={gamePaths.addPath}
          disabled={!hasDesktopAPI()}
          className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          Add Game Directory
        </button>
      </div>

      {/* ISO Mount Paths */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader
          title="ISO Directories"
          description="Folders containing ISO files to scan, mount, and install."
        />
        <div className="space-y-2">
          {isoPaths.paths.map((entry) => (
            <div
              key={entry.path}
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Disc className="h-4 w-4 shrink-0 text-white/40" />
                <span className="text-sm truncate text-white/80">{entry.path}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {entry.scanState === 'scanning' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <button
                    onClick={() => handleScanPath(entry.path, true)}
                    disabled={anyScanning}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
                    title="Scan this directory"
                  >
                    <Scan className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => isoPaths.removePath(entry.path)}
                  className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
                  title="Remove path"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={isoPaths.addPath}
          disabled={!hasDesktopAPI()}
          className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
        >
          <Disc3 className="h-3.5 w-3.5" />
          Add ISO Directory
        </button>
      </div>

      {/* Discovered Games */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader
          title="Discovered Games"
          description={
            scannedGames.length === 0
              ? 'No games found yet. Add scan paths above and click Scan All to discover installed games.'
              : `${scannedGames.length} game${scannedGames.length !== 1 ? 's' : ''} found on your system.`
          }
        />
        {scannedGames.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleMatchAll}
              disabled={matching}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-40"
            >
              {matching && <Loader2 className="h-4 w-4 animate-spin" />}
              Match All to Catalog
            </button>
            <button
              onClick={handleVerifyAll}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white/70 bg-white/5 hover:bg-white/10 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              Verify All Matches
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────

export function LibrarySection() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-white tracking-tight">Library</h2>
        <p className="text-sm mt-1 text-white/60">
          Manage installed games and scan for new ones.
        </p>
      </div>
      <ScannersSection />
    </div>
  )
}
```

- [ ] **Step 2: Delete old game-library.tsx**

Remove `frontend/src/features/settings/sections/game-library.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/settings/sections/library.tsx \
        frontend/src/features/settings/sections/game-library.tsx
git commit -m "feat(settings): add scan buttons + glassmorphic style to Library section"
```

---

### Task 3: Move Organizer sub-section to Downloads page

**Files:**
- Modify: `frontend/src/features/settings/sections/downloads.tsx`

**Interfaces:**
- Consumes: existing Downloads section structure, `DkButton`/`DkSwitch` components
- Produces: Organizer card appended at bottom of Downloads page

- [ ] **Step 1: Append Organizer section to Downloads**

Add this at the end of `downloads.tsx`, just before the closing `</div>` of the main return (after the download history block, around line 477):

```tsx
      {/* ── Organizer ── */}
      <div className="rounded-2xl p-6 space-y-4" style={{ backgroundColor: 'var(--dk-surface-glass)' }}>
        <div>
          <h3 className="text-sm font-semibold text-white">Organization</h3>
          <p className="mt-0.5 text-xs text-white/60">
            Control how downloaded games are automatically renamed and organized.
          </p>
        </div>

        {/* Auto-organize toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Auto-Organize</p>
            <p className="text-xs text-white/60 mt-0.5">
              Automatically rename and sort downloaded games into organized folders.
            </p>
          </div>
          <DkSwitch checked={autoOrganizeEnabled} onCheckedChange={setAutoOrganizeEnabled} />
        </div>

        {/* Naming template */}
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            {NAMING_PRESETS.map((p: { id: string; label: string; template: string }) => (
              <DkButton
                key={p.id}
                size="sm"
                variant={presetId === p.id ? 'primary' : 'ghost'}
                onClick={() => {
                  setPresetId(p.id)
                  setNamingTemplate(p.template)
                }}
              >
                {p.label}
              </DkButton>
            ))}
            <DkButton
              size="sm"
              variant={presetId === 'custom' ? 'primary' : 'ghost'}
              onClick={() => setPresetId('custom')}
            >
              Custom
            </DkButton>
          </div>
          <input
            type="text"
            value={namingTemplate}
            onChange={(e) => { setNamingTemplate(e.target.value); setPresetId('custom') }}
            className="w-full text-sm text-white outline-none h-9 rounded-xl bg-white/5 px-3 shadow-[0_0_0_1px_rgba(255,255,255,0.1)] transition-shadow duration-150 focus:shadow-[0_0_0_1px_rgba(255,255,255,0.3)] placeholder:text-white/30"
          />
          <div className="mt-3">
            <details className="group">
              <summary className="cursor-pointer text-[11px] font-medium text-white/40 hover:text-white/60 transition-colors">
                Available tokens
              </summary>
              <div className="mt-2 space-y-1">
                {TOKEN_DOCS.map((doc: string) => (
                  <p key={doc} className="text-[11px] font-mono text-white/30">{doc}</p>
                ))}
              </div>
            </details>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <DkButton size="sm" variant="primary" onClick={handleSave}>
              Save Template
            </DkButton>
          </div>
        </div>
      </div>
```

Add the required constants near the top of the file (after imports, before component):

```tsx
const NAMING_PRESETS = [
  { id: 'standard', label: 'Standard', template: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}' },
  { id: 'simple',   label: 'Simple',   template: '{Title}/{OriginalName}.{ext}' },
]

const TOKEN_DOCS = [
  '{Title}        — Clean game title (e.g. "Stellar Blade")',
  '{CleanTitle}   — cleanGameTitle() fallback',
  '{Year}        — Release year (e.g. "2024")',
  '{Edition}     — Edition tag (e.g. "GOTY Edition")',
  '{Platform}    — Platform hint (e.g. "PC", "Multi")',
  '{ReleaseGroup}— Scene release group (e.g. "ElAmigos")',
  '{Version}     — Version number (e.g. "1.03")',
  '{OriginalName}— Raw download folder name',
  '{MediaType}   — "ISO", "PC", or "Update"',
  '{ext}         — File extension (auto-filled)',
]
```

Add state near the top of the `DownloadsSection` component (after existing `useState` calls):

```tsx
  const [autoOrganizeEnabled, setAutoOrganizeEnabled] = useState(false)
  const [namingTemplate, setNamingTemplate] = useState(NAMING_PRESETS[0].template)
  const [presetId, setPresetId] = useState('standard')
```

Add a `handleSaveOrganizer` function after the existing `handleSave`:

```tsx
  const handleSaveOrganizer = async () => {
    if (!user) return
    await saveConfig({
      ...dlConfig,
      userId: user.id,
      autoOrganizeEnabled,
      namingTemplate: namingTemplate || null,
    } as any)
  }
```

Update the `handleSaveOrganizer` reference in the Organizer section's "Save Template" button to call `handleSaveOrganizer`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/settings/sections/downloads.tsx
git commit -m "feat(settings): add Organizer section to Downloads page"
```

---

### Task 4: Verify build compiles

**Files:** None

- [ ] **Step 1: TypeScript check**

Run: `rtk tsc` from `frontend/` directory.
Expected: no type errors.

- [ ] **Step 2: Commit any fixes**

If there are type issues, fix them, then commit.
