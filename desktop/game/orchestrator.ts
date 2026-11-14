import http from 'http';
import https from 'https';
import { URL } from 'url';
import { EventEmitter } from 'events';
import type { PluginManager } from '../plugin-runtime/manager';
import { getApiBaseUrl } from '../config';
import {
  getGameMatch,
  upsertGameMatch,
  upsertGameMatches,
  upsertGamesForPlatform,
  ensureGameMatchesTable,
  hydrateGame,
  saveMatchSuggestion,
  notifyGamesChanged,
  upsertGames,
  getAllGames,
  getGamesByIds,
  getGameCount,
  withTransaction,
  GameRow,
} from './storage';
import { LocalMatcher } from './local-matcher';
import { buildCatalogRequests, normalizeCatalogResponse } from './catalog-match';
import type { CatalogMatchCandidate } from './catalog-match';
import { cleanGameTitle } from './parser';
import { isUpdateFile, isDlcFile } from './local-scanner';
import { downloadAndHydrateGameOffline } from './offline-cache';

// ── Types ──────────────────────────────────────────────────────────────

/**
 * Executes async tasks with a bounded concurrency pool while honoring an abort signal.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  signal: AbortSignal,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (currentIndex < items.length) {
      if (signal.aborted) break;
      const idx = currentIndex++;
      try {
        results[idx] = await fn(items[idx]);
      } catch {
        // worker catch: individual item failure shouldn't cancel whole pool
      }
    }
  });

  await Promise.all(workers);
  return results;
}

export interface BackgroundMatchingOptions {
  /** If true, matches all non-app games in library regardless of current match status */
  rematchAll?: boolean;
  /** Optional specific game IDs to match */
  gameIds?: string[];
  /** Optional external abort signal */
  signal?: AbortSignal;
  /** Batch size per request (default: 25) */
  batchSize?: number;
}

export interface MatchingStatus {
  isMatching: boolean;
  totalUnmatched: number;
  totalInLibrary: number;
  totalMatched?: number;
  processed: number;
  matched: number;
}

export interface BackgroundMatchingProgressEvent {
  state: 'running' | 'cancelled' | 'completed' | 'error';
  processed: number;
  total: number;
  totalInLibrary: number;
  matched: number;
  unmatched: number;
  percent: number;
  currentItem?: string;
  error?: string;
  current?: number;
  progress?: number;
  gameTitle?: string;
}

export interface ScannedGame {
  id: string
  rowId?: string
  title: string
  platform: string
  externalIds?: Array<{ source: string; id: string }>
  developer?: string | null
  publisher?: string | null
  releaseYear?: number | null
  installPath?: string
  exePath?: string | null
  posterUrl?: string | null
  logoUrl?: string | null
  isDlc?: boolean
  dlcOf?: string | null
  isBeta?: boolean
  betaOf?: string | null
  isApp?: boolean
  gameType?: string | null
  rawMetadata?: Record<string, unknown>
  // Plugin fields (may be present on raw scan results)
  appName?: string
  catalogItemId?: string
}

export interface ScanRequest {
  pluginId: string
  /** Media type for routing — 'game', 'movie', etc. Determines match endpoint. */
  mediaType?: string
  /** Override scan method name (default: 'scan') */
  scanMethod?: string
}

export interface PluginScanResult {
  pluginId: string
  pluginLabel: string
  totalGames: number
  matched: number
  unmatched: number
  cancelled?: boolean
  errors?: string[]
}

export interface GameProgressEvent {
  pluginId: string
  queryId: string
  totalGames?: number
  status: 'processing' | 'matched' | 'candidates' | 'unmatched' | 'failed'
  queryTitle?: string
  match?: {
    media_item_id: string
    title: string
    confidence: number
    poster_url?: string
    backdrop_url?: string
  }
  candidates?: Array<{
    media_item_id?: string
    title: string
    confidence: number
    poster_url?: string
  }>
  error?: string
}

// ── Orchestrator ───────────────────────────────────────────────────────

export class GameScanOrchestrator extends EventEmitter {
  private apiBaseUrl = getApiBaseUrl();
  private authToken = '';
  /** Per-plugin active scans — only one scan per plugin at a time */
  private activeScans = new Map<string, AbortController>();
  /** Track games per queryId for persistence during SSE stream */
  private queryIdToGames = new Map<string, ScannedGame[]>();

  /** In-memory query LRU caches for external catalog resolution */
  private searchCache = new Map<string, { timestamp: number; data: any[] }>();
  private hydrateCache = new Map<string, { timestamp: number; data: any }>();
  private static readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  private static readonly MAX_CACHE_ENTRIES = 500;

  // ── Background Matching Engine State ──────────────────────────────────
  private matchingAbortController: AbortController | null = null;
  private isMatchingRunning: boolean = false;
  private matchingStats: MatchingStatus = {
    isMatching: false,
    totalUnmatched: 0,
    totalInLibrary: 0,
    processed: 0,
    matched: 0,
  };
  private _lastProcessedCount: number = 0;
  private lastProgressEmitTime: number = 0;
  private progressTimer: NodeJS.Timeout | null = null;
  private pendingProgressPayload: BackgroundMatchingProgressEvent | null = null;
  private lastMatchProgressTime: number = 0;
  private pendingMatchProgress: GameProgressEvent | null = null;
  private matchProgressTimer: NodeJS.Timeout | null = null;

  get isScanning(): boolean { return this.activeScans.size > 0; }
  get isMatching(): boolean { return this.isMatchingRunning; }
  get currentProcessed(): number { return this.matchingStats.processed; }

  constructor(
    private pluginManager?: PluginManager | null,
  ) {
    super();
  }

  setApiBaseUrl(url: string): void { this.apiBaseUrl = url; }
  setAuthToken(token: string): void { this.authToken = token; }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Scan a single plugin: run scan → save → match (SSE stream)
   * Only blocks the SAME plugin from concurrent scans.
   */
  async scanPlugin(request: ScanRequest): Promise<PluginScanResult> {
    const { pluginId, mediaType = 'game', scanMethod = 'scan' } = request;

    // Per-plugin lock
    if (this.activeScans.has(pluginId)) {
      const existing = this.activeScans.get(pluginId)!;
      if (existing.signal.aborted) {
        this.activeScans.delete(pluginId);
      } else {
        return {
          pluginId, pluginLabel: pluginId,
          totalGames: 0, matched: 0, unmatched: 0,
          errors: ['Plugin is already being scanned'],
        };
      }
    }

    const abortController = new AbortController();
    this.activeScans.set(pluginId, abortController);

    try {
      return await this._executeScan(pluginId, mediaType, scanMethod, abortController.signal);
    } finally {
      this.activeScans.delete(pluginId);
    }
  }

