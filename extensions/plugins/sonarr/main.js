// Sonarr plugin for Otix. Sonarr v3/v4 API client. Multi-instance TV series
// management:
// - Browse your Sonarr library (getAllLibraries → Library page)
// - Request shows from Otix watchlist (auto + manual request-button). The
//   app only knows a show by its TMDB id, so requests resolve tmdbId → tvdbId
//   via the local sonarr_series mapping table (kept during catalog sync) and,
//   as a fallback, Sonarr's `series/lookup?term=tmdb:<id>` search (v4).
// - Scan every Sonarr series into the local media catalog (shared `media`
//   table, upserted by tvdb_id, media_type='show') — fully offline.
// sonarr_import_log keeps an audit trail per scan.
//
// Framework gotchas handled here:
// - ctx.fetch returns { status, headers, body } where body is a STRING.
//   sonarrFetch() parses it; there is no res.ok / res.json().
// - ctx.config.get/getAll/set and ctx.db.* are RPC round-trips that MUST be
//   awaited.
// - The shared `media` table is NOT declared in db.tables (so it isn't
//   namespace-prefixed sonarr_media); access is granted via the
//   SYSTEM_TABLE_GRANTS `table:media` permission (see plugins/manager.ts).

const API = '/api/v3';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// How often to poll Sonarr's active-download queue and mirror it into the app's
// download framework (matches the activity panel's 15s refresh cadence).
const STATUS_POLL_MS = 15000;

let _pollTimer = null;
let _reconnectTimer = null;
let _statusTimer = null;
let _syncState = { phase: 'idle', current: 0, total: 0, found: 0, imported: 0, skipped: 0, failed: 0, lastSyncAt: null, error: null, paused: false, deferred: 0, running: false };

function baseUrl(i) {
  // Sonarr defaults: 8989 (http) / 443 (https) when the port isn't explicit.
  const port = i.port != null ? ':' + i.port : i.useSsl ? ':443' : ':8989';
  return (i.useSsl ? 'https' : 'http') + '://' + i.host + port + (i.baseUrl || '');
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// undici collapses network failures into the opaque "fetch failed"; the real
// reason lives in e.cause (ECONNRESET, ENOTFOUND, cert, timeout, ...). Surface
// it so errors recorded in request history are actionable.
function describeFetchError(e) {
  const cause = (e && e.cause) || e;
  if (cause && cause.code) {
    const detail = cause.message && cause.message !== cause.code ? ': ' + cause.message : '';
    return cause.code + detail;
  }
  if (cause && cause.message) return cause.message;
  return (e && e.message) || 'unknown error';
}

async function sonarrFetch(ctx, instance, path, opts) {
  const headers = Object.assign({ 'X-Api-Key': instance.apiKey }, (opts && opts.headers) || {});
  let body;
  if (opts && opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const url = baseUrl(instance) + path;
  let res = null;
  let lastErr = null;
  // Retry once after a short pause on network-level failures (DNS/TLS/reset/conn
  // refused). Sonarr is idempotent on tvdbId, so a re-sent POST is safe.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await ctx.fetch(url, Object.assign({}, opts, { headers, body }));
      break;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!res) {
    throw new Error('Sonarr connection to ' + (instance.name || instance.id) + ' failed: ' + describeFetchError(lastErr));
  }
  let data = null;
  if (res && res.body) {
    try {
      data = JSON.parse(res.body);
    } catch (e) {
      data = res.body;
    }
  }
  return { status: res ? res.status : 0, data };
}

async function getInstances(ctx) {
  const cfg = await ctx.config.getAll();
  return cfg && Array.isArray(cfg.instances) ? cfg.instances : [];
}

async function getEnabled(ctx) {
  const all = await getInstances(ctx);
  return all.filter((i) => i.enabled);
}

function normalizeSeries(s, base) {
  return {
    id: s.id,
    title: s.title,
    year: s.year,
    tvdbId: s.tvdbId,
    tmdbId: s.tmdbId,
    images: (s.images || []).map((img) => ({
      coverType: img.coverType,
      remoteUrl: img.remoteUrl || base + img.url,
    })),
  };
}

// ── request-series internals ───────────────────────────────────────────

async function resolveQualityProfile(ctx, instance, explicit) {
  if (explicit) return explicit;
  try {
    const res = await sonarrFetch(ctx, instance, API + '/qualityprofile');
    if (res.status === 200 && Array.isArray(res.data)) {
      const cfgProfile = instance.qualityProfile;
      if (cfgProfile) {
        const byName = res.data.find((p) => String(p.name).toLowerCase() === String(cfgProfile).toLowerCase());
        if (byName) return byName.id;
        const byId = res.data.find((p) => String(p.id) === String(cfgProfile));
        if (byId) return byId.id;
      }
      if (res.data.length > 0) return res.data[0].id;
    }
  } catch (e) {
    ctx.logger.warn('Quality profile lookup failed: ' + e.message);
  }
  return 1;
}

// Sonarr v3 requires languageProfileId on the add payload; v4 removed language
// profiles entirely. Best-effort resolve: null on v4 → the field is omitted.
async function resolveLanguageProfile(ctx, instance, explicit) {
  if (explicit) return explicit;
  try {
    const res = await sonarrFetch(ctx, instance, API + '/languageprofile');
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      const cfgProfile = instance.languageProfile;
      if (cfgProfile) {
        const byName = res.data.find((p) => String(p.name).toLowerCase() === String(cfgProfile).toLowerCase());
        if (byName) return byName.id;
      }
      return res.data[0].id;
    }
  } catch (e) {
    /* v4 — no language profiles */
  }
  return null;
}

async function resolveRootFolder(ctx, instance, explicit) {
  if (explicit) return explicit;
  if (instance.rootFolder) return instance.rootFolder;
  try {
    const res = await sonarrFetch(ctx, instance, API + '/rootfolder');
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      return res.data[0].path;
    }
  } catch (e) {
    ctx.logger.warn('Root folder lookup failed: ' + e.message);
  }
  return null;
}

// Local request log (sonarr_requests) — records every show requested on a
// Sonarr instance so the app can show "which media has been requested".
async function recordRequest(ctx, entry) {
  try {
    await ctx.db.run(
      'INSERT INTO sonarr_requests (tvdb_id, tmdb_id, title, instance_id, instance_name, status, source, already_exists, error, requested_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tvdb_id, instance_id) DO UPDATE SET tmdb_id=excluded.tmdb_id, title=excluded.title, instance_name=excluded.instance_name, status=excluded.status, source=excluded.source, already_exists=excluded.already_exists, error=excluded.error, requested_at=excluded.requested_at',
      [
        entry.tvdb_id != null ? String(entry.tvdb_id) : null,
        entry.tmdb_id != null ? String(entry.tmdb_id) : null,
        entry.title || null,
        entry.instance_id || null,
        entry.instance_name || null,
        entry.status,
        entry.source || 'manual',
        entry.already_exists ? 1 : 0,
        entry.error || null,
        entry.requested_at || Date.now(),
      ]
    );
  } catch (e) {
    ctx.logger.warn('Failed to record request: ' + e.message);
  }
}

