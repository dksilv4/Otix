# Game Scanner Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Game Scanner from admin test page (`/admin/desktop`) into the Library as a "Local Games" tab with fully redesigned UI matching the app's design language.

**Architecture:** New `features/game-scanner/` directory with molecules (card, grid, progress, filters, empty state, directory manager) and organisms (tab content, ISO installer modal, ISO organizer modal). Integrated as a library tab — no new route. Electron-only (tab hidden in browser).

**Tech Stack:** React 19, TypeScript, TanStack React Query, Framer Motion, Tailwind CSS, dk-ui design system

---

## File Structure

```
features/game-scanner/              (all new)
  index.ts
  types.ts
  storage.ts
  queries.ts
  molecules/
    game-card.tsx
    game-grid.tsx
    directory-manager.tsx
    scan-progress.tsx
    platform-filter.tsx
    empty-state.tsx
  organisms/
    game-scanner-tab.tsx
    iso-installer-modal.tsx
    iso-organizer-modal.tsx

Modify:
  frontend/src/features/library/library-queries.ts    (add "local-games" tab)
  frontend/src/features/library/library-page.tsx       (add conditional tab + render)
  frontend/src/lib/router.tsx                           (redirect + auto-redirect fix)
  frontend/src/features/admin/organisms/admin-home-page.tsx  (remove Game Scanner card)
  frontend/src/features/experiments/desktop-scanner.tsx       (replace with re-export)
```

---

### Task 1: Create types and storage layer

**Files:**
- Create: `frontend/src/features/game-scanner/types.ts`
- Create: `frontend/src/features/game-scanner/storage.ts`

- [ ] **Step 1: Write types.ts**

```typescript
// frontend/src/features/game-scanner/types.ts

export interface UpdateFile {
  name: string;
  path: string;
}

export interface DetectedGame {
  id: string;
  title: string;
  exePath: string;
  localExePath?: string;
  installDir: string;
  platform: "steam" | "pc" | "iso";
  iconUrl?: string;
  updateFiles?: UpdateFile[];
  otixMediaId?: string;
  otixMediaTitle?: string;
  otixMediaSlug?: string;
  otixConfidence?: number;
}

export interface MountResult {
  driveLetter: string;
  setupPath?: string;
  crackPath?: string;
  crackName?: string;
}

export interface OrganizationPreviewItem {
  sourcePath: string;
  sourceFilename: string;
  type: "iso" | "update";
  matched: boolean;
  extracted: Record<string, string>;
  targetPath: string;
}

export interface OrgExecutionResult {
  sourcePath: string;
  targetPath: string;
  success: boolean;
  error?: string;
}

export interface AnalyzedUpdate {
  file: UpdateFile;
  from?: string;
  to: string;
  cleanName: string;
  isDuplicate: boolean;
  isGapBefore: boolean;
  gapVersion?: string;
}

export type Platform = "all" | "steam" | "pc" | "iso";

export type InstallerStep = 1 | 2 | 3 | 4;

export type OrgPreset = "scene" | "simple" | "custom";

export const ORG_PRESETS: Record<
  OrgPreset,
  {
    label: string;
    regex: string;
    isoTemplate: string;
    updateTemplate: string;
  }
> = {
  scene: {
    label: "Scene Standard",
    regex:
      "^(?<title>.+?)\\.v(?<version>\\d+(?:\\.\\d+)*)[.-](?<group>\\w+)\\.(?<ext>.+)$",
    isoTemplate: "{title}/{title}.v{version}-{group}.{ext}",
    updateTemplate: "{title}/Updates/{title} update v{version}.{ext}",
  },
  simple: {
    label: "Simple Naming",
    regex: "^(?<title>.+?)\\s+v?(?<version>\\d+(?:\\.\\d+)*)\\.(?<ext>.+)$",
    isoTemplate: "{title}/{title} v{version}.{ext}",
    updateTemplate: "{title}/Updates/{title} update v{version}.{ext}",
  },
  custom: {
    label: "Custom Regex",
    regex: "(?<title>.+)",
    isoTemplate: "{title}/{filename}",
    updateTemplate: "Updates/{filename}",
  },
};

export const STORAGE_KEYS = {
  PATHS: "otix_scanner_paths",
  ISO_PATHS: "otix_scanner_iso_paths",
  GAMES: "otix_scanned_games",
  LOCAL_MAP: "otix_local_games_map",
} as const;
```

- [ ] **Step 2: Write storage.ts**

```typescript
// frontend/src/features/game-scanner/storage.ts
import type { DetectedGame } from "./types";
import { STORAGE_KEYS } from "./types";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getScanPaths(): string[] {
  return readJson<string[]>(STORAGE_KEYS.PATHS, []);
}

export function setScanPaths(paths: string[]): void {
  writeJson(STORAGE_KEYS.PATHS, paths);
}

export function getIsoPaths(): string[] {
  return readJson<string[]>(STORAGE_KEYS.ISO_PATHS, []);
}

export function setIsoPaths(paths: string[]): void {
  writeJson(STORAGE_KEYS.ISO_PATHS, paths);
}

export function getScannedGames(): DetectedGame[] {
  return readJson<DetectedGame[]>(STORAGE_KEYS.GAMES, []);
}

export function setScannedGames(games: DetectedGame[]): void {
  writeJson(STORAGE_KEYS.GAMES, games);
}

export function getLocalGamesMap(): Record<string, DetectedGame> {
  return readJson<Record<string, DetectedGame>>(STORAGE_KEYS.LOCAL_MAP, {});
}

export function setLocalGamesMapEntry(
  mediaId: string,
  game: DetectedGame | null,
): void {
  const map = getLocalGamesMap();
  if (game) {
    map[mediaId] = game;
  } else {
    delete map[mediaId];
  }
  writeJson(STORAGE_KEYS.LOCAL_MAP, map);
}

export function hasElectronAPI(): boolean {
  return (
    typeof window !== "undefined" && !!(window as any).electronAPI
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/game-scanner/types.ts frontend/src/features/game-scanner/storage.ts
git commit -m "feat(game-scanner): add types and storage layer"
```

---

### Task 2: Create queries hook

**Files:**
- Create: `frontend/src/features/game-scanner/queries.ts`

- [ ] **Step 1: Write queries.ts**

```typescript
// frontend/src/features/game-scanner/queries.ts
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { DetectedGame } from "./types";

interface MatchResult {
  queryTitle: string;
  matchedMedia: {
    id: string;
    title: string;
    slug: string;
  } | null;
  confidence: number;
}

interface MatchResponse {
  matches: MatchResult[];
}

export function useMatchLocalGames() {
  return useMutation({
    mutationFn: async (games: DetectedGame[]): Promise<DetectedGame[]> => {
      const unmatched = games.filter((g) => !g.otixMediaId);
      if (unmatched.length === 0) return games;

      const titles = unmatched.map((g) => g.title);
      const { data } = await apiClient.post<MatchResponse>(
        "/media/match-local-games",
        { titles },
      );

      const matchMap = new Map(
        data.matches.map((m) => [m.queryTitle, m]),
      );

      return games.map((game) => {
        const match = matchMap.get(game.title);
        if (match && match.matchedMedia) {
          return {
            ...game,
            otixMediaId: match.matchedMedia.id,
            otixMediaTitle: match.matchedMedia.title,
            otixMediaSlug: match.matchedMedia.slug,
            otixConfidence: match.confidence,
          };
        }
        return game;
      });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/game-scanner/queries.ts
git commit -m "feat(game-scanner): add match-local-games query hook"
```

