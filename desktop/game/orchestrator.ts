import http from 'http';
import { URL } from 'url';
import { EventEmitter } from 'events';
import type { PluginManager } from '../plugins/manager';
import {
  getGameMatch,
  upsertGameMatch,
  upsertGames,
  upsertGamesForPlatform,
  ensureGameMatchesTable,
  hydrateGame,
  saveMatchSuggestion,
  notifyGamesChanged,
} from './storage';
import { scanAllLaunchers as scanHardcodedLaunchers } from './launchers';

export interface ScannedGame {
  id: string
  title: string
  platform: string
  externalIds: Array<{ source: string; id: string }>
  developer?: string
  publisher?: string
  releaseYear?: number
  installPath?: string
  exePath?: string
  posterUrl?: string
  logoUrl?: string
  dlcOf?: string | null
  rawMetadata?: Record<string, unknown>
}

export interface PluginScanResult {
  pluginId: string
  pluginLabel: string
  totalGames: number
  matched: number
  unmatched: number
  errors?: string[]
}

export interface ScanSummary {
  pluginsScanned: number
  totalGames: number
  matched: number
  unmatched: number
  failed: number
  startedAt: number
  completedAt: number
  pluginResults: PluginScanResult[]
}

export interface GameProgressEvent {
  pluginId: string
  queryId: string
  totalGames?: number
  status: 'processing' | 'matched' | 'candidates' | 'failed'
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

export class GameScanOrchestrator extends EventEmitter {
  private apiBaseUrl = process.env.OTIX_BACKEND_URL || 'http://127.0.0.1:8000';
  private authToken = '';
  private _isScanning = false;
  private _scanStartedAt: number | null = null;
  private _activeRequest: http.ClientRequest | null = null;

  get isScanning(): boolean { return this._isScanning; }

  constructor(
    private pluginManager: PluginManager,
  ) {
    super();
  }

  setApiBaseUrl(url: string): void { this.apiBaseUrl = url; }
  setAuthToken(token: string): void { this.authToken = token; }