  /**
   * Scan all plugins registered in matching:scan or library:scan slots.
   * Each plugin scans independently (per-plugin locks).
   */
  async scanAll(mediaType?: string): Promise<PluginScanResult[]> {
    if (!this.pluginManager) {
      return [];
    }
    const matchingPlugins = this.pluginManager.getPluginsForSlot('matching:scan');
    const libraryPlugins = this.pluginManager.getPluginsForSlot('library:scan');
    const seen = new Set<string>();
    const plugins = [...matchingPlugins, ...libraryPlugins]
      .filter(p => { if (seen.has(p.pluginId)) return false; seen.add(p.pluginId); return true; });

    const results: PluginScanResult[] = [];
    for (const plugin of plugins) {
      if (results.some(r => r.pluginId === plugin.pluginId)) continue;
      const result = await this.scanPlugin({
        pluginId: plugin.pluginId,
        mediaType: mediaType || 'game',
      });
      results.push(result);
    }
    return results;
  }

  /** Match an arbitrary list of scanned games (e.g. from node / local folder scan) */
  async matchGames(
    games: ScannedGame[],
    pluginId: string = 'local',
    mediaType: string = 'game',
  ): Promise<PluginScanResult> {
    ensureGameMatchesTable();
    this.queryIdToGames.clear();
    if (!games || games.length === 0) {
      return { pluginId, pluginLabel: pluginId, totalGames: 0, matched: 0, unmatched: 0 };
    }

    const abortController = new AbortController();
    this.activeScans.set(pluginId, abortController);
    const normalized = games.map((g) => ({
      ...g,
      title: cleanGameTitle(g.title) || g.title,
      externalIds: this.buildExternalIds(g),
    }));

    // Pre-register rows in scanned_games with ID `${plat}_${gameId}` so SSE hydration targets find them
    const initialRows = normalized.map((g) => {
      const plat = g.platform || pluginId || 'pc';
      const gameId = g.id;
      const isDlc = !!g.isDlc;
      const isBeta = !!g.isBeta;
      const isApp = !!g.isApp;
      const gameType = g.gameType || (isApp ? 'application' : isBeta ? 'beta' : isDlc ? 'dlc_addon' : 'main_game');
      return {
        id: `${plat}_${gameId}`,
        title: g.title,
        exePath: g.exePath || '',
        installDir: g.installPath || '',
        platform: plat as any,
        posterUrl: g.posterUrl || undefined,
        iconUrl: g.logoUrl || g.posterUrl || undefined,
        isDlc,
        dlcOf: g.dlcOf || undefined,
        isBeta,
        betaOf: g.betaOf || undefined,
        isApp,
        gameType,
        sources: [{ source: plat, id: gameId, developer: g.developer || null, publisher: g.publisher || null, releaseYear: g.releaseYear || null, dlcOf: g.dlcOf || null, isDlc, betaOf: g.betaOf || null, isBeta, isApp, gameType }],
      };
    });
    const pathsToScope = initialRows.map((r) => r.installDir || r.exePath).filter(Boolean);
    upsertGames(initialRows as any[], pathsToScope.length > 0 ? pathsToScope : undefined);

    try {
      this.emit('scan:progress', { pluginId, phase: 'matching', current: 0, total: normalized.length });
      await this.streamMatches(normalized, pluginId, mediaType, abortController.signal);
      const matched = normalized.filter((g) => {
        const m = getGameMatch(g.platform, g.id);
        return m?.otixMediaId;
      }).length;
      return {
        pluginId,
        pluginLabel: pluginId,
        totalGames: normalized.length,
        matched,
        unmatched: normalized.length - matched,
      };
    } catch (err: any) {
      console.warn(`[Orchestrator] Match failed for ${pluginId}:`, err);
      return {
        pluginId,
        pluginLabel: pluginId,
        totalGames: normalized.length,
        matched: 0,
        unmatched: normalized.length,
        errors: [err.message],
      };
    } finally {
      this.activeScans.delete(pluginId);
    }
  }

  /** Cancel an active plugin scan */
  cancelScan(pluginId?: string): void {
    if (this.matchProgressTimer) {
      clearTimeout(this.matchProgressTimer);
      this.matchProgressTimer = null;
      this.pendingMatchProgress = null;
    }
    if (pluginId === 'background') {
      this.cancelMatching();
      return;
    }
    if (pluginId) {
      const ctrl = this.activeScans.get(pluginId);
      if (ctrl) { ctrl.abort(); this.activeScans.delete(pluginId); }
      return;
    }
    // Cancel all
    for (const [id, ctrl] of this.activeScans) {
      ctrl.abort();
      this.activeScans.delete(id);
    }
    this.cancelMatching();
    this.emit('scan:cancelled', { pluginId: pluginId || 'all' });
  }

  /**
   * Returns current background matching status.
   * Dynamically inspects database if idle to return accurate library counts.
   */
  getMatchingStatus(): MatchingStatus {
    const totalInLibrary = getGameCount();
    const totalUnmatched = getGameCount({ matched: false });
    const totalMatched = totalInLibrary - totalUnmatched;
    if (this.isMatchingRunning) {
      return {
        ...this.matchingStats,
        isMatching: true,
        totalInLibrary,
        totalMatched,
        processed: this.currentProcessed,
      };
    }
    return {
      isMatching: false,
      totalUnmatched,
      totalInLibrary,
      totalMatched,
      processed: this._lastProcessedCount ?? 0,
      matched: totalMatched,
    };
  }

  /**
   * Cancels any active background matching process.
   * In-flight HTTP requests are aborted immediately, the chunk loop terminates,
   * and all previously committed matches in SQLite remain completely intact.
   */
  cancelMatching(): void {
    if (!this.isMatchingRunning || !this.matchingAbortController) {
      return;
    }

    console.log('[Orchestrator] Cancelling background matching...');
    this._lastProcessedCount = this.matchingStats.processed;
    this.matchingAbortController.abort();
    this.isMatchingRunning = false;

    if (this.progressTimer) {
      clearTimeout(this.progressTimer);
      this.progressTimer = null;
    }
    this.pendingProgressPayload = null;
    if (this.matchProgressTimer) {
      clearTimeout(this.matchProgressTimer);
      this.matchProgressTimer = null;
      this.pendingMatchProgress = null;
    }

    const cancelPayload: BackgroundMatchingProgressEvent = {
      state: 'cancelled',
      processed: this.matchingStats.processed,
      total: this.matchingStats.totalUnmatched,
      totalInLibrary: this.matchingStats.totalInLibrary,
      matched: this.matchingStats.matched,
      unmatched: Math.max(0, this.matchingStats.totalUnmatched - this.matchingStats.matched),
      percent: this.matchingStats.totalUnmatched > 0
        ? Math.min(100, Math.round((this.matchingStats.processed / this.matchingStats.totalUnmatched) * 100))
        : 0,
      progress: this.matchingStats.totalUnmatched > 0
        ? Math.min(100, Math.round((this.matchingStats.processed / this.matchingStats.totalUnmatched) * 100))
        : 0,
      current: this.matchingStats.processed,
    };

    this.emit('game:matching:progress', cancelPayload);
    this.emit('match:progress', {
      pluginId: 'background',
      status: 'cancelled',
      ...cancelPayload,
    });
    this.emit('game:matching:cancelled');
    this.emit('scan:cancelled', { pluginId: 'background' });
  }

