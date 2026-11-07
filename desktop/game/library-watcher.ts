import * as fs from 'fs';
import * as path from 'path';
import { BrowserWindow } from 'electron';
import type { LocalGame } from '../preload-api';
import { handleNewGamesDetected } from '../ipc/scanner';

export interface LibraryWatcherOptions {
  getScanPaths: () => { path: string; type: 'game' | 'iso' }[];
  onPerformScan: (paths?: string[]) => Promise<{ games: LocalGame[]; newGames: LocalGame[] }>;
  onNewGamesDetected?: (newGames: LocalGame[]) => void;
  debounceMs?: number;
}

export class LibraryWatcher {
  private watchers = new Map<string, fs.FSWatcher>();
  private debounceTimer: NodeJS.Timeout | null = null;
  private isScanning = false;
  private pendingRescan = false;
  private isStarted = false;
  private debounceMs = 2500;
  private mainWindow: BrowserWindow | null = null;

  constructor(private options: LibraryWatcherOptions) {
    if (typeof options.debounceMs === 'number') {
      this.debounceMs = options.debounceMs;
    }
  }

  public setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  public start(): void {
    if (this.isStarted) return;
    this.isStarted = true;
    this.updateWatches();
  }

  public stop(): void {
    this.isStarted = false;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const watcher of this.watchers.values()) {
      try {
        watcher.close();
      } catch {
        // ignore
      }
    }
    this.watchers.clear();
  }

  public getWatchedPaths(): string[] {
    return Array.from(this.watchers.keys());
  }

  public updateWatches(): void {
    if (!this.isStarted) return;

    const configured = this.options.getScanPaths() || [];
    const validPaths = new Set<string>();

    for (const item of configured) {
      if (!item.path) continue;
      const normalized = path.resolve(item.path);
      validPaths.add(normalized);
    }

    // Stop watchers for paths that were removed
    for (const [watchedPath, watcher] of this.watchers.entries()) {
      if (!validPaths.has(watchedPath)) {
        try {
          watcher.close();
        } catch {
          // ignore
        }
        this.watchers.delete(watchedPath);
      }
    }

    // Add watchers for newly added paths
    for (const targetPath of validPaths) {
      if (!this.watchers.has(targetPath)) {
        this.watchPath(targetPath);
      }
    }
  }

  private watchPath(targetPath: string): void {
    try {
      if (!fs.existsSync(targetPath)) {
        return;
      }
      const stat = fs.statSync(targetPath);
      if (!stat.isDirectory()) {
        return;
      }

      let watcher: fs.FSWatcher;
      try {
        watcher = fs.watch(targetPath, { recursive: true }, (eventType, filename) => {
          this.handleFsEvent(targetPath, eventType, filename);
        });
      } catch (recErr) {
        // Fallback to non-recursive if recursive watch is unsupported
        try {
          watcher = fs.watch(targetPath, { recursive: false }, (eventType, filename) => {
            this.handleFsEvent(targetPath, eventType, filename);
          });
        } catch (fbErr) {
          console.warn(`[LibraryWatcher] Failed to watch ${targetPath}:`, fbErr);
          return;
        }
      }

      watcher.on('error', (err) => {
        console.warn(`[LibraryWatcher] Watcher error on ${targetPath}:`, err);
        try {
          watcher.close();
        } catch {
          // Ignore close error
        }
        this.watchers.delete(targetPath);
      });

      this.watchers.set(targetPath, watcher);
    } catch (err) {
      console.warn(`[LibraryWatcher] Error setting up watch on ${targetPath}:`, err);
    }
  }

  public isNoiseFile(filename?: string | null): boolean {
    if (!filename) return false;
    const lower = filename.toLowerCase();
    const base = path.basename(lower);
    if (base.startsWith('.')) return true;
    if (
      base.endsWith('.tmp') ||
      base.endsWith('.crdownload') ||
      base.endsWith('.part') ||
      base.endsWith('.aria2') ||
      base.endsWith('.log') ||
      base.endsWith('.otix') ||
      base.endsWith('.otixmeta')
    ) {
      return true;
    }
    if (
      lower.includes('$recycle.bin') ||
      lower.includes('system volume information') ||
      lower.includes('node_modules') ||
      lower.includes('.git')
    ) {
      return true;
    }
    return false;
  }

  public handleFsEvent(_targetPath: string, _eventType: string, filename?: string | null): void {
    if (this.isNoiseFile(filename)) {
      return;
    }

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.triggerScan();
    }, this.debounceMs);
  }

  public async triggerScan(): Promise<{ games: LocalGame[]; newGames: LocalGame[] } | null> {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.isScanning) {
      this.pendingRescan = true;
      return null;
    }

    this.isScanning = true;
    try {
      const result = await this.options.onPerformScan();
      if (result.newGames && result.newGames.length > 0) {
        if (this.options.onNewGamesDetected) {
          this.options.onNewGamesDetected(result.newGames);
        } else {
          handleNewGamesDetected(result.newGames, this.mainWindow);
        }
      }
      return result;
    } catch (err) {
      console.warn('[LibraryWatcher] Scan error:', err);
      return null;
    } finally {
      this.isScanning = false;
      if (this.pendingRescan) {
        this.pendingRescan = false;
        setImmediate(() => {
          void this.triggerScan();
        });
      }
    }
  }
}