// Authoritative in-library check: GET /series?tvdbId= returns the matching
// series (or an empty array when absent). A series counts as downloaded when
// any episode file exists. Returns null when the library endpoint is
// unreachable/unsupported.
async function seriesStatusOnInstance(ctx, instance, tvdbId) {
  try {
    const res = await sonarrFetch(ctx, instance, API + '/series?tvdbId=' + tvdbId);
    if (res.status !== 200 || !Array.isArray(res.data)) return null;
    const s = res.data.find((x) => String(x.tvdbId) === String(tvdbId));
    if (!s) return { found: false };
    const stats = (s && s.statistics) || {};
    const downloaded = (stats.episodeFileCount || 0) > 0;
    return { found: true, downloaded, file: fileFromSeries(s), series: s };
  } catch (e) {
    return null;
  }
}

function fileFromSeries(s) {
  const stats = (s && s.statistics) || null;
  if (!stats) return null;
  return {
    name: null,
    size: stats.sizeOnDisk != null ? stats.sizeOnDisk : null,
    quality: null,
    video: null,
    audio: null,
  };
}

// Map a TMDB id (what the app hands us) to a Sonarr series resource. Tries the
// local sonarr_series mapping first, then Sonarr's `tmdb:` lookup (v4). On v3
// without `tmdb:` support, falls back to a title search when we know the title.
async function seriesLookupByTmdb(ctx, instance, tmdbId) {
  try {
    const res = await sonarrFetch(ctx, instance, API + '/series/lookup?term=' + encodeURIComponent('tmdb:' + tmdbId));
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      const s = res.data.find((x) => x.tmdbId != null && String(x.tmdbId) === String(tmdbId)) || res.data[0];
      if (s) return s;
    }
  } catch (e) {
    ctx.logger.warn('Sonarr tmdb lookup failed: ' + e.message);
  }
  try {
    const row = await ctx.db.get('SELECT title FROM sonarr_series WHERE tmdb_id = ? LIMIT 1', [String(tmdbId)]);
    if (row && row.title) {
      const res = await sonarrFetch(ctx, instance, API + '/series/lookup?term=' + encodeURIComponent(row.title));
      if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
        const s = res.data.find((x) => x.tmdbId != null && String(x.tmdbId) === String(tmdbId)) || res.data[0];
        if (s) return s;
      }
    }
  } catch (e) {
    ctx.logger.warn('Sonarr title lookup failed: ' + e.message);
  }
  return null;
}

// Lightweight tvdbId resolution for status checks — mapping table, then lookup.
async function resolveTvdbId(ctx, instance, tmdbId) {
  try {
    const row = await ctx.db.get('SELECT tvdb_id FROM sonarr_series WHERE tmdb_id = ? LIMIT 1', [String(tmdbId)]);
    if (row && row.tvdb_id) return String(row.tvdb_id);
  } catch (e) { /* fall through to lookup */ }
  const series = await seriesLookupByTmdb(ctx, instance, tmdbId);
  return series && series.tvdbId != null ? String(series.tvdbId) : null;
}

async function requestSeriesOnInstance(ctx, instance, tmdbId, overrides) {
  const source = (overrides && overrides.source) || 'manual';
  try {
    const series = await seriesLookupByTmdb(ctx, instance, tmdbId);
    if (!series || series.tvdbId == null) {
      const error = 'No series found for TMDB id ' + tmdbId;
      await recordRequest(ctx, { tvdb_id: null, tmdb_id: tmdbId, instance_id: instance.id, instance_name: instance.name, status: 'error', source, error });
      return { success: false, error };
    }
    const tvdbId = String(series.tvdbId);

    // lookup/tmdb can report an id even when not added, so verify against the
    // library list before POSTing.
    const libStatus = await seriesStatusOnInstance(ctx, instance, tvdbId);
    const inLibrary = libStatus === null ? Boolean(series.id) : libStatus.found;
    if (inLibrary) {
      await recordRequest(ctx, { tvdb_id: tvdbId, tmdb_id: tmdbId, title: series.title, instance_id: instance.id, instance_name: instance.name, status: 'exists', source, already_exists: true });
      return { success: true, alreadyExists: true, message: 'Already in library' };
    }

    const qualityProfileId = await resolveQualityProfile(ctx, instance, overrides && overrides.qualityProfile);
    const languageProfileId = await resolveLanguageProfile(ctx, instance, overrides && overrides.languageProfile);
    const rootFolderPath = await resolveRootFolder(ctx, instance, overrides && overrides.rootFolder);
    if (!rootFolderPath) {
      const error = 'No root folder path configured';
      await recordRequest(ctx, { tvdb_id: tvdbId, tmdb_id: tmdbId, title: series.title, instance_id: instance.id, instance_name: instance.name, status: 'error', source, error });
      return { success: false, error };
    }

    const addBody = {
      title: series.title,
      titleSlug: series.titleSlug || slugify(series.title),
      images: series.images || [],
      tvdbId: parseInt(tvdbId, 10),
      year: series.year,
      qualityProfileId,
      rootFolderPath,
      monitored: true,
      seasonFolder: true,
      seriesType: series.seriesType || 'standard',
      addOptions: { searchForMissingEpisodes: true },
    };
    if (series.tmdbId != null) addBody.tmdbId = series.tmdbId;
    if (languageProfileId != null) addBody.languageProfileId = languageProfileId;

    const add = await sonarrFetch(ctx, instance, API + '/series', { method: 'POST', body: addBody });
    if (add.status >= 200 && add.status < 300) {
      await recordRequest(ctx, { tvdb_id: tvdbId, tmdb_id: tmdbId, title: series.title, instance_id: instance.id, instance_name: instance.name, status: 'requested', source });
      try {
        ctx.notifications.send({ title: 'Sonarr Request Successful', body: 'Requested ' + series.title + ' on ' + instance.name + '.' });
      } catch (e) { /* notifications best-effort */ }
      return { success: true, message: 'Requested on ' + instance.name };
    }
    const rawBody = typeof add.data === 'string' ? add.data : JSON.stringify(add.data || {});
    if (add.status >= 400 && /already been added|already exists|already in library/i.test(rawBody)) {
      await recordRequest(ctx, { tvdb_id: tvdbId, tmdb_id: tmdbId, title: series.title, instance_id: instance.id, instance_name: instance.name, status: 'exists', source, already_exists: true });
      return { success: true, alreadyExists: true, message: 'Already in library' };
    }
    const error = 'Sonarr API error: ' + rawBody;
    await recordRequest(ctx, { tvdb_id: tvdbId, tmdb_id: tmdbId, title: series.title, instance_id: instance.id, instance_name: instance.name, status: 'error', source, error });
    return { success: false, error };
  } catch (e) {
    await recordRequest(ctx, { tvdb_id: null, tmdb_id: tmdbId, instance_id: instance.id, instance_name: instance.name, status: 'error', source, error: e.message });
    return { success: false, error: e.message };
  }
}

// ── import log (sonarr_import_log table) ───────────────────────────────

async function recordImportLog(ctx, entry) {
  try {
    await ctx.db.run(
      'INSERT OR REPLACE INTO sonarr_import_log (tvdb_id, instance_id, otix_media_id, status, title, error, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        String(entry.tvdb_id),
        entry.instance_id || null,
        entry.otix_media_id || null,
        entry.status,
        entry.title || null,
        entry.error || null,
        entry.imported_at || Date.now(),
      ]
    );
  } catch (e) {
    ctx.logger.warn('Failed to record import log: ' + e.message);
  }
}

// ── local media catalog (shared `media` table) ─────────────────────────