  /**
   * Starts autonomous background matching queue with resumption support.
   * Queries unmatched games from storage:
   *   WHERE (otix_media_id IS NULL OR otix_media_id = '') AND (is_app = 0 OR is_app IS NULL)
   * Chunks into bounded batches of 25, runs with 15s per-batch timeouts,
   * falls back to LocalMatcher per chunk on failure, and persists each chunk atomically.
   */
  async startBackgroundMatching(options?: BackgroundMatchingOptions): Promise<void> {
    if (this.isMatchingRunning) {
      console.warn('[Orchestrator] Background matching already in progress — ignoring request');
      return;
    }

    if (options?.signal?.aborted) {
      console.warn('[Orchestrator] startBackgroundMatching called with already aborted signal');
      return;
    }

    const abortController = new AbortController();
    this.matchingAbortController = abortController;
    this.isMatchingRunning = true;

    if (options?.signal) {
      options.signal.addEventListener('abort', () => this.cancelMatching(), { once: true });
    }

    const BATCH_SIZE = options?.batchSize && options.batchSize > 0 ? options.batchSize : 25;
    const rematchAll = !!options?.rematchAll || !!(options as any)?.forceAll || !!(options as any)?.forceRematch;

    try {
      const eligibleGames: GameRow[] = this.getUnmatchedGamesFromStorage({ rematchAll, gameIds: options?.gameIds });
      const totalInLibrary = getGameCount();
      const totalMatched = totalInLibrary - eligibleGames.length;

      if (eligibleGames.length === 0) {
        this.matchingStats = {
          isMatching: false,
          totalUnmatched: 0,
          totalInLibrary,
          totalMatched,
          processed: 0,
          matched: 0,
        };
        this.emitComplete(0, totalInLibrary, 0, 0);
        return;
      }

      this.matchingStats = {
        isMatching: true,
        totalUnmatched: eligibleGames.length,
        totalInLibrary,
        totalMatched,
        processed: 0,
        matched: 0,
      };

      console.log(`[Orchestrator] Starting background matching: ${eligibleGames.length} games to match out of ${totalInLibrary} total in library`);

      const initialPayload: BackgroundMatchingProgressEvent = {
        state: 'running',
        processed: 0,
        total: eligibleGames.length,
        totalInLibrary,
        matched: 0,
        unmatched: eligibleGames.length,
        percent: 0,
        current: 0,
        progress: 0,
      };
      this.lastProgressEmitTime = Date.now();
      this.emit('game:matching:progress', initialPayload);
      this.emit('match:progress', {
        pluginId: 'background',
        status: 'processing',
        totalGames: eligibleGames.length,
        ...initialPayload,
      });

      let processedCount = 0;
      let matchedCount = 0;
      let batchIndex = 0;
      const processedGameIds = new Set<string>();
      let pendingRows: GameRow[] = [...eligibleGames];

      while (pendingRows.length > 0 && !abortController.signal.aborted) {
        const chunkRows = pendingRows.slice(0, BATCH_SIZE);
        pendingRows = pendingRows.slice(BATCH_SIZE);
        for (const r of chunkRows) {
          processedGameIds.add(r.id);
        }
        const scannedChunk: ScannedGame[] = chunkRows.map((r) => this.gameRowToScannedGame(r));
        const chunkSignal = abortController.signal;

        try {
          await this.streamMatchesRemote(scannedChunk, 'background', 'game', chunkSignal, 15_000);
        } catch (remoteErr: any) {
          if (chunkSignal.aborted) break;
          console.warn(`[Orchestrator] Remote match failed for batch ${batchIndex + 1} (${remoteErr?.message || remoteErr}), falling back to offline matcher for this chunk`);
          try {
            await this.streamMatchesLocal(scannedChunk, 'background');
          } catch (localErr: any) {
            console.error('[Orchestrator] Local matcher fallback error for chunk:', localErr);
          }
        }

        if (chunkSignal.aborted) break;

        // Resolve unmatched games via API search & hydration using bounded parallel concurrency (5)
        const unmatchedInChunk = scannedChunk.filter((g) => {
          if (chunkSignal.aborted) return false;
          const matchBefore = getGameMatch(g.platform, g.id);
          return !matchBefore?.otixMediaId;
        });

        if (unmatchedInChunk.length > 0) {
          await runWithConcurrency(unmatchedInChunk, 5, chunkSignal, async (g) => {
            if (chunkSignal.aborted) return;
            try {
              const query = cleanGameTitle(g.title) || g.title;
              let apiCandidates = await this.searchApiCatalog(query);
              if (!apiCandidates || apiCandidates.length === 0) {
                const simplified = query.replace(/[:\-–—].*$/, '').replace(/\b(edition|remastered|remake|game of the year|goty|director'?s cut|deluxe)\b/gi, '').trim();
                if (simplified && simplified.length >= 3 && simplified.toLowerCase() !== query.toLowerCase()) {
                  apiCandidates = await this.searchApiCatalog(simplified);
                }
              }

              if (apiCandidates && apiCandidates.length > 0) {
                const top = apiCandidates[0];
                const candTitle = (top.title || top.name || '').toLowerCase().trim();
                const qLower = query.toLowerCase().trim();
                const isClose = candTitle === qLower || candTitle.includes(qLower) || qLower.includes(candTitle);

                let mediaId = String(top.id || top.mediaId || '');
                let poster = top.posterUrl || top.poster_url || top.images?.poster?.url || null;
                let backdrop = top.backdropUrl || top.backdrop_url || top.images?.backdrop?.url || null;
                let matchedTitle = top.title || top.name || g.title;

                if (mediaId.startsWith('igdb:')) {
                  const imported = await this.importAndHydrateFromApi(mediaId);
                  if (imported?.id) {
                    mediaId = String(imported.id);
                    matchedTitle = imported.title || matchedTitle;
                    poster = imported.poster_url || imported.posterUrl || poster;
                    backdrop = imported.backdrop_url || imported.backdropUrl || backdrop;
                  }
                }

                const targetId = (g as any).rowId || `${g.platform}_${g.id}`;
                if (isClose && mediaId) {
                  upsertGameMatch({
                    source: g.platform,
                    sourceGameId: g.id,
                    otixMediaId: mediaId,
                    otixTitle: matchedTitle,
                    otixPosterUrl: poster || undefined,
                    otixBackdropUrl: backdrop || undefined,
                    otixConfidence: 0.90,
                    matchType: 'auto',
                    status: 'approved',
                  });
                  hydrateGame(
                    targetId,
                    matchedTitle,
                    null,
                    poster || null,
                    top,
                    0.90,
                    mediaId,
                    backdrop || null,
                  );
                  if (this.apiBaseUrl && mediaId) {
                    void downloadAndHydrateGameOffline(targetId, mediaId, matchedTitle, {
                      authToken: this.authToken,
                      apiBaseUrl: this.apiBaseUrl,
                    }).catch(() => {});
                  }
                } else if (apiCandidates.length > 0) {
                  saveMatchSuggestion(targetId, {
                    id: mediaId,
                    title: matchedTitle,
                    posterUrl: poster,
                    backdropUrl: backdrop,
                    confidence: isClose ? 0.85 : 0.70,
                    _candidates: apiCandidates,
                  });
                }
              }
            } catch (unmatchedErr) {
              console.warn(`[Orchestrator] Error resolving unmatched game ${g.title}:`, unmatchedErr);
            }
          });
        }

        // Atomic chunk persistence: commit matches per chunk inside withTransaction using upsertGameMatches
        const chunkMatches: Array<{
          id: string;
          source: string;
          sourceGameId: string;
          otixMediaId: string;
          otixMediaTitle?: string | null;
          otixConfidence?: number | null;
          otixPosterUrl?: string;
          otixBackdropUrl?: string;
        }> = [];

        for (const g of scannedChunk) {
          const m = getGameMatch(g.platform, g.id);
          if (m?.otixMediaId) {
            matchedCount++;
            chunkMatches.push({
              id: (g as any).rowId || `${g.platform}_${g.id}`,
              source: g.platform,
              sourceGameId: g.id,
              otixMediaId: m.otixMediaId,
              otixMediaTitle: m.otixTitle || g.title,
              otixConfidence: m.otixConfidence,
              otixPosterUrl: m.otixPosterUrl,
              otixBackdropUrl: m.otixBackdropUrl,
            });
          }
        }

        if (chunkMatches.length > 0) {
          withTransaction(() => {
            upsertGameMatches(chunkMatches);
          });
        }

        processedCount += chunkRows.length;
        this.matchingStats.processed = processedCount;
        this._lastProcessedCount = processedCount;
        this.matchingStats.matched = matchedCount;

        const currentTitle = scannedChunk[scannedChunk.length - 1]?.title;
        const percent = Math.min(100, Math.round((processedCount / eligibleGames.length) * 100));

        this.emitThrottledProgress({
          state: 'running',
          processed: processedCount,
          total: this.matchingStats.totalUnmatched,
          totalInLibrary: this.matchingStats.totalInLibrary,
          matched: matchedCount,
          unmatched: Math.max(0, this.matchingStats.totalUnmatched - matchedCount),
          percent,
          current: processedCount,
          progress: percent,
          currentItem: currentTitle,
          gameTitle: currentTitle,
        });

        batchIndex++;

        // If all pending rows have been matched and more unmatched games arrived in real time, queue them
        if (pendingRows.length === 0 && !rematchAll && !options?.gameIds && !abortController.signal.aborted) {
          const freshUnmatched = this.getUnmatchedGamesFromStorage({ rematchAll: false });
          const newArrivals = freshUnmatched.filter((g) => !processedGameIds.has(g.id));
          if (newArrivals.length > 0) {
            pendingRows = newArrivals;
            const newTotalInLib = getGameCount();
            this.matchingStats.totalInLibrary = newTotalInLib;
            this.matchingStats.totalUnmatched += newArrivals.length;
          }
        }
      }

      if (!abortController.signal.aborted) {
        this.emitComplete(
          processedCount,
          this.matchingStats.totalInLibrary || totalInLibrary,
          matchedCount,
          this.matchingStats.totalUnmatched || eligibleGames.length,
        );
      }
    } catch (err: any) {
      console.error('[Orchestrator] Background matching engine error:', err);
      this._lastProcessedCount = this.matchingStats.processed;
      const errorPayload: BackgroundMatchingProgressEvent = {
        state: 'error',
        processed: this.matchingStats.processed,
        total: this.matchingStats.totalUnmatched,
        totalInLibrary: this.matchingStats.totalInLibrary,
        matched: this.matchingStats.matched,
        unmatched: Math.max(0, this.matchingStats.totalUnmatched - this.matchingStats.matched),
        percent: this.matchingStats.totalUnmatched > 0
          ? Math.min(100, Math.round((this.matchingStats.processed / this.matchingStats.totalUnmatched) * 100))
          : 0,
        progress: this.matchingStats.totalUnmatched > 0
          ? Math.min(100, Math.round((this.matchingStats.processed / this.matchingStats.totalUnmatched) * 100))
          : 0,
        current: this.matchingStats.processed,
        error: err.message || String(err),
      };
      this.emit('game:matching:progress', errorPayload);
      this.emit('match:progress', {
        pluginId: 'background',
        status: 'failed',
        error: errorPayload.error,
        ...errorPayload,
      });
    } finally {
      if (this.matchingAbortController === abortController) {
        this.isMatchingRunning = false;
        this.matchingAbortController = null;
      }
      notifyGamesChanged();
    }
  }

  /** Alias for startBackgroundMatching */
  async startMatching(options?: BackgroundMatchingOptions): Promise<void> {
    return this.startBackgroundMatching(options);
  }

  private getUnmatchedGamesFromStorage(options?: { rematchAll?: boolean; rematchMissingArtwork?: boolean; gameIds?: string[] }): GameRow[] {
    try {
      const rematchAll = !!options?.rematchAll || !!(options as any)?.forceAll || !!(options as any)?.forceRematch;
      const rematchMissing = !!options?.rematchMissingArtwork;

      if (options?.gameIds && options.gameIds.length > 0) {
        
        const idSet = new Set(options.gameIds);
        const games = getGamesByIds(options.gameIds).filter((g) => idSet.has(g.id));
        if (rematchAll) {
          return games;
        }
        return games.filter((g) => {
          if (!g.otixMediaId || g.otixMediaId === '') return true;
          if (rematchMissing && !g.posterUrl && !g.otixPosterUrl && !g.data?.posterUrl) return true;
          return false;
        });
      }

      if (rematchAll) return getAllGames();
      if (!rematchMissing) return getAllGames({ matched: false });
      const all = getAllGames();

      return all.filter((g) => {
        if (g.isApp) return false;
        if (!g.otixMediaId || g.otixMediaId === '') return true;
        if (rematchMissing && !g.posterUrl && !g.otixPosterUrl && !g.data?.posterUrl) return true;
        return false;
      });
    } catch (err) {
      console.warn('[Orchestrator] Error fetching unmatched games from storage:', err);
      return [];
    }
  }

  private gameRowToScannedGame(row: GameRow): ScannedGame {
    let originalId = row.id;
    let sourcePlatform = (row.platform as string) || 'pc';

    if (row.sources && Array.isArray(row.sources) && row.sources.length > 0) {
      const s = row.sources[0] as any;
      if (typeof s === 'object' && s !== null) {
        if (s.id) originalId = String(s.id);
        if (s.source) sourcePlatform = String(s.source);
      }
    }
    if (originalId.startsWith(`${sourcePlatform}_`)) {
      originalId = originalId.slice(sourcePlatform.length + 1);
    }

    const safeTitle = String(row.title ?? '');
    return {
      id: originalId,
      rowId: row.id,
      title: cleanGameTitle(safeTitle) || safeTitle,
      platform: sourcePlatform,
      installPath: row.installDir,
      exePath: row.exePath,
      posterUrl: row.posterUrl,
      logoUrl: row.logoUrl,
      isDlc: row.isDlc,
      dlcOf: row.dlcOf,
      isBeta: row.isBeta,
      betaOf: row.betaOf,
      isApp: row.isApp,
      gameType: row.gameType,
    };
  }

  private emitThrottledProgress(payload: BackgroundMatchingProgressEvent): void {
    const now = Date.now();
    this.pendingProgressPayload = payload;
    const elapsed = now - this.lastProgressEmitTime;

    if (elapsed >= 100 || payload.percent === 100 || payload.state !== 'running') {
      this.flushProgress();
    } else if (!this.progressTimer) {
      this.progressTimer = setTimeout(() => {
        this.progressTimer = null;
        this.flushProgress();
      }, 100 - elapsed);
      this.progressTimer.unref?.();
    }
  }

  private flushProgress(): void {
    if (this.progressTimer) {
      clearTimeout(this.progressTimer);
      this.progressTimer = null;
    }
    if (this.pendingProgressPayload) {
      const p = this.pendingProgressPayload;
      this.pendingProgressPayload = null;
      this.lastProgressEmitTime = Date.now();
      this.emit('game:matching:progress', p);
      this.emit('match:progress', {
        pluginId: 'background',
        status: p.state === 'running' ? 'processing' : p.state,
        queryTitle: p.currentItem,
        totalGames: p.total,
        current: p.processed,
        progress: p.percent,
        ...p,
      });
    }
  }

  private emitComplete(processed: number, totalInLibrary: number, matched: number, total: number = processed): void {
    this._lastProcessedCount = processed;
    this.matchingStats.processed = processed;
    const completePayload: BackgroundMatchingProgressEvent = {
      state: 'completed',
      processed,
      total,
      totalInLibrary,
      matched,
      unmatched: total - matched,
      percent: 100,
      current: processed,
      progress: 100,
    };
    this.flushProgress();
    this.emit('game:matching:progress', completePayload);
    this.emit('match:progress', {
      pluginId: 'background',
      status: 'completed',
      totalGames: total,
      current: processed,
      progress: 100,
      ...completePayload,
    });
    this.emit('game:matching:complete', completePayload);
    this.emit('scan:complete', {
      pluginId: 'background',
      totalGames: total,
      matched,
      unmatched: total - matched,
    });
  }

  // ── Core scan flow ──────────────────────────────────────────────────

  private async _executeScan(
    pluginId: string,
    mediaType: string,
    scanMethod: string,
    signal: AbortSignal,
  ): Promise<PluginScanResult> {
    ensureGameMatchesTable();
    this.queryIdToGames.clear();

    if (!this.pluginManager) {
      return { pluginId, pluginLabel: pluginId, totalGames: 0, matched: 0, unmatched: 0, errors: ['Plugin manager not initialized'] };
    }

    // Resolve plugin label from any slot
    const plugs = [
      ...this.pluginManager.getPluginsForSlot('matching:scan'),
      ...this.pluginManager.getPluginsForSlot('library:scan'),
    ];
    const plug = plugs.find(p => p.pluginId === pluginId);

    // ponytail: guard against unregistered plugins
    if (!plug) {
      return { pluginId, pluginLabel: pluginId, totalGames: 0, matched: 0, unmatched: 0, errors: [`Plugin "${pluginId}" is not registered in any scan slot`] };
    }

    const label = plug.label || pluginId;

    // ── Phase 1: Run plugin scan ──
    this.emit('scan:progress', { pluginId, phase: 'scanning', current: 0, total: 0 });

    let scanned: ScannedGame[] = [];
    try {
      const raw = await this.pluginManager.callPluginData(pluginId, scanMethod);
      scanned = (raw as { games?: ScannedGame[] })?.games || (raw as ScannedGame[]) || [];
    } catch (err: any) {
      return { pluginId, pluginLabel: label, totalGames: 0, matched: 0, unmatched: 0, errors: [err.message] };
    }

    if (signal.aborted) {
      return { pluginId, pluginLabel: label, totalGames: scanned.length, matched: 0, unmatched: scanned.length, cancelled: true };
    }

    // ── Normalize: deterministic externalIds ──
    scanned = scanned.map(g => ({
      ...g,
      externalIds: this.buildExternalIds(g),
    }));

    console.log(`[Orchestrator] ${pluginId}: ${scanned.length} games, ${scanned.filter(g => g.posterUrl).length} with poster`);

    if (scanned.length === 0) {
      this.emit('scan:complete', { pluginId, totalGames: 0, matched: 0, unmatched: 0 });
      return { pluginId, pluginLabel: label, totalGames: 0, matched: 0, unmatched: 0 };
    }

    // ── Phase 2: Save to local DB ──
    const scanPlatform = scanned[0]?.platform || pluginId;
    upsertGamesForPlatform(scanned.map(g => {
      const plat = g.platform || scanPlatform || pluginId;
      const gameId = g.id || g.appName || Math.random().toString(36).substring(2, 9);
      const isDlc = !!g.isDlc;
      const isBeta = !!g.isBeta;
      const isApp = !!g.isApp;
      const gameType = g.gameType || (isApp ? 'application' : isBeta ? 'beta' : isDlc ? 'dlc_addon' : 'main_game');
      return {
        id: plat + '_' + gameId,
        title: g.title,
        exePath: g.exePath || '',
        installDir: g.installPath || '',
        platform: plat as any,
        posterUrl: g.posterUrl || undefined,
        iconUrl: g.logoUrl || g.posterUrl || undefined,
        isDlc,
        dlcOf: g.dlcOf || undefined,
        isBeta,
        betaOf: g.betaOf || undefined,
        isApp,
        gameType,
        sources: [{ source: plat, id: gameId, developer: g.developer || null, publisher: g.publisher || null, releaseYear: g.releaseYear || null, dlcOf: g.dlcOf || null, isDlc, betaOf: g.betaOf || null, isBeta, isApp, gameType }],
      };
    }), scanPlatform);

    // ── Phase 3: Split matched vs needs-match ──
    const matched: ScannedGame[] = [];
    const needsMatch: ScannedGame[] = [];
    for (const game of scanned) {
      // Applications (non-game software) are stored but never matched against games
      if (game.isApp) continue;
      let found = false;
      for (const eid of (game.externalIds || [])) {
        const existing = getGameMatch(eid.source, eid.id);
        if (existing) { found = true; break; }
      }
      (found ? matched : needsMatch).push(game);
    }

    // ── Phase 3b: Hydrate already-matched from cache ──
    for (const game of matched) {
      const scannedGameId = game.platform + '_' + game.id;
      for (const eid of (game.externalIds || [])) {
        const m = getGameMatch(eid.source, eid.id);
        if (m?.otixMediaId) {
          hydrateGame(scannedGameId, m.otixTitle || game.title, null, m.otixPosterUrl || null,
            { media_item_id: m.otixMediaId, title: m.otixTitle, poster_url: m.otixPosterUrl, confidence: m.otixConfidence },
            m.otixConfidence, m.otixMediaId);
          break;
        }
      }
    }
    if (matched.length > 0) notifyGamesChanged();

    // ── Phase 4: SSE match stream ──
    if (needsMatch.length > 0) {
      // Dispatch progress for already-matched games so counter is accurate
      for (let i = 0; i < matched.length; i++) {
        this.emit('match:progress', {
          pluginId, status: 'matched', totalGames: scanned.length,
          queryId: `${matched[i].platform}:${matched[i].id}`,
          queryTitle: matched[i].title,
        });
      }
      await this.streamMatches(needsMatch, pluginId, mediaType, signal);
    }

    // ── Auto-claim matched games ──
    // (fire-and-forget, non-fatal)

    this.emit('scan:complete', {
      pluginId, totalGames: scanned.length, matched: matched.length, unmatched: needsMatch.length,
    });

    return {
      pluginId, pluginLabel: label,
      totalGames: scanned.length, matched: matched.length, unmatched: needsMatch.length,
    };
  }

  // ── Match stream ────────────────────────────────────────────────────

  /**
   * Match a batch of games. Tries the Otix SSE pipeline first; on any network
   * or backend failure, falls back to offline self-match so the launcher keeps
   * working without the Otix API.
   */
  private async streamMatches(
    games: ScannedGame[],
    pluginId: string,
    mediaType: string,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      await this.streamMatchesRemote(games, pluginId, mediaType, signal);
    } catch (err) {
      if (signal.aborted) return;
      console.warn(`[Orchestrator] Backend match unavailable (${(err as Error).message}), using offline self-match`);
      await this.streamMatchesLocal(games, pluginId);
    }
  }

  /** Otix SSE match pipeline with configurable timeout and abort guard */
  private async streamMatchesRemote(
    games: ScannedGame[],
    pluginId: string,
    mediaType: string,
    signal: AbortSignal,
    timeoutMs: number = 15_000,
  ): Promise<void> {
    if (signal.aborted || games.length === 0) return;

    const requests = games.map(g => ({
      query_id: `${g.platform}:${g.id}`,
      title: cleanGameTitle(g.title) || g.title,
      platform: g.platform,
      platforms: g.platform ? [g.platform] : undefined,
      developer: g.developer || null,
      publisher: g.publisher || null,
      release_year: g.releaseYear || null,
      poster_url: g.posterUrl || null,
      is_dlc: g.isDlc || false,
      dlc_of: g.dlcOf || null,
      is_beta: g.isBeta || false,
      beta_of: g.betaOf || null,
      game_type: g.gameType || (g.isBeta ? 'beta' : g.isDlc ? 'dlc_addon' : 'main_game'),
      external_ids: (g.externalIds && g.externalIds.length > 0)
        ? g.externalIds : [{ source: g.platform, id: g.id }],
      media_type: mediaType,
    }));

    // Track games for persistence callbacks
    for (const g of games) {
      const qid = `${g.platform}:${g.id}`;
      const existing = this.queryIdToGames.get(qid) || [];
      existing.push(g);
      this.queryIdToGames.set(qid, existing);
    }

    const url = new URL(`/api/v1/media/match/stream?hydrate=true&seed_missing=true`, this.apiBaseUrl);
    const body = JSON.stringify({ games: requests });

    try {
      await new Promise<void>((resolve, reject) => {
        const client = url.protocol === 'https:' ? https : http;
        const headers: Record<string, string | number> = {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json',
          'Content-Length': Buffer.byteLength(body),
        };
        if (this.authToken) {
          headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        const req = client.request(url, {
          method: 'POST',
          headers,
          timeout: timeoutMs,
        });

        const onAbort = () => {
          req.destroy();
          resolve(); // clean abort, not an error
        };
        signal.addEventListener('abort', onAbort, { once: true });

        let buffer = '';

        req.on('response', (res) => {
          if (res.statusCode !== 200) {
            let errBody = '';
            res.on('data', (chunk: Buffer) => { errBody += chunk.toString(); });
            res.on('end', () => reject(new Error(`Backend ${res.statusCode}: ${errBody.slice(0, 200)}`)));
            return;
          }
          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            buffer = this.processSseEvents(buffer, pluginId);
          });
          res.on('end', () => {
            if (buffer.trim()) {
              this.processRemainingResponse(buffer, pluginId, games.length);
            }
            resolve();
          });
        });

        req.on('error', (err) => {
          if (signal.aborted) { resolve(); return; }
          reject(err);
        });
        req.on('timeout', () => {
          req.destroy();
          reject(new Error(`SSE batch timeout (${timeoutMs}ms)`));
        });
        req.write(body);
        req.end();
      });
    } finally {
      // Bounded memory lifecycle: remove queryId mappings after batch completes
      for (const g of games) {
        const qid = `${g.platform}:${g.id}`;
        this.queryIdToGames.delete(qid);
      }
    }
  }