  async scanAll(): Promise<ScanSummary> {
    if (this._isScanning) {
      console.warn('[GameScanOrchestrator] scanAll called while scan in progress — ignoring');
      return {
        pluginsScanned: 0,
        totalGames: 0,
        matched: 0,
        unmatched: 0,
        failed: 0,
        startedAt: this._scanStartedAt || Date.now(),
        completedAt: Date.now(),
        pluginResults: [],
      };
    }
    this._isScanning = true;
    try {
    ensureGameMatchesTable();
    this.queryIdToGames.clear();

    const startedAt = Date.now();
    const pluginResults: PluginScanResult[] = [];
    const allGames: ScannedGame[] = [];
    let totalUnmatchedCount = 0;

    // 1. Collect all matching:scan plugins
    const plugins = this.pluginManager.getPluginsForSlot('matching:scan');
    const hardcodedResults = await scanHardcodedLaunchers();
    for (const r of hardcodedResults) {
      for (const g of r.games) {
        allGames.push({
          id: g.id,
          title: g.title,
          platform: g.platform || 'pc',
          externalIds: [],
          installPath: g.installDir,
          exePath: g.exePath,
          posterUrl: g.posterUrl,
        });
      }
      // Persist hardcoded launcher results per platform (platform-scoped, no cross-wipe)
      if (r.games.length > 0) {
        const platform = r.games[0].platform || 'pc';
        upsertGamesForPlatform(r.games.map(g => ({
          id: platform + '_' + g.id,
          title: g.title,
          exePath: g.exePath || '',
          installDir: g.installDir || '',
          platform: platform as any,
          posterUrl: g.posterUrl || undefined,
          sources: [{ source: platform, id: g.id }],
        })), platform);
      }
    }

    // 2. Scan each plugin
    for (const plugin of plugins) {
      let scanned: ScannedGame[] = [];
      try {
        const raw = await this.pluginManager.callPluginData(plugin.pluginId, 'scan');
        scanned = (raw as { games?: ScannedGame[] })?.games || (raw as ScannedGame[]) || [];
      } catch (err: any) {
        pluginResults.push({
          pluginId: plugin.pluginId,
          pluginLabel: plugin.label,
          totalGames: 0,
          matched: 0,
          unmatched: 0,
          errors: [err.message],
        });
        continue;
      }

      // 3. Split: already-matched vs needs matching
      const matched: ScannedGame[] = [];
      const needsMatch: ScannedGame[] = [];
      for (const game of scanned) {
        let found = false;
        for (const eid of game.externalIds) {
          const existing = getGameMatch(eid.source, eid.id);
          if (existing) {
            matched.push(game);
            found = true;
            break;
          }
        }
        if (!found) {
          needsMatch.push(game);
        }
      }

      allGames.push(...scanned);
      totalUnmatchedCount += needsMatch.length;

      pluginResults.push({
        pluginId: plugin.pluginId,
        pluginLabel: plugin.label,
        totalGames: scanned.length,
        matched: matched.length,
        unmatched: needsMatch.length,
      });

      // 3b. Persist scanned games so hydrateGame has rows to update
      if (scanned.length > 0) {
        const scanPlatform = scanned[0].platform;
        upsertGamesForPlatform(scanned.map(g => ({
          id: g.platform + '_' + g.id,
          title: g.title,
          exePath: g.exePath || '',
          installDir: g.installPath || '',
          platform: g.platform as any,
          posterUrl: g.posterUrl || undefined,
          iconUrl: g.logoUrl || g.posterUrl || undefined,
          sources: [{ source: g.platform, id: g.id, developer: g.developer || null, publisher: g.publisher || null, releaseYear: g.releaseYear || null, dlcOf: g.dlcOf || null }],
        })), scanPlatform);
      }

      // 4. Send unmatched to backend SSE
      if (needsMatch.length > 0) {
        await this.streamMatches(needsMatch, plugin.pluginId);
      }
    }

    // Final cleanup: remove games no longer present in ANY launcher
    if (allGames.length > 0) {
      upsertGames(allGames.map(g => ({
        id: g.platform + '_' + g.id,
        title: g.title,
        exePath: g.exePath || '',
        installDir: g.installPath || '',
        platform: g.platform as any,
        posterUrl: g.posterUrl || undefined,
        iconUrl: g.logoUrl || g.posterUrl || undefined,
        sources: [{ source: g.platform, id: g.id, developer: g.developer || null, publisher: g.publisher || null, releaseYear: g.releaseYear || null, dlcOf: g.dlcOf || null }],
      })));
    }

    return {
      pluginsScanned: plugins.length + (hardcodedResults.length > 0 ? 1 : 0),
      totalGames: allGames.length,
      matched: allGames.length - totalUnmatchedCount,
      unmatched: totalUnmatchedCount,
      failed: pluginResults.filter(p => (p.errors?.length || 0) > 0).length,
      startedAt,
      completedAt: Date.now(),
      pluginResults,
    };
  } finally {
    this._isScanning = false;
    this._scanStartedAt = null;
    this._activeRequest = null;
  }
  }