---

### Task 3: Create empty-state component

**Files:**
- Create: `frontend/src/features/game-scanner/molecules/empty-state.tsx`

- [ ] **Step 1: Write empty-state.tsx**

```typescript
// frontend/src/features/game-scanner/molecules/empty-state.tsx
import { Gamepad2, FolderPlus, SearchX } from "lucide-react";

interface EmptyStateProps {
  variant: "no-dirs" | "no-games" | "no-results";
  onAddGameDir?: () => void;
  onAddIsoDir?: () => void;
  onClearFilters?: () => void;
}

export function EmptyState({
  variant,
  onAddGameDir,
  onAddIsoDir,
  onClearFilters,
}: EmptyStateProps) {
  if (variant === "no-dirs") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
          <Gamepad2 className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          No folders added
        </h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Add your game directories to scan for installed PC games.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onAddGameDir}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition-all hover:bg-primary/90 active:scale-[0.97]"
          >
            <FolderPlus className="h-4 w-4" />
            Add Game Folder
          </button>
          <button
            onClick={onAddIsoDir}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--dk-surface-glass)] px-4 py-2.5 text-sm font-semibold text-foreground backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.97]"
          >
            <FolderPlus className="h-4 w-4" />
            Add ISO Folder
          </button>
        </div>
      </div>
    );
  }

  if (variant === "no-games") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
          <Gamepad2 className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          No games found
        </h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          No games were found in your selected folders. Add more folders or
          check your scan paths.
        </p>
      </div>
    );
  }

  // no-results
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
        <SearchX className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">
        No games match your search
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Try adjusting your search or platform filters.
      </p>
      {onClearFilters && (
        <button
          onClick={onClearFilters}
          className="mt-4 rounded-xl px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 active:scale-[0.97]"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/game-scanner/molecules/empty-state.tsx
git commit -m "feat(game-scanner): add empty-state component"
```

---

### Task 4: Create game-card component

**Files:**
- Create: `frontend/src/features/game-scanner/molecules/game-card.tsx`

- [ ] **Step 1: Write game-card.tsx**

```typescript
// frontend/src/features/game-scanner/molecules/game-card.tsx
import { useState } from "react";
import { Play, Gamepad2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { DkBadge } from "@/features/dk-ui/atoms/badge";
import type { DetectedGame } from "../types";
import { GameLinker } from "@/features/game-detector/game-linker";
import { hasElectronAPI } from "../storage";

const PLATFORM_VARIANTS: Record<
  string,
  { variant: "default" | "success" | "warning"; label: string }
> = {
  steam: { variant: "default", label: "Steam" },
  pc: { variant: "success", label: "PC" },
  iso: { variant: "warning", label: "ISO" },
};

interface GameCardProps {
  game: DetectedGame;
  index: number;
}

export function GameCard({ game, index }: GameCardProps) {
  const [imgError, setImgError] = useState(false);
  const platformMeta = PLATFORM_VARIANTS[game.platform] ?? PLATFORM_VARIANTS.pc;

  const handlePlay = async () => {
    if (hasElectronAPI()) {
      try {
        await (window as any).electronAPI.launchGame(game);
      } catch (err) {
        console.error("Failed to launch game:", err);
      }
    }
  };

  const handleInstall = async () => {
    // handled by parent via callback or event — placeholder
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.05,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="group flex items-center gap-4 rounded-2xl bg-[var(--dk-surface-base)] p-4 shadow-[var(--dk-shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--dk-shadow-md)]"
    >
      {/* Game Icon */}
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--dk-surface-glass)]">
        {game.iconUrl && !imgError ? (
          <img
            src={game.iconUrl}
            alt=""
            className="h-full w-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <Gamepad2 className="h-6 w-6 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {game.title}
          </h3>
          <DkBadge variant={platformMeta.variant} size="sm">
            {platformMeta.label}
          </DkBadge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {game.installDir}
        </p>

        {/* Match status */}
        {game.otixMediaId ? (
          <Link
            to="/media/game/$mediaId"
            params={{ mediaId: game.otixMediaId, mediaType: "game" }}
            className="mt-1 inline-flex items-center gap-1 text-xs text-green-400 hover:underline"
          >
            <CheckCircle2 className="h-3 w-3" />
            {game.otixMediaTitle ?? "Matched"}{" "}
            {game.otixConfidence != null &&
              `· ${Math.round(game.otixConfidence * 100)}%`}
          </Link>
        ) : (
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Not linked
            <GameLinker
              game={game}
              onLink={() => {}}
              onUnlink={() => {}}
            />
          </div>
        )}
      </div>

      {/* Action */}
      <div className="flex-shrink-0">
        {game.platform === "iso" ? (
          <button
            onClick={handleInstall}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--dk-surface-glass)] px-3 py-2 text-xs font-semibold text-foreground backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.97]"
          >
            <Play className="h-3.5 w-3.5" />
            Install
          </button>
        ) : (
          <button
            onClick={handlePlay}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-400 active:scale-95"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Play
          </button>
        )}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/game-scanner/molecules/game-card.tsx
git commit -m "feat(game-scanner): add game-card component"
```

---

### Task 5: Create game-grid component

**Files:**
- Create: `frontend/src/features/game-scanner/molecules/game-grid.tsx`

- [ ] **Step 1: Write game-grid.tsx**

```typescript
// frontend/src/features/game-scanner/molecules/game-grid.tsx
import { AnimatePresence } from "framer-motion";
import { GameCard } from "./game-card";
import type { DetectedGame } from "../types";

interface GameGridProps {
  games: DetectedGame[];
  onLinkGame: (gameId: string, mediaId: string, title: string, slug: string) => void;
  onUnlinkGame: (gameId: string) => void;
}

export function GameGrid({ games, onLinkGame, onUnlinkGame }: GameGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <AnimatePresence mode="popLayout">
        {games.map((game, i) => (
          <GameCard
            key={game.id}
            game={game}
            index={i}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/game-scanner/molecules/game-grid.tsx
git commit -m "feat(game-scanner): add game-grid component"
```

---

### Task 6: Create directory-manager component

**Files:**
- Create: `frontend/src/features/game-scanner/molecules/directory-manager.tsx`

- [ ] **Step 1: Write directory-manager.tsx**

