import http from 'http';
import { URL } from 'url';
import { EventEmitter } from 'events';
import type { PluginManager } from '../plugins/manager';
import {
  getGameMatch,
  upsertGameMatch,
  upsertGames,
  ensureGameMatchesTable,
  hydrateGame,
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

  constructor(
    private pluginManager: PluginManager,
  ) {
    super();
  }

  setApiBaseUrl(url: string): void { this.apiBaseUrl = url; }
  setAuthToken(token: string): void { this.authToken = token; }

  async scanAll(): Promise<ScanSummary> {
    if (this._isScanning) throw new Error('Scan already in progress');
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

      // 4. Send unmatched to backend SSE
      if (needsMatch.length > 0) {
        await this.streamMatches(needsMatch, plugin.pluginId);
      }
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
  }
  }

  async scanPlugin(pluginId: string): Promise<PluginScanResult> {
    if (this._isScanning) throw new Error('Scan already in progress');
    this._isScanning = true;
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

    // Save all scanned games to scanned_games table so library UI has them
    if (scanned.length > 0) {
      upsertGames(scanned.map(g => ({
        id: g.platform + '_' + g.id,
        title: g.title,
        exePath: g.exePath || '',
        installDir: g.installPath || '',
        platform: g.platform as any,
        posterUrl: g.posterUrl || undefined,
        iconUrl: g.posterUrl || undefined,
        sources: [{ source: g.platform, id: g.id }],
      })));
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
  }
  }

  private async streamMatches(games: ScannedGame[], pluginId: string): Promise<void> {
    const requests = games.map((g) => ({
      query_id: `${g.platform}:${g.id}`,
      title: g.title,
      developer: g.developer || null,
      publisher: g.publisher || null,
      release_year: g.releaseYear || null,
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

      let buffer = '';

      req.on('response', (res) => {
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          buffer = this.processSseBuffer(buffer, pluginId);
        });
        res.on('end', () => {
          resolve();
        });
      });

      req.on('error', (err) => {
        console.error('[GameScanOrchestrator] SSE stream error:', err.message);
        reject(err);
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
          const data = JSON.parse(dataStr);
          const event: GameProgressEvent = {
            pluginId,
            queryId: data.query_id,
            status: data.status,
            queryTitle: data.query_title,
            match: data.match,
            candidates: data.candidates,
            error: data.error,
          };
          this.emit('game:matching:progress', event);

          // If matched, persist to game_matches and hydrate scanned_games
          if (data.status === 'matched' && data.match?.media_item_id) {
            const parts = data.query_id.split(':');
            const source = parts[0] || 'unknown';
            const sourceGameId = parts.slice(1).join(':') || data.query_id;
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
              });
              // Also hydrate scanned_games so library UI shows Otix covers
              const scannedGameId = `${source}_${sourceGameId}`;
              hydrateGame(
                scannedGameId,
                data.match.title,
                data.match.icon_url || null,
                data.match.poster_url || null,
                data.match,
              );
              notifyGamesChanged();
            }
          }
        } else if (eventType === 'complete') {
          this.emit('game:matching:complete', { pluginId, ...JSON.parse(dataStr) });
        }
      } catch (err) {
        console.error('[GameScanOrchestrator] Failed to parse SSE event:', err);
      }
    }

    return remaining;
  }

  // Internal: track games per queryId for persistence
  private queryIdToGames = new Map<string, ScannedGame[]>();

  private getGamesForQueryId(queryId: string): ScannedGame[] {
    return this.queryIdToGames.get(queryId) || [];
  }
}