// Idempotent upsert keyed by (provider, media_type, provider_id). Requires
// `table:media` permission (auto-granted via SYSTEM_TABLE_GRANTS).
const MEDIA_UPSERT = `
  INSERT INTO media (provider, provider_id, media_type, title, year, overview, poster_url, backdrop_url, genres, runtime, rating, status, file_path, source_instance, source_instance_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(provider, media_type, provider_id) DO UPDATE SET
    title=excluded.title, year=excluded.year, overview=excluded.overview, poster_url=excluded.poster_url,
    backdrop_url=excluded.backdrop_url, genres=excluded.genres, runtime=excluded.runtime, rating=excluded.rating,
    status=excluded.status, file_path=excluded.file_path, source_instance=excluded.source_instance,
    source_instance_id=excluded.source_instance_id, updated_at=datetime('now')
`;

// Plugin-owned mapping/status mirror keyed by tvdb_id. Keeps the TMDB id (the
// app's native key for shows) alongside Sonarr's tvdb_id so requests and slot
// status checks can translate tmdbId → tvdbId offline.
const SONARR_SERIES_UPSERT = `
  INSERT INTO sonarr_series (tvdb_id, tmdb_id, instance_id, instance_name, title, year, overview, poster_url, genres, runtime, rating, status, file_path, added_at, size_on_disk, monitored, episode_count, episode_file_count)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(tvdb_id) DO UPDATE SET
    tmdb_id=excluded.tmdb_id, instance_id=excluded.instance_id, instance_name=excluded.instance_name,
    title=excluded.title, year=excluded.year, overview=excluded.overview, poster_url=excluded.poster_url,
    genres=excluded.genres, runtime=excluded.runtime, rating=excluded.rating, status=excluded.status,
    file_path=excluded.file_path, added_at=excluded.added_at,
    size_on_disk=excluded.size_on_disk, monitored=excluded.monitored,
    episode_count=excluded.episode_count, episode_file_count=excluded.episode_file_count
`;

function seriesToMediaRow(s, instance) {
  const images = s.images || [];
  const poster = images.find((i) => i.coverType === 'poster');
  const fanart = images.find((i) => i.coverType === 'fanart') || images.find((i) => i.coverType === 'banner');
  const stats = (s && s.statistics) || {};
  return {
    provider: 'tvdb',
    provider_id: String(s.tvdbId),
    media_type: 'show',
    title: s.title || null,
    year: s.year || null,
    overview: s.overview || null,
    poster_url: (poster && (poster.remoteUrl || poster.url)) || null,
    backdrop_url: (fanart && (fanart.remoteUrl || fanart.url)) || null,
    genres: Array.isArray(s.genres) && s.genres.length ? JSON.stringify(s.genres) : null,
    runtime: s.runtime || null,
    rating: typeof s.rating === 'number' ? s.rating : null,
    status: (stats.episodeFileCount || 0) > 0 ? 'downloaded' : 'missing',
    file_path: s.path || null,
    source_instance: instance.name || null,
    source_instance_id: instance.id || null,
  };
}

async function upsertSeries(ctx, s, instance) {
  const r = seriesToMediaRow(s, instance);
  const stats = (s && s.statistics) || {};
  const res = await ctx.db.run(MEDIA_UPSERT, [
    r.provider, r.provider_id, r.media_type, r.title, r.year, r.overview,
    r.poster_url, r.backdrop_url, r.genres, r.runtime, r.rating, r.status,
    r.file_path, r.source_instance, r.source_instance_id,
  ]);
  const rowId = res && (res.lastInsertRowid != null ? res.lastInsertRowid : res.lastID);
  const mediaId = rowId != null ? String(rowId) : null;
  try {
    await ctx.db.run(SONARR_SERIES_UPSERT, [
      String(s.tvdbId),
      s.tmdbId != null ? String(s.tmdbId) : null,
      instance.id || null,
      instance.name || null,
      s.title || null,
      s.year || null,
      s.overview || null,
      r.poster_url,
      r.genres,
      s.runtime || null,
      r.rating,
      r.status,
      s.path || null,
      Date.now(),
      s.sizeOnDisk != null ? s.sizeOnDisk : stats.sizeOnDisk != null ? stats.sizeOnDisk : null,
      s.monitored ? 1 : 0,
      stats.episodeCount || 0,
      stats.episodeFileCount || 0,
    ]);
  } catch (e) {
    ctx.logger.warn('Failed to upsert sonarr_series: ' + e.message);
  }
  return { mediaId };
}

// ── network-pause / auto-resume helpers ────────────────────────────────
// The only external dependency is Sonarr itself — the catalog write is local.
// When every Sonarr instance drops mid-scan, we pause with an honest,
// retryable state instead of churning the whole library into "failed" (or
// claiming a misleading success). The scan is idempotent (upsert), so a
// reconnect watcher simply re-runs it once a Sonarr instance is reachable.

function isNetworkError(e) {
  const s =
    String((e && e.message) || e || '') +
    ' ' +
    String((e && e.cause && e.cause.message) || '');
  return /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNABORTED|ENETUNREACH|EHOSTUNREACH|ECONNRESET|socket hang up|getaddrinfo|network.*unreachable/i.test(
    s
  );
}

function stopReconnect() {
  if (_reconnectTimer) {
    clearInterval(_reconnectTimer);
    _reconnectTimer = null;
  }
}

// Poll the enabled Sonarr instances until one answers, then re-run the scan.
// Idempotent upserts make the resume a plain re-scan.
function startReconnect(ctx) {
  if (_reconnectTimer) return;
  _reconnectTimer = setInterval(async () => {
    if (_syncState.running) return;
    try {
      const enabled = await getEnabled(ctx);
      if (enabled.length === 0) return; // nothing to reconnect to
      let reachable = false;
      for (const inst of enabled) {
        try {
          const res = await sonarrFetch(ctx, inst, API + '/system/status');
          if (res.status === 200) {
            reachable = true;
            break;
          }
        } catch (e) {
          // try next instance
        }
      }
      if (!reachable) return; // still offline
    } catch (e) {
      return; // still offline
    }
    stopReconnect();
    ctx.logger.info('Sonarr reachable again — resuming library scan');
    syncLibrary(ctx).catch((e) => ctx.logger.warn('Resume scan failed: ' + e.message));
  }, 15000);
}

function pauseForNetwork(ctx, summary, current, total) {
  const deferred = Math.max(0, total - current);
  const message = 'Network unreachable — sync paused' + (deferred > 0 ? ', ' + deferred + ' queued' : '');
  Object.assign(_syncState, { phase: 'paused', paused: true, error: message, deferred });
  const pausedSummary = Object.assign({}, summary, { paused: true, deferred, lastSyncAt: Date.now() });
  try {
    ctx.config.set('_sonarr_last_sync', JSON.stringify(pausedSummary));
  } catch (e) {
    ctx.logger.warn('Failed to persist paused sync: ' + e.message);
  }
  try {
    ctx.activity.publish({
      id: 'sonarr-sync',
      type: 'sync',
      title: 'Sonarr → Otix sync',
      subtitle: 'Offline — paused',
      status: 'error',
      progress: Math.round((current / Math.max(1, total)) * 100),
      icon: 'tv',
    });
  } catch (e) {
    /* activity is best-effort */
  }
  startReconnect(ctx);
  return { success: false, paused: true, deferred, error: message, ...pausedSummary };
}