```typescript
// frontend/src/features/game-scanner/molecules/directory-manager.tsx
import { useState } from "react";
import {
  Folder,
  FolderPlus,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DirectoryManagerProps {
  gamePaths: string[];
  isoPaths: string[];
  onAddGameDir: () => void;
  onRemoveGameDir: (path: string) => void;
  onAddIsoDir: () => void;
  onRemoveIsoDir: (path: string) => void;
}

export function DirectoryManager({
  gamePaths,
  isoPaths,
  onAddGameDir,
  onRemoveGameDir,
  onAddIsoDir,
  onRemoveIsoDir,
}: DirectoryManagerProps) {
  const [isOpen, setIsOpen] = useState(
    gamePaths.length === 0 && isoPaths.length === 0,
  );

  const hasPaths = gamePaths.length > 0 || isoPaths.length > 0;

  return (
    <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <Folder className="h-4 w-4" />
          Scan Directories
          {hasPaths && (
            <span className="rounded-full bg-[var(--dk-surface-glass)] px-2 py-0.5 text-xs">
              {gamePaths.length + isoPaths.length}
            </span>
          )}
        </span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-4">
              {/* Game directories */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Game Folders
                </p>
                <div className="space-y-1.5">
                  {gamePaths.length === 0 && (
                    <p className="text-xs text-muted-foreground/50">
                      No game folders added
                    </p>
                  )}
                  {gamePaths.map((p) => (
                    <div
                      key={p}
                      className="flex items-center gap-2 rounded-lg bg-[var(--dk-surface-glass)] px-3 py-2"
                    >
                      <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground font-mono">
                        {p}
                      </span>
                      <button
                        onClick={() => onRemoveGameDir(p)}
                        className="flex-shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-destructive active:scale-90"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={onAddGameDir}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80 active:scale-[0.97]"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Add Game Folder
                </button>
              </div>

              {/* ISO directories */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  ISO Folders
                </p>
                <div className="space-y-1.5">
                  {isoPaths.length === 0 && (
                    <p className="text-xs text-muted-foreground/50">
                      No ISO folders added
                    </p>
                  )}
                  {isoPaths.map((p) => (
                    <div
                      key={p}
                      className="flex items-center gap-2 rounded-lg bg-[var(--dk-surface-glass)] px-3 py-2"
                    >
                      <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground font-mono">
                        {p}
                      </span>
                      <button
                        onClick={() => onRemoveIsoDir(p)}
                        className="flex-shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-destructive active:scale-90"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={onAddIsoDir}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80 active:scale-[0.97]"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Add ISO Folder
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/game-scanner/molecules/directory-manager.tsx
git commit -m "feat(game-scanner): add directory-manager component"
```

---

### Task 7: Create scan-progress component

**Files:**
- Create: `frontend/src/features/game-scanner/molecules/scan-progress.tsx`

- [ ] **Step 1: Write scan-progress.tsx**

```typescript
// frontend/src/features/game-scanner/molecules/scan-progress.tsx
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface ScanProgressProps {
  currentDir: string;
  progress: number;
  foundCount: number;
}

export function ScanProgress({
  currentDir,
  progress,
  foundCount,
}: ScanProgressProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>

      <h3 className="text-lg font-semibold text-foreground">
        Scanning for games...
      </h3>

      <p className="mt-1 max-w-md truncate text-sm text-muted-foreground font-mono">
        {currentDir}
      </p>

      {/* Progress bar */}
      <div className="mt-4 h-1.5 w-64 overflow-hidden rounded-full bg-[var(--dk-surface-glass)]">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(progress, 100)}%` }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <p className="mt-3 text-sm font-medium text-muted-foreground">
        Found {foundCount} game{foundCount !== 1 ? "s" : ""} so far...
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/game-scanner/molecules/scan-progress.tsx
git commit -m "feat(game-scanner): add scan-progress component"
```

---

### Task 8: Create platform-filter component

**Files:**
- Create: `frontend/src/features/game-scanner/molecules/platform-filter.tsx`

- [ ] **Step 1: Write platform-filter.tsx**

```typescript
// frontend/src/features/game-scanner/molecules/platform-filter.tsx
import { cn } from "@/lib/utils";
import type { Platform } from "../types";

const FILTERS: { value: Platform; label: string }[] = [
  { value: "all", label: "All" },
  { value: "steam", label: "Steam" },
  { value: "pc", label: "PC" },
  { value: "iso", label: "ISO" },
];

interface PlatformFilterProps {
  value: Platform;
  onChange: (platform: Platform) => void;
  counts: Record<Platform, number>;
}

export function PlatformFilter({ value, onChange, counts }: PlatformFilterProps) {
  return (
    <div className="flex gap-2">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 whitespace-nowrap",
            value === f.value
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]",
          )}
        >
          {f.label}
          <span className="text-xs opacity-60 tabular-nums">
            {counts[f.value] ?? 0}
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/game-scanner/molecules/platform-filter.tsx
git commit -m "feat(game-scanner): add platform-filter component"
```

---

### Task 9: Create game-scanner-tab organism

**Files:**
- Create: `frontend/src/features/game-scanner/organisms/game-scanner-tab.tsx`
- Create: `frontend/src/features/game-scanner/index.ts`

- [ ] **Step 1: Write game-scanner-tab.tsx**

```typescript
// frontend/src/features/game-scanner/organisms/game-scanner-tab.tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, RefreshCw, Disc } from "lucide-react";
import { GameGrid } from "../molecules/game-grid";
import { DirectoryManager } from "../molecules/directory-manager";
import { ScanProgress } from "../molecules/scan-progress";
import { PlatformFilter } from "../molecules/platform-filter";
import { EmptyState } from "../molecules/empty-state";
import { IsoInstallerModal } from "./iso-installer-modal";
import { IsoOrganizerModal } from "./iso-organizer-modal";
import { useMatchLocalGames } from "../queries";
import {
  getScanPaths,
  setScanPaths,
  getIsoPaths,
  setIsoPaths,
  getScannedGames,
  setScannedGames,
  getLocalGamesMap,
  setLocalGamesMapEntry,
  hasElectronAPI,
} from "../storage";
import type { DetectedGame, Platform } from "../types";

