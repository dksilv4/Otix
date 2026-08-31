// Shared game-matching pipeline machinery.
//
// The matching pipeline is the consumer of `catalog-source` services: it
// resolves every scanned game to a stable identity by discovering compatible
// live data sources automatically, collapsing cross-store copies to one
// identity, and self-matching the rest. There is deliberately no bundled
// catalog here. The comparison key lives in this file once instead of in every
// plugin, so every source and the pipeline agree on what "same game" means.
//
// Plugin workers cannot require desktop modules, so this port of
// desktop/game/title-key.ts is self-contained.

const TRADEMARK_RE = /[™®©]/g;
const COMBINING_MARK_RE = /\p{Mn}/gu;
const PUNCT_RE = /[,.;!?()[\]{}]/g;
const WS_RE = /\s+/g;

function normalizeTitle(raw) {
  let clean = raw.replace(TRADEMARK_RE, '');
  clean = clean.normalize('NFKD');
  clean = clean.replace(COMBINING_MARK_RE, '');
  clean = clean.replace(PUNCT_RE, '');
  return clean.replace(WS_RE, ' ').trim();
}

const EDITION_PHRASE =
  '(?:(?:Game of the Year|GOTY|Complete|Enhanced|Deluxe|Definitive|Ultimate|' +
  "Collector'?s|Anniversary|Special|Standard|Gold|Celebration|Day One|" +
  'Digital Deluxe|Remastered)(?:\\s+Edition)(?:\\s+Pack)?)';
const EDITION_MARKERS_RE = new RegExp(
  '\\s*(?:[-–—:]?\\s*)?(?:The\\s+)?' + EDITION_PHRASE + '\\s*$',
  'i',
);
const RELEASE_MARKERS_RE =
  /\s*(?:[-–—:]?\s*)?(?:The Final Cut|Legacy Mode|Re-Elected|Afterlife|Starter Access)\s*$/i;

function stripEditionMarkers(raw) {
  return raw.replace(EDITION_MARKERS_RE, '').replace(RELEASE_MARKERS_RE, '').trim();
}

const ROMAN = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7,
  viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14,
  xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20,
};

function numeralToken(token) {
  const low = token.toLowerCase().replace(/,/g, '');
  if (!low) return null;
  if (low.endsWith('k') && /^\d+$/.test(low.slice(0, -1))) {
    return 'N' + String(parseInt(low.slice(0, -1), 10) * 1000);
  }
  if (/^\d+$/.test(low)) return 'N' + String(parseInt(low, 10));
  if (low in ROMAN) return 'N' + ROMAN[low];
  return null;
}

const NUM_RANGE_RE = /^(.*)\s*[-–—]\s*(.*)$/;

function numeralSeq(token) {
  const low = token.toLowerCase().trim();
  if (!low) return null;
  const out = [];
  for (const part of low.split(/[•·*]/).filter(Boolean)) {
    const m = NUM_RANGE_RE.exec(part);
    if (m) {
      const av = numeralToken(m[1].trim());
      const bv = numeralToken(m[2].trim());
      if (av !== null && bv !== null) {
        const start = parseInt(av.slice(1), 10);
        const end = parseInt(bv.slice(1), 10);
        const step = end >= start ? 1 : -1;
        for (let i = start; step > 0 ? i <= end : i >= end; i += step) out.push('N' + i);
        continue;
      }
    }
    const cv = numeralToken(part);
    if (cv !== null) out.push(cv);
    else return null;
  }
  return out.length > 0 ? out.join(' ') : null;
}