// ── sync run log (sonarr_sync_log table) ───────────────────────────────
// Every sync.now run gets a row so the settings page can show per-run
// history: counts, success/paused, and the full per-series failure list.

async function beginSyncRun(ctx) {
  try {
    const enabled = await getEnabled(ctx);
    const res = await ctx.db.run(
      'INSERT INTO sonarr_sync_log (instance_id, started_at) VALUES (?, ?)',
      [enabled.map((i) => i.id).join(',') || null, Date.now()]
    );
    const runId = res && (res.lastInsertRowid != null ? res.lastInsertRowid : res.lastID);
    return runId != null ? String(runId) : null;
  } catch (e) {
    ctx.logger.warn('Failed to create sync log row: ' + e.message);
    return null;
  }
}

async function finalizeRun(ctx, runId, data) {
  if (runId == null) return;
  try {
    await ctx.db.run(
      'UPDATE sonarr_sync_log SET finished_at = ?, success = ?, paused = ?, found = ?, imported = ?, skipped = ?, failed = ?, errors = ?, message = ? WHERE id = ?',
      [
        data.finishedAt != null ? data.finishedAt : Date.now(),
        data.success ? 1 : 0,
        data.paused ? 1 : 0,
        data.found || 0,
        data.imported || 0,
        data.skipped || 0,
        data.failed || 0,
        Array.isArray(data.errors) && data.errors.length ? JSON.stringify(data.errors) : null,
        data.message || null,
        runId,
      ]
    );
  } catch (e) {
    ctx.logger.warn('Failed to finalize sync log row: ' + e.message);
  }
}

// ── scan library → local media catalog ─────────────────────────────────

// Pass 1: fetch every enabled instance's series list. Mutates `summary` with
// per-instance errors and the total `found` count; returns whether any fetch
// failed with a network-level error.
async function fetchAllInstances(ctx, enabled, summary) {
  const batches = [];
  let sawNetworkError = false;
  for (const instance of enabled) {
    let series = [];
    let fetchError = null;
    try {
      const res = await sonarrFetch(ctx, instance, API + '/series');
      if (res.status !== 200) fetchError = 'HTTP ' + res.status;
      else series = res.data || [];
    } catch (e) {
      fetchError = e.message;
      if (isNetworkError(e)) sawNetworkError = true;
    }
    if (fetchError) {
      summary.errors.push(instance.name + ': ' + fetchError);
      continue;
    }
    batches.push({ instance, series });
    summary.found += series.length;
  }
  return { batches, sawNetworkError };
}

async function syncLibrary(ctx, opts) {
  if (_syncState.running) return { success: false, alreadyRunning: true, error: 'A sync is already running' };
  const instanceId = opts && opts.instanceId ? String(opts.instanceId) : null;
  stopReconnect();
  _syncState.running = true;
  Object.assign(_syncState, { phase: 'running', current: 0, total: 0, found: 0, imported: 0, skipped: 0, failed: 0, lastSyncAt: null, error: null, paused: false, deferred: 0 });
  const runId = await beginSyncRun(ctx);
  const runErrors = [];

  // Live activity-panel item, updated with progress while syncing. Throttled to
  // ~2% steps so a large library doesn't spam RPC publishes per series.
  let lastPublishPct = -1;
  const publishActivity = (pct, status, subtitle) => {
    if (status === 'active' && pct - lastPublishPct < 2 && pct < 100) return;
    lastPublishPct = pct;
    try {
      ctx.activity.publish({
        id: 'sonarr-sync',
        type: 'sync',
        title: 'Sonarr → Otix sync',
        subtitle: subtitle,
        status: status,
        progress: pct,
        icon: 'tv',
      });
    } catch (e) {
      /* activity is best-effort */
    }
  };

  try {
    const enabled = await getEnabled(ctx);
    const targets = instanceId ? enabled.filter((i) => String(i.id) === instanceId) : enabled;
    if (targets.length === 0) {
      const err = instanceId ? 'Instance not found or not enabled' : 'No enabled Sonarr instances';
      Object.assign(_syncState, { phase: 'error', error: err });
      publishActivity(0, 'error', err);
      await finalizeRun(ctx, runId, { success: false, message: err, errors: runErrors });
      return { success: false, error: err };
    }

    // Pass 1: fetch every instance's series so the total is known up front.
    // Transient startup/network hiccups (e.g. DNS warm-up right after app
    // launch) shouldn't flip the whole sync to "offline" — retry with a short
    // backoff before falling through to the network-pause path.
    const summary = { instances: targets.length, found: 0, imported: 0, skipped: 0, failed: 0, errors: [] };
    let { batches, sawNetworkError } = await fetchAllInstances(ctx, targets, summary);
    const INITIAL_FETCH_RETRIES = 3;
    for (let attempt = 1; batches.length === 0 && sawNetworkError && attempt < INITIAL_FETCH_RETRIES; attempt++) {
      ctx.logger.warn('Sonarr fetch failed — retry ' + attempt + '/' + (INITIAL_FETCH_RETRIES - 1) + ' after ' + attempt * 2 + 's');
      await sleep(attempt * 2000);
      summary.found = 0;
      summary.errors = [];
      const retry = await fetchAllInstances(ctx, targets, summary);
      batches = retry.batches;
      sawNetworkError = retry.sawNetworkError;
    }

    // Reached no instances because the network is down — pause, don't report
    // a false "Nothing to import" success.
    if (batches.length === 0 && sawNetworkError) {
      const pausedResult = pauseForNetwork(ctx, summary, 0, 0);
      await finalizeRun(ctx, runId, {
        success: false,
        paused: true,
        message: pausedResult.error,
        errors: runErrors,
        found: summary.found,
      });
      return pausedResult;
    }

    const total = summary.found;
    _syncState.total = total;
    if (total === 0) {
      const emptySummary = Object.assign({}, summary, { lastSyncAt: Date.now() });
      try {
        await ctx.config.set('_sonarr_last_sync', JSON.stringify(emptySummary));
      } catch (e) {
        ctx.logger.warn('Failed to persist sync summary: ' + e.message);
      }
      Object.assign(_syncState, { phase: 'done', lastSyncAt: emptySummary.lastSyncAt });
      publishActivity(100, 'completed', 'Nothing to import');
      await finalizeRun(ctx, runId, {
        success: true,
        message: 'Nothing to import — no shows found',
        ...emptySummary,
        errors: runErrors,
        finishedAt: emptySummary.lastSyncAt,
      });
      return { success: true, message: 'Nothing to import — no shows found', ...emptySummary };
    }
    publishActivity(1, 'active', '0 / ' + total + ' shows');

    // Pass 2: upsert each series into the local media catalog (and the
    // sonarr_series mapping table), tracking current/total for live progress.
    // Idempotent — re-scans refresh titles, artwork, ratings and paths rather
    // than duplicating rows.
    let current = 0;
    for (const { instance, series } of batches) {
      for (const s of series) {
        current++;
        _syncState.current = current;
        if (s.tvdbId == null) {
          summary.skipped++;
          continue;
        }
        try {
          const { mediaId } = await upsertSeries(ctx, s, instance);
          summary.imported++;
          await recordImportLog(ctx, { tvdb_id: s.tvdbId, instance_id: instance.id, otix_media_id: mediaId, status: 'imported', title: s.title });
        } catch (e) {
          summary.failed++;
          runErrors.push({ title: s.title, error: e.message, tvdb_id: String(s.tvdbId) });
          await recordImportLog(ctx, { tvdb_id: s.tvdbId, instance_id: instance.id, otix_media_id: null, status: 'error', title: s.title, error: e.message });
          if (summary.errors.length < 20) summary.errors.push(s.title + ': ' + e.message);
        }
        publishActivity(Math.round((current / total) * 100), 'active', current + ' / ' + total + ' shows');
      }
    }

    summary.lastSyncAt = Date.now();
    try {
      await ctx.config.set('_sonarr_last_sync', JSON.stringify(summary));
    } catch (e) {
      ctx.logger.warn('Failed to persist sync summary: ' + e.message);
    }
    Object.assign(_syncState, {
      phase: 'done',
      found: summary.found,
      imported: summary.imported,
      skipped: summary.skipped,
      failed: summary.failed,
      lastSyncAt: summary.lastSyncAt,
    });
    const doneMsg = 'Imported ' + summary.imported + ' show(s), ' + summary.skipped + ' skipped, ' + summary.failed + ' failed';
    publishActivity(100, 'completed', doneMsg);
    await finalizeRun(ctx, runId, {
      success: true,
      message: doneMsg,
      ...summary,
      errors: runErrors,
      finishedAt: summary.lastSyncAt,
    });
    return { success: true, message: doneMsg, ...summary };
  } catch (e) {
    Object.assign(_syncState, { phase: 'error', error: e.message });
    publishActivity(0, 'error', e.message);
    await finalizeRun(ctx, runId, { success: false, message: e.message, errors: runErrors });
    return { success: false, error: e.message };
  } finally {
    _syncState.running = false;
  }
}