export function GameScannerTab() {
  // Directories
  const [gamePaths, setGamePaths] = useState<string[]>(getScanPaths);
  const [isoPaths, setIsoPathsState] = useState<string[]>(getIsoPaths);

  // Games
  const [games, setGames] = useState<DetectedGame[]>(getScannedGames);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{
    currentDir: string;
    progress: number;
  } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<Platform>("all");

  // Modals
  const [installerOpen, setInstallerOpen] = useState(false);
  const [organizerOpen, setOrganizerOpen] = useState(false);

  // Mutations
  const matchMutation = useMatchLocalGames();

  // Persist
  useEffect(() => {
    setScanPaths(gamePaths);
  }, [gamePaths]);

  useEffect(() => {
    setIsoPaths(isoPaths);
  }, [isoPaths]);

  useEffect(() => {
    setScannedGames(games);

    // Sync to electron game detector
    if (hasElectronAPI() && games.length > 0) {
      (window as any).electronAPI.setLibrary(games);
    }
  }, [games]);

  // Sync to electron on first mount for localStorage-restored games
  useEffect(() => {
    if (hasElectronAPI() && games.length > 0) {
      (window as any).electronAPI.setLibrary(games);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Directory pickers
  const handleAddGameDir = useCallback(async () => {
    if (hasElectronAPI()) {
      try {
        const dir = await (window as any).electronAPI.selectDirectory();
        if (dir && !gamePaths.includes(dir)) {
          setGamePaths((prev) => [...prev, dir]);
        }
      } catch (err) {
        console.error("Failed to select directory:", err);
      }
    }
  }, [gamePaths]);

  const handleAddIsoDir = useCallback(async () => {
    if (hasElectronAPI()) {
      try {
        const dir = await (window as any).electronAPI.selectDirectory();
        if (dir && !isoPaths.includes(dir)) {
          setIsoPathsState((prev) => [...prev, dir]);
        }
      } catch (err) {
        console.error("Failed to select directory:", err);
      }
    }
  }, [isoPaths]);

  // Scan
  const handleScan = useCallback(async () => {
    if (gamePaths.length === 0 && isoPaths.length === 0) return;

    setScanning(true);
    setScanProgress({ currentDir: "Starting scan...", progress: 0 });

    try {
      let scannedGames: DetectedGame[] = [];

      if (hasElectronAPI()) {
        const api = (window as any).electronAPI;

        // Subscribe to progress
        const unsub = api.onScannerProgress(
          (evt: { currentDir: string; progress: number }) => {
            setScanProgress({
              currentDir: evt.currentDir,
              progress: evt.progress,
            });
          },
        );

        scannedGames = await api.scanPaths(gamePaths, isoPaths);
        unsub();
      }

      // Match against Otix catalog
      if (scannedGames.length > 0) {
        const matched = await matchMutation.mutateAsync(scannedGames);
        setGames(matched);
      } else {
        setGames([]);
      }
    } catch (err) {
      console.error("Scan failed:", err);
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  }, [gamePaths, isoPaths, matchMutation]);

  // Filtered games
  const filteredGames = useMemo(() => {
    let result = games;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.installDir.toLowerCase().includes(q),
      );
    }

    if (platformFilter !== "all") {
      result = result.filter((g) => g.platform === platformFilter);
    }

    return result;
  }, [games, searchQuery, platformFilter]);

  // Platform counts
  const platformCounts = useMemo(() => {
    const counts: Record<Platform, number> = {
      all: games.length,
      steam: 0,
      pc: 0,
      iso: 0,
    };
    for (const g of games) {
      if (counts[g.platform] !== undefined) {
        counts[g.platform]++;
      }
    }
    return counts;
  }, [games]);

  // Link/unlink handlers
  const handleLinkGame = useCallback(
    (gameId: string, mediaId: string, title: string, slug: string) => {
      setGames((prev) =>
        prev.map((g) =>
          g.id === gameId
            ? {
                ...g,
                otixMediaId: mediaId,
                otixMediaTitle: title,
                otixMediaSlug: slug,
                otixConfidence: 1,
              }
            : g,
        ),
      );
      const game = games.find((g) => g.id === gameId);
      if (game) {
        setLocalGamesMapEntry(mediaId, { ...game, otixMediaId: mediaId, otixMediaTitle: title, otixMediaSlug: slug, otixConfidence: 1 });
      }
    },
    [games],
  );

  const handleUnlinkGame = useCallback(
    (gameId: string) => {
      setGames((prev) =>
        prev.map((g) =>
          g.id === gameId
            ? {
                ...g,
                otixMediaId: undefined,
                otixMediaTitle: undefined,
                otixMediaSlug: undefined,
                otixConfidence: undefined,
              }
            : g,
        ),
      );
    },
    [],
  );

  // Clear filters
  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setPlatformFilter("all");
  }, []);

  // Determine what to render
  const hasDirs = gamePaths.length > 0 || isoPaths.length > 0;
  const hasGames = games.length > 0;
  const hasFilteredGames = filteredGames.length > 0;

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      {hasGames && !scanning && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-[var(--dk-surface-base)] px-5 py-3 shadow-[var(--dk-shadow-sm)]">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums">{games.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Games
              </p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums text-green-400">
                {games.filter((g) => g.otixMediaId).length}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Matched
              </p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums">
                {new Set(games.map((g) => g.platform)).size}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Platforms
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleScan}
              disabled={matchMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--dk-surface-glass)] px-4 py-2 text-sm font-semibold text-foreground backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.97] disabled:opacity-40"
            >
              <RefreshCw
                className={`h-4 w-4 ${matchMutation.isPending ? "animate-spin" : ""}`}
              />
              Scan Now
            </button>
            <button
              onClick={() => setInstallerOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--dk-surface-glass)] px-4 py-2 text-sm font-semibold text-foreground backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.97]"
            >
              <Disc className="h-4 w-4" />
              Install ISO
            </button>
          </div>
        </div>
      )}

      {/* Directory manager */}
      <DirectoryManager
        gamePaths={gamePaths}
        isoPaths={isoPaths}
        onAddGameDir={handleAddGameDir}
        onRemoveGameDir={(p) => {
          setGamePaths((prev) => prev.filter((x) => x !== p));
          setGames((prev) => prev.filter((g) => !g.installDir.startsWith(p)));
        }}
        onAddIsoDir={handleAddIsoDir}
        onRemoveIsoDir={(p) => {
          setIsoPathsState((prev) => prev.filter((x) => x !== p));
        }}
      />

      {/* Scanning state */}
      {scanning && scanProgress && (
        <ScanProgress
          currentDir={scanProgress.currentDir}
          progress={scanProgress.progress}
          foundCount={games.length}
        />
      )}

      {/* Content area */}
      {!scanning && !hasDirs && <EmptyState variant="no-dirs" onAddGameDir={handleAddGameDir} onAddIsoDir={handleAddIsoDir} />}

      {!scanning && hasDirs && !hasGames && (
        <div className="space-y-4">
          <button
            onClick={handleScan}
            disabled={matchMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition-all hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
          >
            <RefreshCw
              className={`h-4 w-4 ${matchMutation.isPending ? "animate-spin" : ""}`}
            />
            Scan for Games
          </button>
          <EmptyState variant="no-games" />
        </div>
      )}

      {!scanning && hasGames && (
        <>
          {/* Search + Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Search games..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 w-full rounded-xl bg-[var(--dk-surface-glass)] pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)] focus:ring-offset-1"
              />
            </div>
            <PlatformFilter
              value={platformFilter}
              onChange={setPlatformFilter}
              counts={platformCounts}
            />
          </div>

          {/* Game grid or no-results */}
          {hasFilteredGames ? (
            <GameGrid
              games={filteredGames}
              onLinkGame={handleLinkGame}
              onUnlinkGame={handleUnlinkGame}
            />
          ) : (
            <EmptyState
              variant="no-results"
              onClearFilters={handleClearFilters}
            />
          )}
        </>
      )}

      {/* Modals */}
      <IsoInstallerModal
        open={installerOpen}
        onClose={() => setInstallerOpen(false)}
        games={games}
      />

      <IsoOrganizerModal
        open={organizerOpen}
        onClose={() => setOrganizerOpen(false)}
        isoPaths={isoPaths}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write index.ts**

```typescript
// frontend/src/features/game-scanner/index.ts
export { GameScannerTab } from "./organisms/game-scanner-tab";
export { IsoInstallerModal } from "./organisms/iso-installer-modal";
export { IsoOrganizerModal } from "./organisms/iso-organizer-modal";
export type { DetectedGame, MountResult } from "./types";
export { hasElectronAPI } from "./storage";
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/game-scanner/organisms/game-scanner-tab.tsx frontend/src/features/game-scanner/index.ts
git commit -m "feat(game-scanner): add game-scanner-tab organism and index"
```

---

### Task 10: Create iso-installer-modal organism

**Files:**
- Create: `frontend/src/features/game-scanner/organisms/iso-installer-modal.tsx`

- [ ] **Step 1: Write iso-installer-modal.tsx**

```typescript
// frontend/src/features/game-scanner/organisms/iso-installer-modal.tsx
import { useState, useCallback, useEffect } from "react";
import {
  X,
  Disc,
  HardDrive,
  Play,
  CheckCircle2,
  Lock,
  FolderOpen,
  SkipForward,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { DkBadge } from "@/features/dk-ui/atoms/badge";
import { DkButton } from "@/features/dk-ui/atoms/button";
import { hasElectronAPI } from "../storage";
import type {
  DetectedGame,
  MountResult,
  InstallerStep,
  UpdateFile,
  AnalyzedUpdate,
} from "../types";

function parseUpdateVersion(filename: string): {
  from?: string;
  to: string;
  cleanName: string;
} {
  const name = filename.replace(/\.exe$/i, "").trim();
  const rangeMatch = name.match(
    /(?:update|patch)\s+([vV]?\d+(?:\.\d+)*)\s*[-➔toTo]+\s*([vV]?\d+(?:\.\d+)*)/i,
  );
  if (rangeMatch) {
    const from = rangeMatch[1];
    const to = rangeMatch[2];
    const matchIdx = name.indexOf(rangeMatch[0]);
    let clean = name
      .substring(0, matchIdx)
      .trim()
      .replace(/[-_\s]+$/, "")
      .trim();
    return { from, to, cleanName: clean || "Update" };
  }

  const singleMatch = name.match(
    /(?:update|patch)\s+([vV]?\d+(?:\.\d+)*)/i,
  );
  if (singleMatch) {
    const to = singleMatch[1];
    const matchIdx = name.indexOf(singleMatch[0]);
    let clean = name
      .substring(0, matchIdx)
      .trim()
      .replace(/[-_\s]+$/, "")
      .trim();
    return { to, cleanName: clean || "Update" };
  }

  return { to: name, cleanName: "Update" };
}

function analyzeUpdates(updateFiles: UpdateFile[]): AnalyzedUpdate[] {
  const seenTargets = new Set<string>();
  const parsed = updateFiles
    .map((file) => {
      const parsed = parseUpdateVersion(file.name);
      return {
        file,
        ...parsed,
        isDuplicate: false,
        isGapBefore: false,
        gapVersion: undefined as string | undefined,
      };
    })
    .sort((a, b) =>
      a.to.localeCompare(b.to, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

  for (let i = 0; i < parsed.length; i++) {
    const current = parsed[i];
    if (seenTargets.has(current.to.toLowerCase())) {
      current.isDuplicate = true;
    } else {
      seenTargets.add(current.to.toLowerCase());
    }

    if (i > 0 && current.from) {
      let prev = null;
      for (let j = i - 1; j >= 0; j--) {
        if (!parsed[j].isDuplicate) {
          prev = parsed[j];
          break;
        }
      }
      if (prev && prev.to.toLowerCase() !== current.from.toLowerCase()) {
        current.isGapBefore = true;
        current.gapVersion = `${prev.to} to ${current.from}`;
      }
    }
  }

  return parsed;
}

interface IsoInstallerModalProps {
  open: boolean;
  onClose: () => void;
  games: DetectedGame[];
}

const STEP_LABELS: { step: InstallerStep; label: string }[] = [
  { step: 1, label: "Select & Mount" },
  { step: 2, label: "Run Setup" },
  { step: 3, label: "Apply Crack" },
  { step: 4, label: "Finish" },
];

export function IsoInstallerModal({
  open,
  onClose,
  games,
}: IsoInstallerModalProps) {
  const [step, setStep] = useState<InstallerStep>(1);
  const [isoPath, setIsoPath] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [mountResult, setMountResult] = useState<MountResult | null>(null);
  const [mounting, setMounting] = useState(false);
  const [runningSetup, setRunningSetup] = useState(false);
  const [copyingCrack, setCopyingCrack] = useState(false);
  const [dismounting, setDismounting] = useState(false);
  const [currentUpdates, setCurrentUpdates] = useState<UpdateFile[]>([]);
  const [completedUpdates, setCompletedUpdates] = useState<
    Record<string, boolean>
  >({});
  const [installQueue, setInstallQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isoGames = games.filter((g) => g.platform === "iso");

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setIsoPath("");
      setTargetDir("");
      setMountResult(null);
      setError(null);
      setCurrentUpdates([]);
      setCompletedUpdates({});
    }
  }, [open]);

  // Load updates when ISO is selected
  useEffect(() => {
    setCompletedUpdates({});
    setCurrentUpdates([]);
    if (isoPath && hasElectronAPI()) {
      const scannedGame = games.find((g) => g.exePath === isoPath);
      if (scannedGame?.updateFiles) {
        setCurrentUpdates(scannedGame.updateFiles);
      } else {
        (window as any).electronAPI
          .getUpdatesForIso(isoPath)
          .then((files: UpdateFile[]) => setCurrentUpdates(files))
          .catch(() => {});
      }
    }
  }, [isoPath, games]);

  // Handlers
  const handleSelectIso = useCallback(async () => {
    if (hasElectronAPI()) {
      try {
        const selected = await (window as any).electronAPI.selectIso();
        if (selected) setIsoPath(selected);
      } catch {
        setError("Failed to select ISO file");
      }
    }
  }, []);

  const handleMount = useCallback(async () => {
    if (!isoPath) return;
    setMounting(true);
    setError(null);
    try {
      if (hasElectronAPI()) {
        const result = await (window as any).electronAPI.mountIso(isoPath);
        setMountResult(result);
        setStep(2);

        if (result.setupPath) {
          setTimeout(async () => {
            try {
              await (window as any).electronAPI.launchSetup(result.setupPath!);
            } catch {
              // setup auto-launch is best-effort
            }
          }, 600);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to mount ISO");
    } finally {
      setMounting(false);
    }
  }, [isoPath]);

  const handleRunSetup = useCallback(async () => {
    if (!mountResult?.setupPath) return;
    setRunningSetup(true);
    try {
      await (window as any).electronAPI.launchSetup(mountResult.setupPath);
    } catch {
      setError("Failed to launch setup");
    } finally {
      setRunningSetup(false);
    }
  }, [mountResult]);

  const handleSelectTargetDir = useCallback(async () => {
    if (hasElectronAPI()) {
      try {
        const dir = await (window as any).electronAPI.selectDirectory();
        if (dir) setTargetDir(dir);
      } catch {
        setError("Failed to select install directory");
      }
    }
  }, []);

  const handleApplyCrack = useCallback(async () => {
    if (!mountResult?.crackPath || !targetDir) return;
    setCopyingCrack(true);
    setError(null);
    try {
      await (window as any).electronAPI.applyCrack(
        mountResult.crackPath,
        targetDir,
      );
      setStep(4);
    } catch {
      setError("Failed to apply crack");
    } finally {
      setCopyingCrack(false);
    }
  }, [mountResult, targetDir]);

  const handleDismount = useCallback(async () => {
    setDismounting(true);
    try {
      if (hasElectronAPI()) {
        await (window as any).electronAPI.dismountIso(isoPath);
      }
      // Advance queue if batch
      const nextIdx = queueIndex + 1;
      if (nextIdx < installQueue.length) {
        setQueueIndex(nextIdx);
        setIsoPath(installQueue[nextIdx]);
        setTargetDir("");
        setMountResult(null);
        setStep(1);
        setCompletedUpdates({});
      } else {
        onClose();
      }
    } catch {
      setError("Failed to dismount ISO");
    } finally {
      setDismounting(false);
    }
  }, [isoPath, queueIndex, installQueue, onClose]);

  const updates = currentUpdates.length > 0 ? analyzeUpdates(currentUpdates) : [];

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-[2rem] bg-[var(--dk-surface-overlay)] shadow-[var(--dk-shadow-dialog)] backdrop-blur-xl ring-1 ring-white/[0.04]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.04] px-6 py-4">
            <div className="flex items-center gap-3">
              <Disc className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">
                Install from ISO
              </h2>
              {installQueue.length > 0 && (
                <DkBadge variant="muted" size="sm">
                  {installQueue.length - queueIndex} remaining
                </DkBadge>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-[var(--dk-surface-glass)] hover:text-foreground active:scale-90"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-1 px-6 py-4">
            {STEP_LABELS.map((s, i) => (
              <div key={s.step} className="flex items-center gap-1">
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    step === s.step &&
                      "bg-primary/15 text-primary",
                    step > s.step &&
                      "bg-green-500/10 text-green-400",
                    step < s.step &&
                      "text-muted-foreground/40",
                  )}
                >
                  {step > s.step ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current text-[10px] font-bold text-white">
                      {s.step}
                    </span>
                  )}
                  {s.label}
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="max-h-[50vh] overflow-y-auto px-6 py-4">
            {/* Error */}
            {error && (
              <div className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
                <button
                  onClick={() => setError(null)}
                  className="ml-2 underline hover:no-underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Step 1: Select & Mount */}
            {step === 1 && (
              <div className="space-y-6">
                <button
                  onClick={handleSelectIso}
                  className="flex w-full items-center gap-4 rounded-2xl bg-[var(--dk-surface-glass)] p-4 text-left transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.99]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <Disc className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {isoPath
                        ? isoPath.split(/[\\/]/).pop()
                        : "Select ISO file"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isoPath || "Choose a disk image to install from"}
                    </p>
                  </div>
                  <FolderOpen className="h-5 w-5 text-muted-foreground" />
                </button>

                {/* Scanned ISO quick-select */}
                {isoGames.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Scanned ISOs
                    </p>
                    <div className="space-y-1.5">
                      {isoGames.map((g) => (
                        <button
                          key={g.id}
                          onClick={() => setIsoPath(g.exePath)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all active:scale-[0.99]",
                            isoPath === g.exePath
                              ? "bg-primary/10 text-primary"
                              : "bg-[var(--dk-surface-glass)] text-foreground hover:bg-[var(--dk-surface-glass-hover)]",
                          )}
                        >
                          <Disc className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate text-sm font-medium">
                            {g.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <DkButton
                  onClick={handleMount}
                  disabled={!isoPath || mounting}
                  isLoading={mounting}
                  className="w-full"
                >
                  Mount ISO Image
                </DkButton>
              </div>
            )}

            {/* Step 2: Run Setup */}
            {step === 2 && mountResult && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[var(--dk-surface-glass)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Drive
                    </p>
                    <p className="text-sm font-semibold font-mono">
                      {mountResult.driveLetter}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[var(--dk-surface-glass)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Setup
                    </p>
                    <p className="truncate text-sm font-semibold font-mono">
                      {mountResult.setupPath?.split(/[\\/]/).pop() ?? "Not found"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <DkButton
                    onClick={handleRunSetup}
                    disabled={!mountResult.setupPath || runningSetup}
                    isLoading={runningSetup}
                  >
                    <Play className="h-4 w-4" />
                    Run Setup
                  </DkButton>
                  <DkButton
                    variant="ghost"
                    onClick={() => setStep(3)}
                  >
                    Next Step
                  </DkButton>
                </div>
              </div>
            )}

            {/* Step 3: Apply Crack */}
            {step === 3 && mountResult && (
              <div className="space-y-6">
                {mountResult.crackPath ? (
                  <>
                    <div className="rounded-xl bg-[var(--dk-surface-glass)] p-4">
                      <p className="text-xs text-muted-foreground">
                        Crack source
                      </p>
                      <p className="text-sm font-mono">{mountResult.crackPath}</p>
                      {mountResult.crackName && (
                        <DkBadge variant="warning" size="sm" className="mt-1">
                          {mountResult.crackName}
                        </DkBadge>
                      )}
                    </div>

                    <button
                      onClick={handleSelectTargetDir}
                      className="flex w-full items-center gap-4 rounded-2xl bg-[var(--dk-surface-glass)] p-4 text-left transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.99]"
                    >
                      <HardDrive className="h-5 w-5 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {targetDir || "Select install folder"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground font-mono">
                          {targetDir || "Link the game install directory"}
                        </p>
                      </div>
                      <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    </button>

                    <DkButton
                      onClick={handleApplyCrack}
                      disabled={!targetDir || copyingCrack}
                      isLoading={copyingCrack}
                      className="w-full"
                    >
                      Apply Crack
                    </DkButton>
                  </>
                ) : (
                  <div className="space-y-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      No crack directory detected on this ISO.
                    </p>
                    <DkButton
                      variant="ghost"
                      onClick={() => setStep(4)}
                    >
                      <SkipForward className="h-4 w-4" />
                      Skip to Finish
                    </DkButton>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Finish */}
            {step === 4 && (
              <div className="space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[var(--dk-surface-glass)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      ISO
                    </p>
                    <p className="truncate text-sm font-semibold font-mono">
                      {isoPath.split(/[\\/]/).pop()}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[var(--dk-surface-glass)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Installed To
                    </p>
                    <p className="truncate text-sm font-semibold font-mono">
                      {targetDir || "—"}
                    </p>
                  </div>
                </div>

                {/* Updates */}
                {updates.length > 0 && (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Update Sequence
                    </p>
                    <div className="space-y-2">
                      {updates.map((u, i) => {
                        const isComplete = completedUpdates[u.file.path];
                        const isUnlocked =
                          i === 0 || completedUpdates[updates[i - 1].file.path];
                        return (
                          <div
                            key={u.file.path}
                            className={cn(
                              "flex items-center gap-3 rounded-xl px-4 py-2.5",
                              u.isDuplicate
                                ? "bg-amber-500/5"
                                : "bg-[var(--dk-surface-glass)]",
                            )}
                          >
                            {isComplete ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                            ) : !isUnlocked ? (
                              <Lock className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                            ) : (
                              <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-muted-foreground/30" />
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">
                                {u.cleanName}{" "}
                                <span className="font-mono text-xs text-muted-foreground">
                                  {u.from ? `${u.from} → ` : ""}
                                  {u.to}
                                </span>
                              </p>
                              {u.isDuplicate && (
                                <DkBadge variant="warning" size="sm">
                                  Duplicate
                                </DkBadge>
                              )}
                              {u.isGapBefore && u.gapVersion && (
                                <DkBadge variant="warning" size="sm">
                                  Gap: {u.gapVersion}
                                </DkBadge>
                              )}
                            </div>

                            {isUnlocked && !isComplete && !u.isDuplicate && (
                              <button
                                onClick={async () => {
                                  try {
                                    await (window as any).electronAPI.launchSetup(
                                      u.file.path,
                                    );
                                    setCompletedUpdates((prev) => ({
                                      ...prev,
                                      [u.file.path]: true,
                                    }));
                                  } catch {
                                    // update run is best-effort
                                  }
                                }}
                                className="flex-shrink-0 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 active:scale-95"
                              >
                                Run
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <DkButton
                  onClick={handleDismount}
                  isLoading={dismounting}
                  className="w-full"
                  variant="glass"
                >
                  <Disc className="h-4 w-4" />
                  Dismount ISO & Finish
                </DkButton>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/game-scanner/organisms/iso-installer-modal.tsx
git commit -m "feat(game-scanner): add iso-installer-modal organism"
```

---

### Task 11: Create iso-organizer-modal organism

**Files:**
- Create: `frontend/src/features/game-scanner/organisms/iso-organizer-modal.tsx`

- [ ] **Step 1: Write iso-organizer-modal.tsx**

```typescript
// frontend/src/features/game-scanner/organisms/iso-organizer-modal.tsx
import { useState, useCallback } from "react";
import { X, FolderOpen, Play, CheckCircle2, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { DkButton } from "@/features/dk-ui/atoms/button";
import { DkBadge } from "@/features/dk-ui/atoms/badge";
import { hasElectronAPI } from "../storage";
import type {
  OrgPreset,
  OrganizationPreviewItem,
  OrgExecutionResult,
} from "../types";
import { ORG_PRESETS } from "../types";

interface IsoOrganizerModalProps {
  open: boolean;
  onClose: () => void;
  isoPaths: string[];
}

const PRESETS: Array<{ key: OrgPreset } & (typeof ORG_PRESETS)[OrgPreset]> = [
  { key: "scene", ...ORG_PRESETS.scene },
  { key: "simple", ...ORG_PRESETS.simple },
  { key: "custom", ...ORG_PRESETS.custom },
];

export function IsoOrganizerModal({
  open,
  onClose,
  isoPaths,
}: IsoOrganizerModalProps) {
  const [directory, setDirectory] = useState("");
  const [preset, setPreset] = useState<OrgPreset>("scene");
  const [regex, setRegex] = useState(ORG_PRESETS.scene.regex);
  const [isoTemplate, setIsoTemplate] = useState(
    ORG_PRESETS.scene.isoTemplate,
  );
  const [updateTemplate, setUpdateTemplate] = useState(
    ORG_PRESETS.scene.updateTemplate,
  );
  const [previewItems, setPreviewItems] = useState<
    OrganizationPreviewItem[]
  >([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<OrgExecutionResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectPreset = useCallback((p: OrgPreset) => {
    setPreset(p);
    const config = ORG_PRESETS[p];
    setRegex(config.regex);
    setIsoTemplate(config.isoTemplate);
    setUpdateTemplate(config.updateTemplate);
  }, []);

  const handlePreview = useCallback(async () => {
    if (!directory) return;
    setPreviewLoading(true);
    setError(null);
    try {
      if (hasElectronAPI()) {
        const items = await (
          window as any
        ).electronAPI.previewOrganization(
          directory,
          regex,
          isoTemplate,
          updateTemplate,
        );
        setPreviewItems(items);
      }
    } catch {
      setError("Failed to preview organization");
    } finally {
      setPreviewLoading(false);
    }
  }, [directory, regex, isoTemplate, updateTemplate]);

  const handleExecute = useCallback(async () => {
    if (previewItems.length === 0) return;
    setExecuting(true);
    setError(null);
    try {
      if (hasElectronAPI()) {
        const items = await (
          window as any
        ).electronAPI.executeOrganization(
          previewItems.map((p) => ({
            sourcePath: p.sourcePath,
            targetPath: p.targetPath,
          })),
        );
        setResult(items);
        setTimeout(() => onClose(), 1500);
      }
    } catch {
      setError("Failed to execute organization");
    } finally {
      setExecuting(false);
    }
  }, [previewItems, onClose]);

  const handleSelectDir = useCallback(async () => {
    if (hasElectronAPI()) {
      try {
        const dir = await (window as any).electronAPI.selectDirectory();
        if (dir) setDirectory(dir);
      } catch {
        setError("Failed to select directory");
      }
    }
  }, []);

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-[2rem] bg-[var(--dk-surface-overlay)] shadow-[var(--dk-shadow-dialog)] backdrop-blur-xl ring-1 ring-white/[0.04]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.04] px-6 py-4">
            <h2 className="text-lg font-semibold text-foreground">
              Organize ISO Files
            </h2>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-[var(--dk-surface-glass)] hover:text-foreground active:scale-90"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto space-y-6 px-6 py-4">
            {error && (
              <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Directory */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Target Directory
              </label>
              <div className="flex gap-2">
                <select
                  value={directory}
                  onChange={(e) => setDirectory(e.target.value)}
                  className="h-12 flex-1 rounded-xl bg-[var(--dk-surface-glass)] px-4 text-sm text-foreground backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)]"
                >
                  <option value="">Select a folder...</option>
                  {isoPaths.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <DkButton variant="ghost" onClick={handleSelectDir}>
                  <FolderOpen className="h-4 w-4" />
                </DkButton>
              </div>
            </div>

            {/* Presets */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Naming Preset
              </label>
              <div className="flex gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => selectPreset(p.key)}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                      preset === p.key
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Regex & Templates */}
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Regex Pattern
                </label>
                <input
                  type="text"
                  value={regex}
                  onChange={(e) => {
                    setRegex(e.target.value);
                    setPreset("custom");
                  }}
                  className="h-10 w-full rounded-xl bg-[var(--dk-surface-glass)] px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  ISO Template
                </label>
                <input
                  type="text"
                  value={isoTemplate}
                  onChange={(e) => {
                    setIsoTemplate(e.target.value);
                    setPreset("custom");
                  }}
                  className="h-10 w-full rounded-xl bg-[var(--dk-surface-glass)] px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Update Template
                </label>
                <input
                  type="text"
                  value={updateTemplate}
                  onChange={(e) => {
                    setUpdateTemplate(e.target.value);
                    setPreset("custom");
                  }}
                  className="h-10 w-full rounded-xl bg-[var(--dk-surface-glass)] px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)]"
                />
              </div>
            </div>

            {/* Preview results */}
            {previewItems.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview ({previewItems.length} files)
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-2xl bg-[var(--dk-surface-base)] p-2">
                  {previewItems.map((item) => (
                    <div
                      key={item.sourcePath}
                      className="flex items-center gap-3 rounded-xl px-3 py-2"
                    >
                      {item.matched ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-mono">
                          {item.sourceFilename}
                        </p>
                        {item.matched && (
                          <p className="truncate text-xs text-muted-foreground">
                            → {item.targetPath}
                          </p>
                        )}
                      </div>
                      <DkBadge
                        variant={item.matched ? "success" : "muted"}
                        size="sm"
                      >
                        {item.type.toUpperCase()}
                      </DkBadge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="rounded-xl bg-green-500/10 px-4 py-3 text-sm text-green-400">
                {result.filter((r) => r.success).length} files organized
                successfully.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/[0.04] px-6 py-4">
            <DkButton
              variant="ghost"
              onClick={handlePreview}
              disabled={!directory || previewLoading}
              isLoading={previewLoading}
            >
              Preview Changes
            </DkButton>
            <div className="flex gap-2">
              <DkButton variant="ghost" onClick={onClose}>
                Cancel
              </DkButton>
              <DkButton
                onClick={handleExecute}
                disabled={previewItems.length === 0 || executing}
                isLoading={executing}
              >
                <Play className="h-4 w-4" />
                Run Organization
              </DkButton>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/game-scanner/organisms/iso-organizer-modal.tsx
git commit -m "feat(game-scanner): add iso-organizer-modal organism"
```

---

### Task 12: Wire into library

**Files:**
- Modify: `frontend/src/features/library/library-queries.ts`
- Modify: `frontend/src/features/library/library-page.tsx`

- [ ] **Step 1: Add "local-games" tab to library-queries.ts**

In `frontend/src/features/library/library-queries.ts`, add `"local-games"` to `LIBRARY_TABS`:

```typescript
// Change line:
export const LIBRARY_TABS = ["overview", "watchlist", "like", "watched", "played", "listened", "spotify", "steam", "plex", "wishlist", "lists"] as const

// To:
export const LIBRARY_TABS = ["overview", "watchlist", "like", "watched", "played", "listened", "spotify", "steam", "plex", "wishlist", "lists", "local-games"] as const
```

And add to `TAB_LABELS`:

```typescript
// Add after the "lists" entry in TAB_LABELS:
  lists: "Lists",
  "local-games": "Local Games",
}
```

- [ ] **Step 2: Wire into LibraryPage**

In `frontend/src/features/library/library-page.tsx`:

Add import at top:
```typescript
import { Gamepad2 } from "lucide-react"
import { GameScannerTab } from "@/features/game-scanner"
```

In the `visibleTabs` useMemo, add the conditional tab (before the `return tabs` statement):

```typescript
// After the "lists" tab push, before "return tabs":
if (
  typeof window !== "undefined" &&
  !!(window as any).electronAPI
) {
  tabs.push({
    id: "local-games",
    label: TAB_LABELS["local-games"],
    icon: <Gamepad2 className="h-4 w-4" />,
  })
}
```

In the `renderContent` function (or inline), add the case for `"local-games"`:

```typescript
if (activeTab === "local-games") {
  return <GameScannerTab />
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/library/library-queries.ts frontend/src/features/library/library-page.tsx
git commit -m "feat(library): add Local Games tab with game scanner integration"
```

---

### Task 13: Update router — redirect and auto-redirect

**Files:**
- Modify: `frontend/src/lib/router.tsx`

- [ ] **Step 1: Update router.tsx**

In `frontend/src/lib/router.tsx`:

Remove the `DesktopScannerPage` import:
```typescript
// DELETE this line:
const DesktopScannerPage = lazy(() => import("@/features/experiments/desktop-scanner").then(m => ({ default: m.DesktopScanner })))
```

Change the `/admin/desktop` route to redirect to the library tab:
```typescript
// Replace the desktopScannerRoute definition with a redirect component:

function DesktopScannerRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate({ to: "/library/$tab", params: { tab: "local-games" }, replace: true })
  }, [navigate])
  return <LoadingPage />
}

const desktopScannerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/desktop",
  component: DesktopScannerRedirect,
})
```

Fix the Electron auto-redirect in `RootComponent`:
```typescript
// Change:
navigate({ to: "/admin/desktop", replace: true })

// To:
navigate({ to: "/library/$tab", params: { tab: "local-games" }, replace: true })
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/router.tsx
git commit -m "fix(router): redirect /admin/desktop to /library/local-games, fix electron auto-redirect"
```

---

### Task 14: Remove Game Scanner from admin home page

**Files:**
- Modify: `frontend/src/features/admin/organisms/admin-home-page.tsx`

- [ ] **Step 1: Remove Game Scanner card from SUBPAGES**

In `frontend/src/features/admin/organisms/admin-home-page.tsx`:

Remove the `Gamepad2` import from lucide-react:
```typescript
// Change:
import { BarChart3, Pencil, FlaskConical, Droplets, ArrowRight, Calendar, Gamepad2 } from 'lucide-react'

// To:
import { BarChart3, Pencil, FlaskConical, Droplets, ArrowRight, Calendar } from 'lucide-react'
```

Remove the Game Scanner entry from `SUBPAGES` array:
```typescript
// DELETE this entry:
  {
    to: '/admin/desktop',
    icon: Gamepad2,
    label: 'Game Scanner',
    description:
      'Scan Steam library and custom locations for PC games, extract native icons, and launch them.',
  },
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/admin/organisms/admin-home-page.tsx
git commit -m "chore(admin): remove Game Scanner card from admin home page"
```

---

### Task 15: Deprecate old DesktopScanner component

**Files:**
- Modify: `frontend/src/features/experiments/desktop-scanner.tsx`

- [ ] **Step 1: Replace with re-export**

Replace the entire content of `frontend/src/features/experiments/desktop-scanner.tsx`:

```typescript
// DEPRECATED: DesktopScanner has moved to features/game-scanner/.
// This re-export exists for backwards compatibility with any lingering
// imports. Use GameScannerTab from @/features/game-scanner instead.

export { GameScannerTab as DesktopScanner } from "@/features/game-scanner"
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/experiments/desktop-scanner.tsx
git commit -m "chore(desktop-scanner): replace with deprecated re-export to game-scanner"
```

---

### Task 16: Final verification

- [ ] **Step 1: Verify TypeScript compilation**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Verify Vite build**

```bash
cd frontend && npx vite build
```

Expected: Build succeeds without errors.

- [ ] **Step 3: Verify no broken imports**

```bash
cd frontend && npx tsc --noEmit --pretty 2>&1 | grep -E "Cannot find module|is not a module"
```

Expected: No output (no broken imports).

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final verification passes"
```

---

## Summary

16 tasks, ~80 steps. Delivers:

1. **New `features/game-scanner/`** — clean modular architecture with types, storage, queries, 6 molecules, 3 organisms
2. **Library integration** — "Local Games" tab visible only in Electron
3. **Full UI redesign** — matches app design language (dk-ui surfaces, shadows, radius, typography, animations)
4. **ISO installer as modal** — 4-step stepper with queue support
5. **ISO organizer as modal** — preset-based file organization
6. **Backwards compat** — `/admin/desktop` redirects, old component re-exports
7. **No mock data** — no browser fallback code, no mock games
8. **All states covered** — loading/skeleton, empty (no dirs, no games, no results), error, active
