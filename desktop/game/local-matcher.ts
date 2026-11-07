import { getGameMatch, getAllGameMatches, upsertGameMatch, hydrateGame } from './storage';
import type { GameMatch } from './storage';
import { comparisonKey } from './title-key';
import type { ScannedGame } from './orchestrator';
import { CATALOG_CONFIDENCE } from './catalog-match';
import type { CatalogMatchCandidate } from './catalog-match';

// ── Types ──────────────────────────────────────────────────────────────

export interface LocalMatchResult {
  queryId: string;
  queryTitle: string;
  source: string;
  sourceGameId: string;
  status: 'matched' | 'unmatched';
  mediaId?: string;
  otixTitle?: string;
  otixPosterUrl?: string | null;
  otixBackdropUrl?: string | null;
  otixConfidence?: number;
}

const SELF_CONFIDENCE = 1.0;
const REUSE_CONFIDENCE = 0.95;

/**
 * Offline match application fallback.
 *
 * Runs when the Otix backend is unreachable. The `matching:pipeline` plugin is
 * the primary matcher (it discovers data sources and self-matches); this class
 * applies its candidates to the batch, persists them, and — when no pipeline
 * plugin is installed — falls back to the comparison-key self-match/dedup so a
 * scan still resolves to local identities with zero plugins.
 */
export class LocalMatcher {
  /**
   * Match an entire batch offline, persisting results to local storage.
   * @param catalog Optional candidates from `matching:pipeline` slot plugins,
   *   keyed by queryId — applied before cross-source reuse and self-match.
   */
  matchBatch(games: ScannedGame[], catalog?: Map<string, CatalogMatchCandidate>): LocalMatchResult[] {
    const { byKey, bySourceId } = this.buildIndexes();
    const results: LocalMatchResult[] = [];
    for (const g of games) {
      try {
        results.push(this.matchOne(g, byKey, bySourceId, catalog));
      } catch (itemErr: any) {
        console.warn(`[LocalMatcher] Error matching item "${String(g?.title ?? '')}" (${g?.id}):`, itemErr);
        results.push({
          queryId: `${g?.platform || 'unknown'}:${String(g?.id ?? '')}`,
          queryTitle: String(g?.title ?? '').trim(),
          source: g?.platform || 'unknown',
          sourceGameId: String(g?.id ?? ''),
          status: 'unmatched',
        });
      }
    }
    return results;
  }

  private buildIndexes(): { byKey: Map<string, GameMatch>; bySourceId: Map<string, GameMatch> } {
    const byKey = new Map<string, GameMatch>();
    const bySourceId = new Map<string, GameMatch>();
    try {
      for (const m of getAllGameMatches()) {
        bySourceId.set(`${m.source}:${m.sourceGameId}`, m);
        if (!m.otixTitle) continue;
        const key = comparisonKey(m.otixTitle);
        const cur = byKey.get(key);
        if (!cur || this.score(m) > this.score(cur)) byKey.set(key, m);
      }
    } catch (err: any) {
      console.warn('[LocalMatcher] Failed to build match indexes:', err);
    }
    return { byKey, bySourceId };
  }

  /** Prefer manual user-confirmed matches, then higher confidence. */
  private score(m: GameMatch): number {
    return (m.matchType === 'manual' ? 100 : 0) + (m.otixConfidence ?? 0);
  }