// ── download status → app download framework ───────────────────────────
// Polls each Sonarr instance's active download queue and mirrors actively
// downloading episodes into the shared `downloads` framework table (tagged
// source='sonarr') so the activity downloads panel shows live progress. Also
// flips the local catalog row to `downloading`/`downloaded` so the Shows tab
// reflects real state. Gated by the `trackDownloads` config (default on).

function queueProgress(item) {
  if (String(item.status || '').toLowerCase() === 'completed') return 100;
  if (!item.size) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - item.sizeleft / item.size) * 100)));
}

function queueStatus(item) {
  const s = String(item.status || '').toLowerCase();
  if (s === 'completed') return 'processing'; // Sonarr still importing; flips to 'completed' once it leaves the queue
  if (s === 'paused' || s === 'queued' || s === 'delay' || s === 'pending') return 'queued';
  if (s === 'warning' || s === 'failed') return 'failed';
  return 'downloading';
}

async function syncDownloadStatus(ctx) {
  const enabled = await getEnabled(ctx);
  const summary = { success: true, instances: enabled.length, created: 0, updated: 0, completed: 0 };
  if (enabled.length === 0) return summary;

  for (const instance of enabled) {
    try {
      const res = await sonarrFetch(ctx, instance, API + '/queue?pageSize=100&includeSeries=true');
      if (res.status !== 200) continue;
      const records = res.data && Array.isArray(res.data.records) ? res.data.records : [];
      const seen = new Set();

      for (const item of records) {
        const tvdbId = item.series && item.series.tvdbId;
        if (!tvdbId) continue;
        const queueId = String(item.id);
        seen.add(queueId);
        const title = item.title || (item.series && item.series.title) || 'Unknown';
        const status = queueStatus(item);
        const progress = queueProgress(item);

        const existing = await ctx.db.get(
          'SELECT download_id FROM sonarr_downloads WHERE instance_id = ? AND queue_id = ?',
          [instance.id, queueId]
        );
        let downloadId = existing && existing.download_id;

        if (!downloadId) {
          const dl = await ctx.downloads.queueItem({
            userId: '',
            mediaItemId: String(tvdbId),
            mediaItemTitle: title,
            nzbTitle: title,
            nzbSize: item.size || 0,
            nzbUrl: '',
            sabnzbdNzoId: null,
            source: 'sonarr',
          });
          downloadId = dl && dl.id;
          if (downloadId) {
            await ctx.db.run(
              'INSERT INTO sonarr_downloads (download_id, instance_id, queue_id, tvdb_id, series_id, title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [downloadId, instance.id, queueId, String(tvdbId), (item.series && item.series.id) || null, title, Date.now()]
            );
            summary.created++;
          }
        }

        if (!downloadId) continue;
        // Don't resurrect a row the user cancelled from the framework.
        const row = await ctx.downloads.getDownload(downloadId);
        if (!row || row.status === 'deleted') continue;

        await ctx.downloads.updateStatus(downloadId, status, null, progress);
        summary.updated++;
        if (status === 'downloading' || status === 'queued' || status === 'processing') {
          try {
            await ctx.db.run(
              "UPDATE media SET status = 'downloading', updated_at = datetime('now') WHERE provider = 'tvdb' AND media_type = 'show' AND provider_id = ?",
              [String(tvdbId)]
            );
            await ctx.db.run(
              "UPDATE sonarr_series SET status = 'downloading' WHERE tvdb_id = ?",
              [String(tvdbId)]
            );
          } catch (e) { /* media row may not exist yet */ }
        }
      }

      // Tracked queue items that left the queue finished (or were removed) →
      // mark the framework row completed and clear the mapping.
      const tracked = await ctx.db.all(
        'SELECT download_id, queue_id, tvdb_id FROM sonarr_downloads WHERE instance_id = ?',
        [instance.id]
      );
      for (const t of tracked || []) {
        if (seen.has(String(t.queue_id))) continue;
        try {
          await ctx.downloads.updateStatus(t.download_id, 'completed');
        } catch (e) { /* ignore */ }
        if (t.tvdb_id) {
          try {
            await ctx.db.run(
              "UPDATE media SET status = 'downloaded', updated_at = datetime('now') WHERE provider = 'tvdb' AND media_type = 'show' AND provider_id = ?",
              [String(t.tvdb_id)]
            );
            await ctx.db.run(
              "UPDATE sonarr_series SET status = 'downloaded' WHERE tvdb_id = ?",
              [String(t.tvdb_id)]
            );
          } catch (e) { /* ignore */ }
        }
        await ctx.db.run('DELETE FROM sonarr_downloads WHERE download_id = ?', [t.download_id]);
        summary.completed++;
      }
    } catch (e) {
      ctx.logger.warn('Download status sync failed for ' + instance.name + ': ' + e.message);
    }
  }
  return summary;
}

// ── media.detail (settings catalog drawer) ─────────────────────────────
// Live + local detail for a single synced series: disk usage, path, quality
// profile, monitored, episode counts. Tries the live instance first and
// falls back to the stored media row when nothing is reachable. mediaId is
// the tvdbId (the provider_id used by the media catalog), so the lookups
// need no tmdb→tvdb translation.

async function qualityProfileName(ctx, instance, profileId) {
  if (profileId == null) return null;
  try {
    const res = await sonarrFetch(ctx, instance, API + '/qualityprofile');
    if (res.status === 200 && Array.isArray(res.data)) {
      const p = res.data.find((x) => String(x.id) === String(profileId));
      return p ? p.name : null;
    }
  } catch (e) {
    /* best-effort */
  }
  return null;
}

