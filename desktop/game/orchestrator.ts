import http from 'http';
import { URL } from 'url';
import { EventEmitter } from 'events';
import type { PluginManager } from '../plugin-runtime/manager';
import { getApiBaseUrl } from '../config';
import {
  getGameMatch,
  upsertGameMatch,
  upsertGamesForPlatform,
  ensureGameMatchesTable,
  hydrateGame,
  saveMatchSuggestion,
  notifyGamesChanged,
} from './storage';
import { LocalMatcher } from './local-matcher';
import { buildCatalogRequests, normalizeCatalogResponse } from './catalog-match';
import type { CatalogMatchCandidate } from './catalog-match';

// ── Types ──────────────────────────────────────────────────────────────

export interface ScannedGame {
  id: string
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

// ── SSE event buffers (per-request) ────────────────────────────────────

interface SseRequest {
  controller: AbortController
  processed: number
  total: number
}

// ── Orchestrator ───────────────────────────────────────────────────────

export class GameScanOrchestrator extends EventEmitter {
  private apiBaseUrl = getApiBaseUrl();
  private authToken = '';
  /** Per-plugin active scans — only one scan per plugin at a time */
  private activeScans = new Map<string, AbortController>();
  /** Track games per queryId for persistence during SSE stream */
  private queryIdToGames = new Map<string, ScannedGame[]>();

  get isScanning(): boolean { return this.activeScans.size > 0; }

  constructor(
    private pluginManager: PluginManager,
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

  /** Cancel an active plugin scan */
  cancelScan(pluginId?: string): void {
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
    this.emit('scan:cancelled', { pluginId: pluginId || 'all' });
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

  /** Otix SSE match pipeline. */
  private async streamMatchesRemote(
    games: ScannedGame[],
    pluginId: string,
    mediaType: string,
    signal: AbortSignal,
  ): Promise<void> {
    const requests = games.map(g => ({
      query_id: `${g.platform}:${g.id}`,
      title: g.title,
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

    const url = new URL(`/api/v1/media/match/scan?hydrate=true&seed_missing=true`, this.apiBaseUrl);
    const body = JSON.stringify({ games: requests });

    return new Promise<void>((resolve, reject) => {
      const req = http.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Authorization': this.authToken ? `Bearer ${this.authToken}` : '',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 120_000,
      });

      signal.addEventListener('abort', () => {
        req.destroy();
        resolve(); // clean abort, not an error
      });

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
        res.on('end', () => resolve());
      });

      req.on('error', (err) => {
        if (signal.aborted) { resolve(); return; }
        reject(err);
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('SSE timeout')); });
      req.write(body);
      req.end();
    });
  }

  /**
   * Offline fallback matcher. First asks `matching:pipeline` slot plugins for
   * match candidates, then applies them (self-matching the remainder) and
   * persists locally, emitting the same match:progress / match:complete events
   * the SSE path would.
   */
  private async streamMatchesLocal(games: ScannedGame[], pluginId: string): Promise<void> {
    const candidates = await this.queryMatchCandidates(games);
    const results = new LocalMatcher().matchBatch(games, candidates);
    let matched = 0;
    for (const r of results) {
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
      this.emit('match:progress', event);
    }
    this.emit('match:complete', {
      pluginId,
      total: games.length,
      matched,
      unmatched: games.length - matched,
      offline: true,
    });
    notifyGamesChanged();
  }

  /**
   * Ask every plugin registered in the `matching:pipeline` slot for match
   * candidates. Plugins that error are skipped — a broken pipeline must not
   * break the offline scan. Earlier-registered plugins win on conflicts.
   */
  private async queryMatchCandidates(games: ScannedGame[]): Promise<Map<string, CatalogMatchCandidate>> {
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

  private handleProgress(dataStr: string, pluginId: string): void {
    const data = JSON.parse(dataStr) as any;
    const event: GameProgressEvent = {
      pluginId, queryId: data.query_id, totalGames: data.total_games,
      status: data.status, queryTitle: data.query_title,
      match: data.match, candidates: data.candidates, error: data.error,
    };
    this.emit('match:progress', event);

    const parts = data.query_id.split(':');
    const source = parts[0] || 'unknown';
    const sourceGameId = parts.slice(1).join(':') || data.query_id;
    const scannedGameId = `${source}_${sourceGameId}`;

    if (data.status === 'matched' && data.match?.media_item_id) {
      for (const game of this.queryIdToGames.get(data.query_id) || []) {
        upsertGameMatch({
          source, sourceGameId,
          otixMediaId: data.match.media_item_id, otixTitle: data.match.title,
          otixPosterUrl: data.match.poster_url, otixBackdropUrl: data.match.backdrop_url,
          otixConfidence: data.match.confidence, matchType: 'auto', status: 'pending',
        });
        // Save full hydrated data if the backend returned it
        if (data.hydrated) {
          hydrateGame(scannedGameId, data.match.title, null, data.match.poster_url || null,
            data.hydrated, data.match.confidence, data.match.media_item_id);
        } else {
          hydrateGame(scannedGameId, data.match.title, null, data.match.poster_url || null,
            data.match, data.match.confidence, data.match.media_item_id);
        }
        notifyGamesChanged();
      }
      this.tryClaimForPlugin(pluginId, data.match.media_item_id);
    } else if (data.candidates?.length > 0) {
      const best = data.candidates[0];
      saveMatchSuggestion(scannedGameId, {
        id: best.media_item_id || `${best.provider || 'igdb'}_${best.provider_id || scannedGameId}`,
        title: best.title, posterUrl: best.poster_url || null,
        backdropUrl: best.backdrop_url || null, developer: best.developer || null,
        platforms: best.platforms || [], confidence: best.confidence,
        _candidates: data.candidates,
      });
      // Do not hydrate / overwrite scanned game title or artwork with unconfirmed suggestions.
      notifyGamesChanged();
    }
    // unmatched → no persistence needed
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
      const config = this.pluginManager.getConfig(pluginId);
      if (!config?.mark_as_owned) return;
    } catch { return; }
    if (!this.authToken) return;

    const url = new URL(`/api/v1/media/${mediaItemId}/claim`, this.apiBaseUrl);
    const req = http.request(url, { method: 'POST', headers: { 'Authorization': `Bearer ${this.authToken}` }, timeout: 10_000 });
    req.on('error', (err) => console.warn(`[Orchestrator] Claim failed for ${mediaItemId}:`, err.message));
    req.end();
  }
}
