import * as gameService from '../../game/storage';
import { cleanGameTitle } from '../../game/parser';
import type { LocalGame } from '../../preload-api';
import type { GameScanOrchestrator, ScannedGame } from '../../game/orchestrator';
import type { GameDetector } from '../../game/detector';

export interface ScanFinalizerOptions {
  games: LocalGame[];
  hasClientPaths: boolean;
  allPathsMap: Map<string, 'game' | 'iso'>;
  gameDetector: GameDetector | null;
  orchestrator: GameScanOrchestrator | null;
  sendSafeProgress: (currentDir: string, progress: number) => void;
}

export function finalizeScanResults(options: ScanFinalizerOptions): void {
  const { games, hasClientPaths, allPathsMap, gameDetector, orchestrator, sendSafeProgress } = options;

  // Update detector state with newly indexed games (isolated from scan return)
  try {
    gameDetector?.setLibrary(games);
    gameDetector?.startPeriodicScan();
  } catch (detErr) {
    console.warn('[scanner:scan-paths] Detector update error:', detErr);
  }

  // Commit 100% of discovered games into SQLite immediately in atomic transaction
  if (games.length > 0) {
    sendSafeProgress(`Saving ${games.length} games to library...`, 96);
    const scope = hasClientPaths ? Array.from(allPathsMap.keys()) : undefined;
    gameService.upsertGames(games as any[], scope);
    // Flush change notification immediately so renderer hydrates cards without debounce delay
    gameService.flushNotifyGamesChanged();
  }
  // Prune missing games asynchronously to avoid blocking the main thread with fs.existsSync
  try {
    gameService.pruneMissingGamesAsync().catch((err: any) => {
      console.warn('[scanner:scan-paths] Async prune error:', err);
    });
  } catch (pruneErr) {
    console.warn('[scanner:scan-paths] Synchronous prune invocation error:', pruneErr);
  }

  // Discovery is complete: notify frontend scanner widget
  sendSafeProgress('Scan complete', 100);

  // ── Phase 2: Autonomous Background Matching (Fire-and-forget, non-blocking) ──
  if (orchestrator) {
    if (typeof (orchestrator as any).startBackgroundMatching === 'function') {
      (orchestrator as any).startBackgroundMatching().catch((matchErr: any) => {
        console.warn('[scanner:scan-paths] Background matching error:', matchErr);
      });
    } else if (typeof (orchestrator as any).startMatching === 'function') {
      (orchestrator as any).startMatching().catch((matchErr: any) => {
        console.warn('[scanner:scan-paths] Background matching error:', matchErr);
      });
    } else if (typeof orchestrator.matchGames === 'function') {
      const scannedForMatch: ScannedGame[] = games
        .filter((g) => !g.isDlc && !g.isApp)
        .map((g) => ({
          id: g.id,
          title: cleanGameTitle(g.title) || g.title,
          platform: g.platform,
          installPath: g.installDir,
          exePath: g.exePath,
          isDlc: g.isDlc,
        }));
      orchestrator.matchGames(scannedForMatch, 'local').catch((matchErr: any) => {
        console.warn('[scanner:scan-paths] Background matchGames fallback error:', matchErr);
      });
    }
  }
}