function seriesDetailFromResource(s, instance, qualityName) {
  const images = s.images || [];
  const poster = images.find((i) => i.coverType === 'poster');
  const fanart = images.find((i) => i.coverType === 'fanart') || images.find((i) => i.coverType === 'banner');
  const stats = (s && s.statistics) || {};
  const hasFiles = (stats.episodeFileCount || 0) > 0;
  return {
    found: true,
    live: true,
    source: 'sonarr',
    media_type: 'show',
    provider_id: String(s.tvdbId),
    tmdb_id: s.tmdbId != null ? s.tmdbId : null,
    source_instance: instance.name || null,
    source_instance_id: instance.id || null,
    title: s.title || null,
    year: s.year || null,
    overview: s.overview || null,
    poster_url: (poster && (poster.remoteUrl || poster.url)) || null,
    backdrop_url: (fanart && (fanart.remoteUrl || fanart.url)) || null,
    genres: Array.isArray(s.genres) ? s.genres : [],
    runtime: s.runtime || null,
    rating: typeof s.rating === 'number' ? s.rating : null,
    status: hasFiles ? 'downloaded' : s.monitored ? 'requested' : 'missing',
    path: s.path || null,
    size_on_disk: stats.sizeOnDisk != null ? stats.sizeOnDisk : null,
    monitored: s.monitored != null ? s.monitored : null,
    quality_profile: qualityName || null,
    added: s.added || null,
    series_type: s.seriesType || null,
    season_count: stats.seasonCount != null ? stats.seasonCount : null,
    episode_count: stats.episodeCount != null ? stats.episodeCount : null,
    episode_file_count: stats.episodeFileCount != null ? stats.episodeFileCount : null,
    percent_of_episodes: stats.percentOfEpisodes != null ? stats.percentOfEpisodes : null,
    file: null,
    error: null,
  };
}

function seriesRowDetail(row) {
  let genres = [];
  if (row.genres) {
    try {
      const g = JSON.parse(row.genres);
      if (Array.isArray(g)) genres = g;
    } catch (e) { /* ignore */ }
  }
  return {
    found: true,
    live: false,
    source: 'catalog',
    media_type: 'show',
    provider_id: String(row.provider_id),
    tmdb_id: null,
    source_instance: row.source_instance || null,
    source_instance_id: row.source_instance_id || null,
    title: row.title || null,
    year: row.year || null,
    overview: row.overview || null,
    poster_url: row.poster_url || null,
    backdrop_url: row.backdrop_url || null,
    genres,
    runtime: row.runtime || null,
    rating: row.rating != null ? row.rating : null,
    status: row.status || null,
    path: row.file_path || null,
    size_on_disk: null,
    monitored: null,
    quality_profile: null,
    added: null,
    series_type: null,
    season_count: null,
    episode_count: null,
    episode_file_count: null,
    percent_of_episodes: null,
    file: null,
    error: null,
  };
}

async function seriesDetail(ctx, args) {
  const mediaId = String(args.mediaId);
  const instanceId = args.instanceId ? String(args.instanceId) : null;
  const enabled = await getEnabled(ctx);
  const targets = instanceId ? enabled.filter((i) => String(i.id) === instanceId) : enabled;
  for (const instance of targets) {
    try {
      const res = await sonarrFetch(ctx, instance, API + '/series?tvdbId=' + mediaId);
      if (res.status !== 200 || !Array.isArray(res.data)) continue;
      const s = res.data.find((x) => String(x.tvdbId) === mediaId);
      if (!s) continue;
      const qualityName = await qualityProfileName(ctx, instance, s.qualityProfileId);
      return seriesDetailFromResource(s, instance, qualityName);
    } catch (e) {
      // try next instance
    }
  }
  const row = await ctx.db.get(
    "SELECT * FROM media WHERE provider = 'tvdb' AND media_type = 'show' AND provider_id = ?",
    [mediaId]
  );
  if (row) return seriesRowDetail(row);
  return { found: false, live: false, source: 'sonarr', media_type: 'show', provider_id: mediaId, error: 'Not found on any enabled instance or in the local catalog' };
}

// ── data methods ───────────────────────────────────────────────────────