  private matchOne(
    g: ScannedGame,
    byKey: Map<string, GameMatch>,
    bySourceId: Map<string, GameMatch>,
    catalog?: Map<string, CatalogMatchCandidate>,
  ): LocalMatchResult {
    const source = g?.platform || 'unknown';
    const sourceGameId = String(g?.id ?? '');
    const queryId = `${source}:${sourceGameId}`;
    const rawTitle = typeof g?.title === 'string' ? g.title : String(g?.title ?? '');
    const title = rawTitle.trim();
    const base = { source, sourceGameId, queryId, queryTitle: title };

    // 1) Already matched by exact source id — in-memory index first, fallback to DB
    const existing = bySourceId.get(queryId) || getGameMatch(source, sourceGameId);
    if (existing) {
      return {
        ...base,
        status: 'matched',
        mediaId: existing.otixMediaId,
        otixTitle: existing.otixTitle,
        otixPosterUrl: existing.otixPosterUrl,
        otixBackdropUrl: existing.otixBackdropUrl,
        otixConfidence: existing.otixConfidence,
      };
    }

    if (!title) return { ...base, status: 'unmatched' };

    // 2) A matching:pipeline plugin supplied an identity for this game.
    const catalogMatch = catalog?.get(queryId);
    if (catalogMatch) {
      const confidence = catalogMatch.confidence ?? CATALOG_CONFIDENCE;
      this.persistMatch(
        g, catalogMatch.mediaId, catalogMatch.title,
        catalogMatch.posterUrl || null, catalogMatch.logoUrl || null,
        catalogMatch.backdropUrl || null, confidence, source, sourceGameId,
      );
      // Register so later games in the batch reuse the catalog identity.
      const matchObj: GameMatch = {
        source, sourceGameId, otixMediaId: catalogMatch.mediaId, otixTitle: catalogMatch.title,
        otixPosterUrl: catalogMatch.posterUrl || undefined, otixConfidence: confidence,
        matchType: 'auto', status: 'approved',
      } as GameMatch;
      byKey.set(comparisonKey(catalogMatch.title), matchObj);
      bySourceId.set(queryId, matchObj);
      return {
        ...base,
        status: 'matched',
        mediaId: catalogMatch.mediaId,
        otixTitle: catalogMatch.title,
        otixPosterUrl: catalogMatch.posterUrl ?? null,
        otixBackdropUrl: catalogMatch.backdropUrl ?? null,
        otixConfidence: confidence,
      };
    }

    // 3) Cross-source reuse by comparison key.
    const key = comparisonKey(title);
    const reuse = byKey.get(key);
    if (reuse && !(reuse.source === source && reuse.sourceGameId === sourceGameId)) {
      this.persistMatch(
        g, reuse.otixMediaId, reuse.otixTitle || title,
        reuse.otixPosterUrl || null, g.logoUrl || null, reuse.otixBackdropUrl || null,
        REUSE_CONFIDENCE, source, sourceGameId,
      );
      const reuseObj: GameMatch = {
        source, sourceGameId, otixMediaId: reuse.otixMediaId, otixTitle: reuse.otixTitle || title,
        otixPosterUrl: reuse.otixPosterUrl, otixConfidence: REUSE_CONFIDENCE,
        matchType: 'auto', status: 'approved',
      } as GameMatch;
      bySourceId.set(queryId, reuseObj);
      return {
        ...base,
        status: 'matched',
        mediaId: reuse.otixMediaId,
        otixTitle: reuse.otixTitle || title,
        otixPosterUrl: reuse.otixPosterUrl,
        otixBackdropUrl: reuse.otixBackdropUrl,
        otixConfidence: REUSE_CONFIDENCE,
      };
    }

    // 4) Self-match — local identity using the source game's own artwork.
    const mediaId = queryId;
    const posterUrl = g?.posterUrl || null;
    const logoUrl = g?.logoUrl || null;
    this.persistMatch(g, mediaId, title, posterUrl, logoUrl, null, SELF_CONFIDENCE, source, sourceGameId);
    // Register for later games in the same batch.
    const selfObj: GameMatch = {
      source, sourceGameId, otixMediaId: mediaId, otixTitle: title,
      otixPosterUrl: posterUrl || undefined, otixConfidence: SELF_CONFIDENCE,
      matchType: 'auto', status: 'approved',
    } as GameMatch;
    byKey.set(key, selfObj);
    bySourceId.set(queryId, selfObj);
    return {
      ...base,
      status: 'matched',
      mediaId,
      otixTitle: title,
      otixPosterUrl: posterUrl,
      otixBackdropUrl: null,
      otixConfidence: SELF_CONFIDENCE,
    };
  }

  private persistMatch(
    g: ScannedGame,
    mediaId: string,
    title: string,
    posterUrl: string | null,
    logoUrl: string | null,
    backdropUrl: string | null,
    confidence: number,
    source: string,
    sourceGameId: string,
  ): void {
    try {
      upsertGameMatch({
        source, sourceGameId, otixMediaId: mediaId, otixTitle: title,
        otixPosterUrl: posterUrl || undefined, otixBackdropUrl: backdropUrl || undefined,
        otixConfidence: confidence, matchType: 'auto', status: 'approved',
      });
      const scannedGameId = `${source}_${sourceGameId}`;
      hydrateGame(scannedGameId, title, logoUrl, posterUrl, {
        media_item_id: mediaId, title, confidence, poster_url: posterUrl, logo_url: logoUrl,
      }, confidence, mediaId, backdropUrl || null, null, logoUrl);
    } catch (persistErr: any) {
      console.warn(`[LocalMatcher] Failed to persist match for ${source}:${sourceGameId}:`, persistErr);
    }
  }
}