  async scanPlugin(pluginId: string): Promise<PluginScanResult> {
    if (this._isScanning) {
      // If scan was started more than 10 minutes ago, force reset
      if (this._scanStartedAt && Date.now() - this._scanStartedAt > 600_000) {
        console.warn('[GameScanOrchestrator] Force-resetting stuck scan lock');
        this._isScanning = false;
        this._activeRequest?.destroy();
        this._activeRequest = null;
      } else {
        console.warn('[GameScanOrchestrator] scanPlugin called while scan in progress — ignoring, progress events still flowing');
        return {
          pluginId,
          pluginLabel: pluginId,
          totalGames: 0,
          matched: 0,
          unmatched: 0,
        };
      }
    }
    this._isScanning = true;
    this._scanStartedAt = Date.now();
    try {
    ensureGameMatchesTable();
    this.queryIdToGames.clear();

    let scanned: ScannedGame[] = [];
    const plugins = this.pluginManager.getPluginsForSlot('matching:scan');
    const plugin = plugins.find((p) => p.pluginId === pluginId);
    if (!plugin) {
      return {
        pluginId,
        pluginLabel: pluginId,
        totalGames: 0,
        matched: 0,
        unmatched: 0,
        errors: ['Plugin not registered for matching:scan slot'],
      };
    }

    try {
      const raw = await this.pluginManager.callPluginData(pluginId, 'scan');
      scanned = (raw as { games?: ScannedGame[] })?.games || (raw as ScannedGame[]) || [];
    } catch (err: any) {
      return {
        pluginId,
        pluginLabel: plugin.label,
        totalGames: 0,
        matched: 0,
        unmatched: 0,
        errors: [err.message],
      };
    }

    // Debug: log how many games have native posterUrl from the plugin
    console.log(`[GameScanOrchestrator] Plugin ${pluginId} returned ${scanned.length} games, ${scanned.filter(g => g.posterUrl).length} with posterUrl`);

    // Save all scanned games to scanned_games table so library UI has them.
    // Use platform-scoped upsert so we don't wipe games from other plugins.
    if (scanned.length > 0) {
      const scanPlatform = scanned[0].platform;
      upsertGamesForPlatform(scanned.map(g => ({
        id: g.platform + '_' + g.id,
        title: g.title,
        exePath: g.exePath || '',
        installDir: g.installPath || '',
        platform: g.platform as any,
        posterUrl: g.posterUrl || undefined,
        iconUrl: g.logoUrl || g.posterUrl || undefined,
        sources: [{ source: g.platform, id: g.id, developer: g.developer || null, publisher: g.publisher || null, releaseYear: g.releaseYear || null, dlcOf: g.dlcOf || null }],
      })), scanPlatform);
    }
    const matched: ScannedGame[] = [];
    const needsMatch: ScannedGame[] = [];
    for (const game of scanned) {
      let found = false;
      for (const eid of game.externalIds) {
        const existing = getGameMatch(eid.source, eid.id);
        if (existing) {
          matched.push(game);
          found = true;
          break;
        }
      }
      if (!found) {
        needsMatch.push(game);
      }
    }

    // Hydrate already-matched games from local cache (no SSE call needed)
    for (const game of matched) {
      const scannedGameId = game.platform + '_' + game.id;
      for (const eid of game.externalIds) {
        const match = getGameMatch(eid.source, eid.id);
        if (match && match.otixMediaId) {
          hydrateGame(
            scannedGameId,
            match.otixTitle || game.title,
            null,
            match.otixPosterUrl || null,
            { media_item_id: match.otixMediaId, title: match.otixTitle, poster_url: match.otixPosterUrl, confidence: match.otixConfidence },
            match.otixConfidence,
            match.otixMediaId,
          );
          break;
        }
      }
    }

    // Notify frontend that cached matches now have Otix images
    if (matched.length > 0) {
      notifyGamesChanged();
    }

    if (needsMatch.length > 0) {
      await this.streamMatches(needsMatch, pluginId);
    }

    return {
      pluginId,
      pluginLabel: plugin.label,
      totalGames: scanned.length,
      matched: matched.length,
      unmatched: needsMatch.length,
    };
  } finally {
    this._isScanning = false;
    this._activeRequest = null;
  }
  }

  cancelScan(): void {
    if (!this._isScanning) return;
    console.warn('[GameScanOrchestrator] Cancelling active scan');
    this._activeRequest?.destroy();
    this._activeRequest = null;
    this._isScanning = false;
    this._scanStartedAt = null;
    this.emit('game:matching:cancelled', {});
  }

  private async streamMatches(games: ScannedGame[], pluginId: string): Promise<void> {
    const requests = games.map((g) => ({
      query_id: `${g.platform}:${g.id}`,
      title: g.title,
      developer: g.developer || null,
      publisher: g.publisher || null,
      release_year: g.releaseYear || null,
      poster_url: g.posterUrl || null,
      external_ids: g.externalIds.length > 0 ? g.externalIds : [{ source: g.platform, id: g.id }],
      media_type: 'game',
    }));

    // Track pending games by query_id so matched events can persist them
    for (const g of games) {
      const qid = `${g.platform}:${g.id}`;
      const existing = this.queryIdToGames.get(qid) || [];
      existing.push(g);
      this.queryIdToGames.set(qid, existing);
    }

    const url = new URL('/api/media/match/stream', this.apiBaseUrl);
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

      this._activeRequest = req;

      let buffer = '';

      req.on('response', (res) => {
        if (res.statusCode !== 200) {
          let body = '';
          res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          res.on('end', () => {
            this._activeRequest = null;
            reject(new Error(`Backend returned ${res.statusCode}: ${body.slice(0, 200)}`));
          });
          return;
        }
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          buffer = this.processSseBuffer(buffer, pluginId);
        });
        res.on('end', () => {
          this._activeRequest = null;
          resolve();
        });
      });

      req.on('error', (err) => {
        // Ignore errors from cancelled requests (req.destroy() triggers an error)
        if (this._activeRequest === null) return;
        console.error('[GameScanOrchestrator] SSE stream error:', err.message);
        this._activeRequest = null;
        reject(err);
      });

      req.on('timeout', () => {
        this._activeRequest = null;
        req.destroy();
        reject(new Error('SSE stream request timed out'));
      });