const data = {
  'get-instances': async (ctx) => getInstances(ctx),

  'get-instance': async (ctx, args) => {
    const instances = await getInstances(ctx);
    return instances.find((i) => i.id === args.id) || null;
  },

  'add-instance': async (ctx, args) => {
    const instances = await getInstances(ctx);
    const instance = Object.assign({ enabled: true, autoRequestWatchlist: true }, args);
    if (!instance.id) instance.id = slugify(instance.name || 'sonarr');
    if (instances.some((i) => i.id === instance.id)) {
      return { success: false, error: 'An instance with id "' + instance.id + '" already exists' };
    }
    instances.push(instance);
    await ctx.config.set('instances', instances);
    return { success: true, instance };
  },

  'update-instance': async (ctx, args) => {
    const instances = await getInstances(ctx);
    const idx = instances.findIndex((i) => i.id === args.id);
    if (idx === -1) return { success: false, error: 'Instance not found' };
    const updated = Object.assign({}, instances[idx], args.config || args);
    updated.id = instances[idx].id;
    instances[idx] = updated;
    await ctx.config.set('instances', instances);
    return { success: true, instance: updated };
  },

  'remove-instance': async (ctx, args) => {
    const instances = await getInstances(ctx);
    await ctx.config.set('instances', instances.filter((i) => i.id !== args.id));
    return { success: true };
  },

  'test-instance': async (ctx, args) => {
    const instances = await getInstances(ctx);
    const instance = instances.find((i) => i.id === args.id);
    if (!instance) return { ok: false, message: 'Instance not found' };
    try {
      const res = await sonarrFetch(ctx, instance, API + '/system/status');
      if (res.status !== 200) return { ok: false, message: 'HTTP ' + res.status };
      return { ok: true, message: 'Sonarr v' + (res.data && res.data.version ? res.data.version : 'connected') };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },

  // Probe an as-yet-unsaved connection: verify the API key and pull the
  // quality profiles + root folders (+ language profiles on v3) so the generic
  // instances editor can offer them as dropdowns instead of asking for magic
  // IDs/paths. `options` is keyed by sub-field name, each a [{ value, label }]
  // list (see instances-editor).
  'probe': async (ctx, args) => {
    const instance = Object.assign({}, args || {});
    if (!instance.apiKey) return { ok: false, error: 'API Key required' };
    try {
      const status = await sonarrFetch(ctx, instance, API + '/system/status');
      if (status.status !== 200) {
        return {
          ok: false,
          error: status.status === 401
            ? 'Authentication failed — check API Key.'
            : 'Connection failed (HTTP ' + status.status + ').',
        };
      }
      const [profilesRes, foldersRes, langRes] = await Promise.all([
        sonarrFetch(ctx, instance, API + '/qualityprofile'),
        sonarrFetch(ctx, instance, API + '/rootfolder'),
        sonarrFetch(ctx, instance, API + '/languageprofile'),
      ]);
      const options = {
        qualityProfile: (profilesRes.data || []).map((p) => ({ value: p.name, label: p.name })),
        rootFolder: (foldersRes.data || []).map((f) => ({ value: f.path, label: f.path })),
      };
      if (langRes.status === 200 && Array.isArray(langRes.data)) {
        options.languageProfile = langRes.data.map((p) => ({ value: p.name, label: p.name }));
      }
      return {
        ok: true,
        version: status.data && status.data.version,
        options,
      };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  },

  'getAllLibraries': async (ctx) => {
    const enabled = await getEnabled(ctx);
    const results = [];
    for (const instance of enabled) {
      const base = baseUrl(instance);
      try {
        const res = await sonarrFetch(ctx, instance, API + '/series');
        if (res.status !== 200) {
          results.push({ name: instance.name, url: base, count: 0, movies: [], error: 'HTTP ' + res.status });
          continue;
        }
        const series = (res.data || []).map((s) => normalizeSeries(s, base));
        results.push({ name: instance.name, url: base, count: series.length, movies: series, series });
      } catch (e) {
        results.push({ name: instance.name, url: base, count: 0, movies: [], error: e.message || String(e) });
      }
    }
    return results;
  },

  'request-series': async (ctx, args) => {
    const instances = await getInstances(ctx);
    const instance = instances.find((i) => i.id === args.instanceId);
    if (!instance) return { success: false, error: 'Instance not found' };
    return requestSeriesOnInstance(ctx, instance, String(args.tmdbId), args);
  },

  'sync-library': async (ctx) => syncLibrary(ctx),

  'sync.now': async (ctx, args) => syncLibrary(ctx, args || {}),

  // Pull Sonarr's active queue into the app download framework (manual trigger
  // for testing; the plugin also runs this on a timer when trackDownloads is on).
  'downloads.sync': async (ctx) => syncDownloadStatus(ctx),

  'sync.status': async (ctx) => {
    let lastSync = null;
    try {
      const raw = await ctx.config.get('_sonarr_last_sync');
      if (raw) lastSync = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      /* ignore */
    }
    const enabled = await getEnabled(ctx);
    return Object.assign({}, _syncState, {
      lastSync,
      instance_count: enabled.length,
      connected: enabled.length > 0,
      instances: enabled.map((i) => ({ id: i.id, name: i.name })),
    });
  },

  // Local media catalog (the shared `media` table this plugin syncs into).
  // Supports search + offset pagination for the Shows settings section.
  'movies.list': async (ctx, opts) => {
    const o = opts || {};
    const params = [];
    const clauses = ["provider = 'tvdb'", "media_type = 'show'"];
    if (o.search && String(o.search).trim()) {
      clauses.push('(title LIKE ? OR provider_id LIKE ?)');
      const q = '%' + String(o.search).trim() + '%';
      params.push(q, q);
    }
    if (o.instanceId) {
      clauses.push('source_instance_id = ?');
      params.push(String(o.instanceId));
    }
    const where = clauses.join(' AND ');
    const totalRow = await ctx.db.get('SELECT COUNT(*) c FROM media WHERE ' + where, params);
    const limit = Math.max(1, Math.min(Number(o.limit) || 100, 500));
    const offset = Math.max(0, Number(o.offset) || 0);
    const movies = await ctx.db.all(
      'SELECT provider_id, title, year, poster_url, backdrop_url, overview, runtime, rating, status, genres, file_path, source_instance, source_instance_id FROM media WHERE ' +
        where +
        ' ORDER BY title COLLATE NOCASE LIMIT ? OFFSET ?',
      params.concat([limit, offset])
    );
    return { total: totalRow ? totalRow.c : 0, movies: movies || [], limit, offset };
  },

  // Detail for a synced series (storage, path, quality, episode counts) —
  // drives the settings catalog drawer. mediaId is the provider_id (tvdbId)
  // the list exposes; falls back to the stored media row when the instance is
  // offline.
  'media.detail': async (ctx, args) => seriesDetail(ctx, args || {}),

  // Aggregate per-instance stats (title count, storage on disk, status
  // breakdown, episode totals) for the Shows section header. Computed from the
  // local sonarr_series mirror so it works offline; merges the enabled
  // instances so a configured-but-not-yet-synced server still shows up.
  'movies.summary': async (ctx) => {
    let rows = [];
    try {
      rows = await ctx.db.all(
        `SELECT instance_id, instance_name,
           COUNT(*) AS total,
           COALESCE(SUM(size_on_disk), 0) AS size_on_disk,
           COALESCE(SUM(CASE WHEN status = 'downloaded' THEN 1 ELSE 0 END), 0) AS downloaded,
           COALESCE(SUM(CASE WHEN status = 'downloading' THEN 1 ELSE 0 END), 0) AS downloading,
           COALESCE(SUM(CASE WHEN status = 'missing' AND monitored = 1 THEN 1 ELSE 0 END), 0) AS requested,
           COALESCE(SUM(CASE WHEN status = 'missing' AND monitored = 0 THEN 1 ELSE 0 END), 0) AS missing,
           COALESCE(SUM(episode_count), 0) AS episodes_total,
           COALESCE(SUM(episode_file_count), 0) AS episodes_files
         FROM sonarr_series GROUP BY instance_id, instance_name`
      );
    } catch (e) {
      ctx.logger.warn('movies.summary failed: ' + e.message);
    }
    const toEntry = (r) => ({
      id: String(r.instance_id),
      name: r.instance_name || String(r.instance_id),
      total: Number(r.total) || 0,
      size_on_disk: Number(r.size_on_disk) || 0,
      downloaded: Number(r.downloaded) || 0,
      downloading: Number(r.downloading) || 0,
      requested: Number(r.requested) || 0,
      missing: Number(r.missing) || 0,
      episodes_total: Number(r.episodes_total) || 0,
      episodes_files: Number(r.episodes_files) || 0,
    });
    const instances = [];
    const enabled = await getEnabled(ctx);
    for (const i of enabled) {
      const r = (rows || []).find((x) => String(x.instance_id) === String(i.id));
      instances.push(Object.assign({ name: i.name, disabled: false }, r ? toEntry(r) : { id: i.id, total: 0, size_on_disk: 0, downloaded: 0, downloading: 0, requested: 0, missing: 0, episodes_total: 0, episodes_files: 0 }));
    }
    // Include synced instances that are now disabled so their data isn't hidden.
    for (const r of rows || []) {
      if (!instances.some((x) => x.id === String(r.instance_id))) instances.push(Object.assign(toEntry(r), { disabled: true }));
    }
    return { instances };
  },

  // Local request log (sonarr_requests), newest first. Joins the local catalog
  // for poster art so the settings UI can render a rich list.
  'requests.list': async (ctx, opts) => {
    const o = opts || {};
    const params = [];
    const clauses = [];
    if (o.search && String(o.search).trim()) {
      clauses.push('(r.title LIKE ? OR r.tvdb_id LIKE ? OR r.tmdb_id LIKE ?)');
      const q = '%' + String(o.search).trim() + '%';
      params.push(q, q, q);
    }
    if (o.instanceId) {
      clauses.push('r.instance_id = ?');
      params.push(String(o.instanceId));
    }
    if (o.status) {
      clauses.push('r.status = ?');
      params.push(String(o.status));
    }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const totalRow = await ctx.db.get('SELECT COUNT(*) c FROM sonarr_requests r ' + where, params);
    const limit = Math.max(1, Math.min(Number(o.limit) || 100, 500));
    const offset = Math.max(0, Number(o.offset) || 0);
    const requests = await ctx.db.all(
      'SELECT r.tvdb_id, r.tmdb_id, r.title, r.instance_id, r.instance_name, r.status, r.source, r.already_exists, r.error, r.requested_at, m.poster_url, m.backdrop_url FROM sonarr_requests r LEFT JOIN media m ON m.provider = \'tvdb\' AND m.media_type = \'show\' AND m.provider_id = r.tvdb_id ' +
        where +
        ' ORDER BY r.requested_at DESC LIMIT ? OFFSET ?',
      params.concat([limit, offset])
    );
    return { total: totalRow ? totalRow.c : 0, requests: requests || [], limit, offset };
  },

  // Per-run sync history (sonarr_sync_log), newest first.
  'sync.history': async (ctx, opts) => {
    const o = opts || {};
    const totalRow = await ctx.db.get('SELECT COUNT(*) c FROM sonarr_sync_log');
    const limit = Math.max(1, Math.min(Number(o.limit) || 30, 200));
    const offset = Math.max(0, Number(o.offset) || 0);
    const runs = await ctx.db.all(
      'SELECT id, instance_id, started_at, finished_at, success, paused, found, imported, skipped, failed, errors, message FROM sonarr_sync_log ORDER BY started_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    return { total: totalRow ? totalRow.c : 0, runs: runs || [], limit, offset };
  },
};

// ── plugin entry ───────────────────────────────────────────────────────

module.exports = {
  plugin: (ctx) => {
    ctx.logger.info('Sonarr plugin loaded');

    // Auto-request watchlisted shows on every enabled instance that opts in.
    ctx.events.on('otix:list:item_added', async (payload) => {
      if (!payload || payload.listId !== 'watchlist') return;
      const item = payload.item || {};
      if (item.mediaType && item.mediaType !== 'show') return;
      const tmdbId = item.mediaItemId;
      if (!tmdbId) return;

      const enabled = await getEnabled(ctx);
      const targets = enabled.filter((i) => i.autoRequestWatchlist !== false);
      if (targets.length === 0) return;
      ctx.logger.info('Watchlist add → Sonarr request', { tmdbId: tmdbId, instances: targets.length });

      for (const instance of targets) {
        try {
          const result = await requestSeriesOnInstance(ctx, instance, String(tmdbId), { source: 'watchlist' });
          if (result && result.success) ctx.logger.info('Auto-requested show on ' + instance.name);
          else ctx.logger.warn('Auto-request failed on ' + instance.name + ': ' + ((result && result.error) || 'unknown'));
        } catch (e) {
          ctx.logger.warn('Auto-request error on ' + instance.name + ': ' + e.message);
        }
      }
    });

    // Live download-status tracking (default on). Checks the config each tick
    // so toggling `trackDownloads` on/off takes effect without a reload.
    const startStatusPoll = async () => {
      try {
        const enabled = await ctx.config.get('trackDownloads');
        if (enabled !== false) {
          await syncDownloadStatus(ctx).catch((e) => ctx.logger.warn('Initial status sync failed: ' + e.message));
        }
      } catch (e) {
        /* ignore — poller will pick it up */
      }
      _statusTimer = setInterval(async () => {
        try {
          const enabled = await ctx.config.get('trackDownloads');
          if (enabled === false) return; // toggled off — skip, rows persist for next enable
          await syncDownloadStatus(ctx);
        } catch (e) {
          ctx.logger.warn('Sonarr status poll failed: ' + e.message);
        }
      }, STATUS_POLL_MS);
      ctx.logger.info('Sonarr download-status tracking active');
    };
    startStatusPoll();

    // Optional periodic import into Otix
    const startPoll = async () => {
      try {
        const mins = await ctx.config.get('pollIntervalMinutes');
        const interval = Number(mins) || 0;
        if (interval <= 0) return;
        _pollTimer = setInterval(() => {
          syncLibrary(ctx).catch((e) => ctx.logger.warn('Periodic Sonarr sync failed: ' + e.message));
        }, interval * 60 * 1000);
        ctx.logger.info('Sonarr auto-import every ' + interval + ' min');
      } catch (e) {
        ctx.logger.warn('Failed to start Sonarr poll: ' + e.message);
      }
    };
    startPoll();

    return () => {
      if (_pollTimer) clearInterval(_pollTimer);
      _pollTimer = null;
      if (_statusTimer) clearInterval(_statusTimer);
      _statusTimer = null;
      stopReconnect();
      ctx.logger.info('Sonarr plugin unloaded');
    };
  },

  data,

  status: async (ctx) => {
    const enabled = await getEnabled(ctx);
    return {
      connected: enabled.length > 0,
      instance_count: enabled.length,
      enabled_instances: enabled.map((i) => i.name),
    };
  },

  test: async (ctx) => {
    const enabled = await getEnabled(ctx);
    if (enabled.length === 0) return { passed: true };
    let success = 0;
    const errors = [];
    for (const instance of enabled) {
      try {
        const res = await sonarrFetch(ctx, instance, API + '/system/status');
        if (res.status === 200) success++;
        else errors.push(instance.name + ': HTTP ' + res.status);
      } catch (e) {
        errors.push(instance.name + ': ' + e.message);
      }
    }
    if (success === enabled.length) return { passed: true };
    return { passed: false, failures: ['Connected to ' + success + '/' + enabled.length + ' instances. Errors: ' + errors.join(', ')] };
  },

  slotRender: async (ctx, location, context) => {
    if (location !== 'media/detail/actions') return { widgets: [] };
    if (!context || context.mediaType !== 'show') return { widgets: [] };

    const enabled = await getEnabled(ctx);
    if (enabled.length === 0) return { widgets: [] };

    const tmdbId = context.mediaId;
    const statusMap = {};
    const fileMap = {};
    await Promise.all(enabled.map(async (instance) => {
      try {
        // Resolve the tvdbId the app doesn't know, then check the library.
        const tvdbId = await resolveTvdbId(ctx, instance, tmdbId);
        if (!tvdbId) {
          statusMap[instance.id] = 'not_exists';
          return;
        }
        let st = await seriesStatusOnInstance(ctx, instance, tvdbId);
        if (st === null) {
          // Library endpoint unusable — fall back to the lookup resource. A
          // found series with an id is already added.
          const res = await sonarrFetch(ctx, instance, API + '/series/lookup?term=' + encodeURIComponent('tmdb:' + tmdbId));
          if (res.status !== 200) {
            statusMap[instance.id] = 'error';
            return;
          }
          const s = Array.isArray(res.data) ? res.data.find((x) => x.tmdbId != null && String(x.tmdbId) === String(tmdbId)) || res.data[0] : null;
          if (!s) {
            statusMap[instance.id] = 'not_exists';
            return;
          }
          const stats = (s && s.statistics) || {};
          st = { found: Boolean(s.id), downloaded: s.id ? (stats.episodeFileCount || 0) > 0 : false, file: s.id ? fileFromSeries(s) : null };
        }
        if (!st.found) {
          statusMap[instance.id] = 'not_exists';
          return;
        }
        statusMap[instance.id] = st.downloaded ? 'downloaded' : 'requested';
        if (st.file) fileMap[instance.id] = st.file;
      } catch (e) {
        statusMap[instance.id] = 'error';
      }
    }));

    return {
      widgets: [
        {
          type: 'request-button',
          props: {
            mediaType: 'show',
            mediaId: tmdbId,
            instances: enabled.map((i) => ({
              id: i.id,
              name: i.name,
              status: statusMap[i.id] || 'error',
              file: fileMap[i.id] || null,
            })),
          },
        },
      ],
    };
  },

  handleAction: async (ctx, actionKey) => {
    if (actionKey === 'sync-library') return syncLibrary(ctx);
    return { success: false, error: 'Unknown action: ' + actionKey };
  },
};
