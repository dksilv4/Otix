// Plugin `matching:pipeline` slot — the game matching pipeline.
//
// A plugin registered in the `matching:pipeline` slot exports
// `data.catalogMatch(ctx, requests)`: given the scanned games that still need
// a match, it returns a per-game identity (stable mediaId, canonical title,
// optional artwork). The shipped pipeline discovers `catalog-source` services
// automatically, so the desktop orchestrator just calls the slot and persists
// whatever comes back — matching itself lives in plugins.

export interface CatalogMatchRequest {
  /** `${platform}:${gameId}` — the same id the SSE path and LocalMatcher use. */
  queryId: string
  title: string
  platform: string
  externalIds: Array<{ source: string; id: string }>
  developer?: string | null
  publisher?: string | null
  releaseYear?: number | null
  isDlc?: boolean
  isBeta?: boolean
  /** Source-provided artwork the plugin may fall back to when its catalog has none. */
  posterUrl?: string | null
  logoUrl?: string | null
}

export interface CatalogMatchCandidate {
  mediaId: string
  title: string
  posterUrl?: string | null
  backdropUrl?: string | null
  logoUrl?: string | null
  /** Plugin-declared confidence (0..1). Defaults to CATALOG_CONFIDENCE when absent. */
  confidence?: number
  /** Which plugin supplied this candidate (filled in by the orchestrator). */
  sourcePlugin?: string
}

/** One entry per request: a bare candidate, `{ queryId, candidate }`, or null. */
export type CatalogMatchEntry =
  | { queryId?: string; candidate?: CatalogMatchCandidate | null }
  | CatalogMatchCandidate
  | null

export type CatalogMatchResponse = CatalogMatchEntry[]

/** Default confidence when a catalog plugin matches but omits `confidence`. */
export const CATALOG_CONFIDENCE = 0.9

/** Structural slice of ScannedGame the request builder needs. */
export interface CatalogGameSource {
  id?: string | number | null
  title?: string | null
  platform?: string | null
  externalIds?: Array<{ source: string; id: string }>
  developer?: string | null
  publisher?: string | null
  releaseYear?: number | null
  isDlc?: boolean
  isBeta?: boolean
  posterUrl?: string | null
  logoUrl?: string | null
}

export function buildCatalogRequests(games: CatalogGameSource[]): CatalogMatchRequest[] {
  return games.map((g) => {
    const platform = g.platform || 'unknown';
    const id = String(g.id ?? '');
    return {
      queryId: `${platform}:${id}`,
      title: (g.title || '').trim(),
      platform,
      externalIds: g.externalIds || [{ source: platform, id }],
      developer: g.developer ?? null,
      publisher: g.publisher ?? null,
      releaseYear: g.releaseYear ?? null,
      isDlc: !!g.isDlc,
      isBeta: !!g.isBeta,
      posterUrl: g.posterUrl ?? null,
      logoUrl: g.logoUrl ?? null,
    };
  });
}

/**
 * Merge a plugin's `catalogMatch` return into a Map<queryId, candidate>.
 *
 * Tolerant of shape: entries may be null, a bare candidate, or
 * `{ queryId, candidate }`. Entries without a usable mediaId/title are skipped.
 * For duplicate queryIds the first candidate wins, so the orchestrator can
 * merge several plugins with earlier-registered plugins taking precedence.
 */
export function normalizeCatalogResponse(
  response: unknown,
  requests: CatalogMatchRequest[],
  sourcePlugin: string,
): Map<string, CatalogMatchCandidate> {
  const map = new Map<string, CatalogMatchCandidate>();
  if (!Array.isArray(response)) return map;

  (response as CatalogMatchEntry[]).forEach((raw, i) => {
    if (raw == null || typeof raw !== 'object') return;
    const wrapped = raw as { queryId?: string; candidate?: CatalogMatchCandidate | null };
    const candidate = 'candidate' in wrapped ? wrapped.candidate : (raw as CatalogMatchCandidate);
    if (!candidate || typeof candidate !== 'object') return;
    const { mediaId, title } = candidate;
    if (!mediaId || !title) return;

    const queryId = wrapped.queryId || requests[i]?.queryId;
    if (!queryId || map.has(queryId)) return;

    map.set(queryId, { ...candidate, sourcePlugin });
  });
  return map;
}