  public async searchCatalog(query: string): Promise<any[]> {
    return this.searchApiCatalog(query);
  }

  public async importCatalogIgdb(igdbId: string): Promise<any | null> {
    return this.importAndHydrateFromApi(igdbId);
  }

  /**
   * Offline fallback matcher. First asks `matching:pipeline` slot plugins for
   * match candidates, then applies them (self-matching the remainder) and
   * persists locally, emitting the same match:progress / match:complete events
   * the SSE path would.
   */
  private async searchApiCatalog(query: string): Promise<any[]> {
    if (process.env.NODE_ENV === 'test' || !query || !this.apiBaseUrl) return [];
    const normalizedKey = query.trim().toLowerCase();
    const cached = this.searchCache.get(normalizedKey);
    if (cached && Date.now() - cached.timestamp < GameScanOrchestrator.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const url = new URL(`/api/v1/search?q=${encodeURIComponent(query)}&media_type=game&include_external=true`, this.apiBaseUrl);
      const client = url.protocol === 'https:' ? https : http;
      const items = await new Promise<any[]>((resolve) => {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
        const req = client.request(url, { method: 'GET', headers, timeout: 5000 }, (res) => {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              const parsed = data.items || data.results || (Array.isArray(data) ? data : []);
              resolve(Array.isArray(parsed) ? parsed : []);
            } catch {
              resolve([]);
            }
          });
        });
        req.on('error', () => resolve([]));
        req.on('timeout', () => { req.destroy(); resolve([]); });
        req.end();
      });

      if (this.searchCache.size >= GameScanOrchestrator.MAX_CACHE_ENTRIES) {
        const oldestKey = this.searchCache.keys().next().value;
        if (oldestKey) this.searchCache.delete(oldestKey);
      }
      this.searchCache.set(normalizedKey, { timestamp: Date.now(), data: items });
      return items;
    } catch {
      return [];
    }
  }

  private async importAndHydrateFromApi(igdbIdOrPlaceholder: string): Promise<any | null> {
    if (process.env.NODE_ENV === 'test' || !igdbIdOrPlaceholder || !this.apiBaseUrl) return null;
    const rawId = igdbIdOrPlaceholder.startsWith('igdb:')
      ? igdbIdOrPlaceholder.slice(5)
      : igdbIdOrPlaceholder;
    if (!rawId || !/^\d+$/.test(rawId)) return null;

    const cached = this.hydrateCache.get(rawId);
    if (cached && Date.now() - cached.timestamp < GameScanOrchestrator.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const url = new URL(`/api/v1/media/import/igdb?igdb_id=${encodeURIComponent(rawId)}`, this.apiBaseUrl);
      const client = url.protocol === 'https:' ? https : http;
      const result = await new Promise<any | null>((resolve) => {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
        const req = client.request(url, { method: 'POST', headers, timeout: 10000 }, (res) => {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              resolve(data);
            } catch {
              resolve(null);
            }
          });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.end();
      });

      if (result) {
        if (this.hydrateCache.size >= GameScanOrchestrator.MAX_CACHE_ENTRIES) {
          const oldestKey = this.hydrateCache.keys().next().value;
          if (oldestKey) this.hydrateCache.delete(oldestKey);
        }
        this.hydrateCache.set(rawId, { timestamp: Date.now(), data: result });
      }
      return result;
    } catch {
      return null;
    }
  }

  private async streamMatchesLocal(games: ScannedGame[], pluginId: string): Promise<void> {
    const candidates = await this.queryMatchCandidates(games);
    const results = new LocalMatcher().matchBatch(games, candidates);
    let matched = 0;
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      if (r.status !== 'matched' && this.apiBaseUrl) {
        try {
          const apiCandidates = await this.searchApiCatalog(cleanGameTitle(r.queryTitle) || r.queryTitle);
          if (apiCandidates.length > 0) {
            const top = apiCandidates[0];
            const candTitle = (top.title || top.name || '').toLowerCase().trim();
            const qTitle = (cleanGameTitle(r.queryTitle) || r.queryTitle).toLowerCase().trim();
            const isClose = candTitle === qTitle || candTitle.includes(qTitle) || qTitle.includes(candTitle);
            if (isClose) {
              let poster = top.posterUrl || top.poster_url || top.images?.poster?.url;
              let backdrop = top.backdropUrl || top.backdrop_url || top.images?.backdrop?.url;
              let mediaId = String(top.id || top.mediaId);
              let matchedTitle = top.title || top.name || r.queryTitle;

              if (mediaId.startsWith('igdb:')) {
                const imported = await this.importAndHydrateFromApi(mediaId);
                if (imported?.id) {
                  mediaId = String(imported.id);
                  matchedTitle = imported.title || matchedTitle;
                  poster = imported.poster_url || imported.posterUrl || poster;
                  backdrop = imported.backdrop_url || imported.backdropUrl || backdrop;
                }
              }

              r.status = 'matched';
              r.mediaId = mediaId;
              r.otixTitle = matchedTitle;
              r.otixConfidence = 0.90;
              r.otixPosterUrl = poster;
              r.otixBackdropUrl = backdrop;

              const parts = r.queryId.split(':');
              const plat = parts[0] || 'pc';
              const sId = parts.slice(1).join(':') || r.queryId;
              const matching = games.find((g) => `${g.platform}:${g.id}` === r.queryId);
              const targetId = (matching as any)?.rowId || `${plat}_${sId}`;
              upsertGameMatch({
                source: plat,
                sourceGameId: sId,
                otixMediaId: r.mediaId,
                otixTitle: r.otixTitle,
                otixPosterUrl: poster,
                otixBackdropUrl: backdrop,
                otixConfidence: 0.90,
                matchType: 'auto',
                status: 'approved',
              });
              hydrateGame(
                targetId,
                r.otixTitle || r.queryTitle || '',
                null,
                poster || null,
                top,
                0.90,
                r.mediaId,
                backdrop || null,
              );
              if (this.apiBaseUrl && r.mediaId) {
                void downloadAndHydrateGameOffline(targetId, r.mediaId, r.otixTitle || r.queryTitle, {
                  authToken: this.authToken,
                  apiBaseUrl: this.apiBaseUrl,
                }).catch(() => {});
              }
            }
          }
        } catch {}
      }
      if (r.status === 'matched') matched++;
      const event: GameProgressEvent = {
        pluginId,
        queryId: r.queryId,
        totalGames: games.length,
        status: r.status,
        queryTitle: r.queryTitle,
        match: r.mediaId ? {
          media_item_id: r.mediaId,
          title: r.otixTitle || r.queryTitle,
          confidence: r.otixConfidence ?? 0.95,
          poster_url: r.otixPosterUrl || undefined,
          backdrop_url: r.otixBackdropUrl || undefined,
        } : undefined,
      };
      this.emitThrottledMatchProgress(event, idx === results.length - 1);
    }
    this.flushMatchProgress();
    this.emit('match:complete', {
      pluginId,
      total: games.length,
      matched,
      unmatched: games.length - matched,
      offline: true,
    });
    notifyGamesChanged();
  }

  private emitThrottledMatchProgress(event: GameProgressEvent, force: boolean = false): void {
    const now = Date.now();
    this.pendingMatchProgress = event;
    const elapsed = now - this.lastMatchProgressTime;

    if (elapsed >= 100 || force) {
      this.flushMatchProgress();
    } else if (!this.matchProgressTimer) {
      this.matchProgressTimer = setTimeout(() => {
        this.matchProgressTimer = null;
        this.flushMatchProgress();
      }, 100 - elapsed);
      this.matchProgressTimer.unref?.();
    }
  }

  private flushMatchProgress(): void {
    if (this.matchProgressTimer) {
      clearTimeout(this.matchProgressTimer);
      this.matchProgressTimer = null;
    }
    if (this.pendingMatchProgress) {
      const event = this.pendingMatchProgress;
      this.pendingMatchProgress = null;
      this.lastMatchProgressTime = Date.now();
      this.emit('match:progress', event);
    }
  }

  /**
   * Ask every plugin registered in the `matching:pipeline` slot for match
   * candidates. Plugins that error are skipped — a broken pipeline must not
   * break the offline scan. Earlier-registered plugins win on conflicts.
   */
  private async queryMatchCandidates(games: ScannedGame[]): Promise<Map<string, CatalogMatchCandidate>> {
    if (!this.pluginManager) return new Map();
    const plugins = this.pluginManager.getPluginsForSlot('matching:pipeline');
    if (plugins.length === 0) return new Map();

    const requests = buildCatalogRequests(games);
    const merged = new Map<string, CatalogMatchCandidate>();
    for (const { pluginId: pipelinePluginId } of plugins) {
      try {
        const response = await this.pluginManager.callPluginData(pipelinePluginId, 'catalogMatch', requests);
        for (const [queryId, candidate] of normalizeCatalogResponse(response, requests, pipelinePluginId)) {
          if (!merged.has(queryId)) merged.set(queryId, candidate);
        }
      } catch (err: any) {
        console.warn(`[Orchestrator] matching:pipeline plugin "${pipelinePluginId}" failed: ${err.message}`);
      }
    }
    if (merged.size > 0) {
      console.log(`[Orchestrator] matching:pipeline produced ${merged.size} candidate(s) from ${plugins.length} plugin(s)`);
    }
    return merged;
  }

  // ── SSE parser ──────────────────────────────────────────────────────

  private processSseEvents(buffer: string, pluginId: string): string {
    const parts = buffer.split('\n\n');
    const complete = parts.slice(0, -1);
    const remaining = parts[parts.length - 1];

    for (const block of complete) {
      const trimmed = block.trim();
      if (!trimmed) continue;

      const lines = trimmed.split('\n');
      let eventType = 'message';
      let dataStr = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
      }
      if (!dataStr) continue;

      try {
        if (eventType === 'game-progress') {
          this.handleProgress(dataStr, pluginId);
        } else if (eventType === 'complete') {
          this.emit('match:complete', { pluginId, ...JSON.parse(dataStr) as Record<string, unknown> });
        }
      } catch (err) {
        console.error('[Orchestrator] SSE parse error:', err);
      }
    }
    return remaining;
  }

  private processRemainingResponse(buffer: string, pluginId: string, totalGames: number): void {
    const trimmed = buffer.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return;
    try {
      const data = JSON.parse(trimmed) as any;
      const matches: any[] = Array.isArray(data) ? data : (data.matches || []);
      if (!matches.length) return;

      let matchedCount = 0;
      for (const row of matches) {
        const matchData = row.match || row.auto_match;
        const status = row.status || (matchData?.media_item_id ? 'matched' : 'unmatched');
        if (status === 'matched') matchedCount++;

        this.handleProgress(JSON.stringify({
          query_id: row.query_id || '',
          query_title: row.query_title || '',
          total_games: totalGames,
          status,
          match: matchData,
          candidates: row.candidates || [],
          error: row.error,
        }), pluginId);
      }
      this.emit('match:complete', {
        pluginId,
        total: totalGames,
        matched: matchedCount,
        unmatched: totalGames - matchedCount,
      });
    } catch (err) {
      console.warn('[Orchestrator] Failed to parse batch match response as JSON:', err);
    }
  }

  private handleProgress(dataStr: string, pluginId: string): void {
    let data: any;
    try {
      data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
    } catch (parseErr) {
      console.warn('[Orchestrator] Invalid JSON in handleProgress:', parseErr);
      return;
    }
    if (!data || !data.query_id) return;

    try {
      const event: GameProgressEvent = {
        pluginId, queryId: data.query_id, totalGames: data.total_games,
        status: data.status, queryTitle: data.query_title,
        match: data.match, candidates: data.candidates, error: data.error,
      };
      this.emit('match:progress', event);

      const parts = String(data.query_id).split(':');
      const source = parts[0] || 'unknown';
      const sourceGameId = parts.slice(1).join(':') || data.query_id;
      const scannedGameId = sourceGameId.startsWith(`${source}_`) ? sourceGameId : `${source}_${sourceGameId}`;

      const matchData = data.match || data.auto_match;
      const isMatched = (data.status === 'matched' || (!data.status && matchData?.media_item_id)) && matchData?.media_item_id;

      if (isMatched) {
        const posterUrl = matchData.poster_url || matchData.posterUrl || null;
        const backdropUrl = matchData.backdrop_url || matchData.backdropUrl || null;
        const logoUrl = matchData.logo_url || matchData.logoUrl || null;
        const mediaTitle = matchData.title || data.query_title || '';
        const mediaId = String(matchData.media_item_id);
        const confidence = matchData.confidence != null ? Number(matchData.confidence) : 1.0;
        const hydratedPayload = data.hydrated || matchData;

        const matchingGames = this.queryIdToGames.get(data.query_id) || [];
        if (matchingGames.length > 0) {
          for (const game of matchingGames) {
            const targetId = (game as any).rowId || scannedGameId || game.id;
            try {
              upsertGameMatch({
                source, sourceGameId,
                otixMediaId: mediaId, otixTitle: mediaTitle,
                otixPosterUrl: posterUrl || undefined, otixBackdropUrl: backdropUrl || undefined,
                otixConfidence: confidence, matchType: 'auto', status: 'approved',
              });
              hydrateGame(
                targetId,
                mediaTitle,
                null,
                posterUrl,
                hydratedPayload,
                confidence,
                mediaId,
                backdropUrl,
                null,
                logoUrl,
              );
              if (this.apiBaseUrl && mediaId) {
                void downloadAndHydrateGameOffline(targetId, mediaId, mediaTitle, {
                  authToken: this.authToken,
                  apiBaseUrl: this.apiBaseUrl,
                }).catch(() => {});
              }
            } catch (writeErr) {
              console.warn(`[Orchestrator] Error persisting match for ${targetId}:`, writeErr);
            }
          }
        } else {
          try {
            upsertGameMatch({
              source, sourceGameId,
              otixMediaId: mediaId, otixTitle: mediaTitle,
              otixPosterUrl: posterUrl || undefined, otixBackdropUrl: backdropUrl || undefined,
              otixConfidence: confidence, matchType: 'auto', status: 'approved',
            });
            hydrateGame(
              scannedGameId,
              mediaTitle,
              null,
              posterUrl,
              hydratedPayload,
              confidence,
              mediaId,
              backdropUrl,
              null,
              logoUrl,
            );
            if (this.apiBaseUrl && mediaId) {
              void downloadAndHydrateGameOffline(scannedGameId, mediaId, mediaTitle, {
                authToken: this.authToken,
                apiBaseUrl: this.apiBaseUrl,
              }).catch(() => {});
            }
          } catch (writeErr) {
            console.warn(`[Orchestrator] Error persisting match for ${scannedGameId}:`, writeErr);
          }
        }
        this.tryClaimForPlugin(pluginId, mediaId);
      } else if (data.candidates?.length > 0) {
        try {
          const matchingGames = this.queryIdToGames.get(data.query_id) || [];
          const targetId = (matchingGames[0] as any)?.rowId || scannedGameId;
          const best = data.candidates[0];
          saveMatchSuggestion(targetId, {
            id: best.media_item_id || `${best.provider || 'igdb'}_${best.provider_id || scannedGameId}`,
            title: best.title, posterUrl: best.poster_url || null,
            backdropUrl: best.backdrop_url || null, developer: best.developer || null,
            platforms: best.platforms || [], confidence: best.confidence,
            _candidates: data.candidates,
          });
          // Do not hydrate / overwrite scanned game title or artwork with unconfirmed suggestions.
          notifyGamesChanged();
        } catch (suggErr) {
          console.warn(`[Orchestrator] Error saving suggestion for ${scannedGameId}:`, suggErr);
        }
      }
    } catch (err) {
      console.warn('[Orchestrator] Unexpected error in handleProgress:', err);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  /** Build deterministic external IDs from whatever fields the plugin provides */
  private buildExternalIds(g: ScannedGame): Array<{ source: string; id: string }> {
    if (g.externalIds && g.externalIds.length > 0) return g.externalIds;
    const ids: Array<{ source: string; id: string }> = [];
    ids.push({ source: g.platform || 'unknown', id: String(g.id) });
    if (g.appName) ids.push({ source: g.platform || 'unknown', id: g.appName });
    if (g.catalogItemId) ids.push({ source: g.platform || 'unknown', id: g.catalogItemId });
    return ids;
  }

  private tryClaimForPlugin(pluginId: string, mediaItemId: string): void {
    try {
      const config = this.pluginManager?.getConfig(pluginId);
      if (!config?.mark_as_owned) return;
    } catch { return; }
    if (!this.authToken) return;

    const cleanMediaId = mediaItemId ? String(mediaItemId).trim().replace(/\.0+$/, '') : '';
    if (!cleanMediaId || /^(pc_file_|iso[:_]file_|steam_|rom_|ps\d+_|xbox|switch_|file_)/i.test(cleanMediaId)) return;
    const url = new URL(`/api/v1/media/${cleanMediaId}/claim`, this.apiBaseUrl);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(url, { method: 'POST', headers: { 'Authorization': `Bearer ${this.authToken}` }, timeout: 10_000 });
    req.on('error', (err) => console.warn(`[Orchestrator] Claim failed for ${mediaItemId}:`, err.message));
    req.end();
  }
}