function canonicalNumerals(raw) {
  return raw.split(/\s+/).map((word) => {
    const stripped = word.replace(/^[:;,.!?(){}[\]'"]+|[:;,.!?(){}[\]'"]+$/g, '');
    const marker = numeralSeq(stripped);
    return marker !== null ? marker : word;
  }).join(' ');
}

const STAR_CLAUSE_RE = /\s+(?:Starring|Featuring)\s+.*$/i;
const BULLET_RE = /[•·*]/g;
const SEP_HYPHEN_RE = /\s*[-–—]\s*/g;

function comparisonKey(raw) {
  let t = stripEditionMarkers(raw);
  t = t.replace(STAR_CLAUSE_RE, '');
  t = canonicalNumerals(t);
  t = normalizeTitle(t);
  t = t.replace(BULLET_RE, ' ');
  t = t.replace(SEP_HYPHEN_RE, ' ');
  t = t.replace(/:/g, '');
  return t.replace(WS_RE, ' ').trim().toLowerCase();
}

function slugify(title) {
  return normalizeTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Matching pipeline factory ───────────────────────────────────────────

const SELF_CONFIDENCE = 1.0;
const CATALOG_CONFIDENCE = 0.9;

/**
 * Resolve requests through every registered `catalog-source` service,
 * automatically. A source whose protocol matches an external id the request
 * already carries (e.g. a numeric Steam appid) is a deterministic keyed source
 * and is consulted first; fuzzy title-search sources fill the rest. Within
 * each group sources are sorted by protocol so results are stable regardless
 * of plugin load order. The pipeline consumer needs no hardcoded source list —
 * dropping in a new `catalog-source` plugin makes it a candidate automatically.
 * A throwing/offline source is caught and skipped.
 */
async function resolveViaSources(ctx, requests, resolved, keyedQueryIds) {
  if (typeof ctx?.discover !== 'function' || typeof ctx?.call !== 'function') return;
  let services;
  try {
    services = await ctx.discover('catalog-source');
  } catch {
    return;
  }
  if (!Array.isArray(services) || services.length === 0) return;

  const knownSources = new Set();
  for (const req of requests) {
    for (const ext of req.externalIds || []) knownSources.add(ext.source);
  }
  const byProtocol = (a, b) => (a.protocol < b.protocol ? -1 : a.protocol > b.protocol ? 1 : 0);
  const keyed = services.filter((s) => s.protocol && knownSources.has(s.protocol)).sort(byProtocol);
  const fuzzy = services.filter((s) => !(s.protocol && knownSources.has(s.protocol))).sort(byProtocol);

  let remaining = requests;
  for (const svc of [...keyed, ...fuzzy]) {
    if (remaining.length === 0) break;
    const isKeyed = keyed.includes(svc);
    try {
      const answer = await ctx.call(svc.pluginId, 'resolve', { requests: remaining });
      if (Array.isArray(answer)) {
        for (const item of answer) {
          if (!item || resolved.has(item.queryId)) continue;
          if (!item.candidate) continue;
          resolved.set(item.queryId, item.candidate);
          if (isKeyed) keyedQueryIds.add(item.queryId);
        }
      }
    } catch {
      // A dead source must not break the whole match.
    }
    remaining = requests.filter((req) => !resolved.has(req.queryId));
  }
}

/**
 * Build the `data` object the matching-pipeline plugin exports.
 *
 * The pipeline is the consumer of `catalog-source` services: it resolves every
 * scanned game to a stable identity entirely from live sources — deliberately
 * no bundled index. Sources are discovered automatically via ctx.discover
 * (keyed first, then fuzzy title search, first-wins), then every cross-store
 * copy of a game collapses to one canonical identity (a deterministic keyed
 * source answer wins), and anything still unmatched self-matches to
 * `platform:sourceGameId` with its own artwork. Requires events:subscribe.
 */
function makeMatchingPipeline() {
  return {
    catalogMatch: async (ctx, requests) => {
      const sourced = new Map();
      const keyedQueryIds = new Set();
      await resolveViaSources(ctx, requests, sourced, keyedQueryIds);

      // One canonical candidate per comparison key. Priority: a deterministic
      // keyed source answer (e.g. steam-source resolving a numeric appid) wins
      // over a fuzzy title-search answer, which wins over a plain self-match,
      // so every cross-store copy of a game — sourced or not — resolves to the
      // same mediaId regardless of scan order.
      const canonical = new Map(); // key -> { tier, candidate }
      for (const req of requests) {
        const key = comparisonKey(req.title || '');
        if (!key) continue;
        const cur = canonical.get(key);
        let tier;
        if (sourced.has(req.queryId)) tier = keyedQueryIds.has(req.queryId) ? 0 : 1;
        else tier = (req.title || '').trim() ? 2 : 3;
        if (tier > 2) continue;
        if (cur && tier >= cur.tier) continue;
        const cand = sourced.get(req.queryId) || {
          mediaId: req.queryId,
          title: (req.title || '').trim(),
          posterUrl: req.posterUrl ?? null,
          logoUrl: req.logoUrl ?? null,
          backdropUrl: null,
          confidence: SELF_CONFIDENCE,
        };
        canonical.set(key, { tier, candidate: cand });
      }

      return requests.map((req) => {
        const key = comparisonKey(req.title || '');
        const winner = key && canonical.get(key);
        const own = sourced.get(req.queryId);

        // A copy whose identity is not the canonical one adopts it, keeping its
        // own artwork when the canonical candidate has none.
        if (winner && winner.candidate.mediaId !== req.queryId) {
          const c = winner.candidate;
          return {
            queryId: req.queryId,
            candidate: {
              mediaId: c.mediaId,
              title: c.title || req.title,
              posterUrl: req.posterUrl ?? c.posterUrl ?? null,
              logoUrl: req.logoUrl ?? c.logoUrl ?? null,
              backdropUrl: c.backdropUrl ?? null,
              confidence: c.confidence ?? CATALOG_CONFIDENCE,
            },
          };
        }
        if (own) return { queryId: req.queryId, candidate: own };
        const title = (req.title || '').trim();
        if (!title) return { queryId: req.queryId, candidate: null };
        return {
          queryId: req.queryId,
          candidate: {
            mediaId: req.queryId,
            title,
            posterUrl: req.posterUrl ?? null,
            logoUrl: req.logoUrl ?? null,
            backdropUrl: null,
            confidence: SELF_CONFIDENCE,
          },
        };
      });
    },

    test: async () => ({ passed: true, failures: [] }),
  };
}

module.exports = { comparisonKey, slugify, makeMatchingPipeline };