      req.write(body);
      req.end();
    });
  }

  private processSseBuffer(buffer: string, pluginId: string): string {
    const parts = buffer.split('\n\n');
    // Keep last incomplete part in buffer (it doesn't have a trailing \n\n yet)
    const complete = parts.slice(0, -1);
    const remaining = parts[parts.length - 1];

    for (const block of complete) {
      const trimmed = block.trim();
      if (!trimmed) continue;

      const lines = trimmed.split('\n');
      let eventType = 'message';
      let dataStr = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          dataStr = line.slice(6).trim();
        }
      }

      if (!dataStr) continue;

      try {
        if (eventType === 'game-progress') {
          const data = JSON.parse(dataStr) as any;
          const event: GameProgressEvent = {
            pluginId,
            queryId: data.query_id,
            totalGames: data.total_games,
            status: data.status,
            queryTitle: data.query_title,
            match: data.match,
            candidates: data.candidates,
            error: data.error,
          };
          this.emit('game:matching:progress', event);

          const parts = data.query_id.split(':');
          const source = parts[0] || 'unknown';
          const sourceGameId = parts.slice(1).join(':') || data.query_id;
          const scannedGameId = `${source}_${sourceGameId}`;

          if (data.status === 'matched' && data.match?.media_item_id) {
            // ── Auto-match: persist to game_matches + hydrate scanned_games ──
            for (const game of this.getGamesForQueryId(data.query_id)) {
              upsertGameMatch({
                source,
                sourceGameId,
                otixMediaId: data.match.media_item_id,
                otixTitle: data.match.title,
                otixPosterUrl: data.match.poster_url,
                otixBackdropUrl: data.match.backdrop_url,
                otixConfidence: data.match.confidence,
                matchType: 'auto',
                status: 'pending',
              });
              hydrateGame(
                scannedGameId,
                data.match.title,
                data.match.icon_url || null,
                data.match.poster_url || null,
                data.match,
                data.match.confidence,
                data.match.media_item_id,
              );
              // Backend handles match proposal inline during matching
              notifyGamesChanged();
            }
          } else if (data.status === 'matched' && data.candidates?.length > 0) {
            // ── Candidates only (no auto_match): save as matchSuggestion ──
            const best = data.candidates[0];
            const suggestion = {
              id: best.media_item_id || `${best.provider || 'igdb'}_${best.provider_id || scannedGameId}`,
              title: best.title,
              posterUrl: best.poster_url || null,
              backdropUrl: best.backdrop_url || null,
              developer: best.developer || null,
              platforms: best.platforms || [],
              confidence: best.confidence,
              _candidates: data.candidates,
            };
            saveMatchSuggestion(scannedGameId, suggestion);
            // Also hydrate with best poster for immediate visual feedback
            hydrateGame(
              scannedGameId,
              best.title,
              null,
              best.poster_url || null,
              { candidates: data.candidates, best_candidate: best },
              best.confidence,
            );
            notifyGamesChanged();
          }
          // unmatched → no persistence, frontend shows "unmatched" label
        } else if (eventType === 'complete') {
          this.emit('game:matching:complete', { pluginId, ...JSON.parse(dataStr) as Record<string, unknown> });
        }
      } catch (err) {
        console.error('[GameScanOrchestrator] Failed to parse SSE event:', err);
      }
    }

    return remaining;
  }

  // Fire-and-forget: submit match proposal to backend for admin review
  private proposeOnBackend(
    source: string, sourceGameId: string, mediaItemId: string,
    sourceTitle: string, otixTitle: string, confidence: number,
    matchType: string, developer?: string, releaseYear?: number,
    posterUrl?: string,
  ): void {
    const url = new URL('/api/media/match/propose', this.apiBaseUrl);
    const body = JSON.stringify({
      query_id: `${source}:${sourceGameId}`,
      media_item_id: mediaItemId,
      source_title: sourceTitle,
      developer: developer || null,
      release_year: releaseYear || null,
      poster_url: posterUrl || null,
      otix_title: otixTitle,
      otix_confidence: confidence,
      match_type: matchType,
    });

    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.authToken ? `Bearer ${this.authToken}` : '',
      },
      timeout: 15_000,
    });

    req.on('error', (err) => {
      console.warn('[GameScanOrchestrator] proposeOnBackend failed (non-fatal):', err.message);
    });

    req.write(body);
    req.end();
  }

  // Internal: track games per queryId for persistence
  private queryIdToGames = new Map<string, ScannedGame[]>();

  private getGamesForQueryId(queryId: string): ScannedGame[] {
    return this.queryIdToGames.get(queryId) || [];
  }
}
