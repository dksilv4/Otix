// Radarr plugin for Otix
// Radarr v3 API client. Multi-instance movie management:
//  - Browse your Radarr library (getAllLibraries → Library page)
//  - Request movies from the Otix watchlist (auto + manual request-button)
//  - Scan every Radarr movie into the local media catalog (shared `media`
//    table, upserted by tmdb_id) — fully offline, no cloud dependency.
//    radarr_import_log keeps an audit trail of the scan.
//
// Framework gotchas handled here:
//  - ctx.fetch returns { status, headers, body } where body is a STRING.
//    radarrFetch() parses it; there is no res.ok / res.json().
//  - ctx.config.get/getAll/set are RPC round-trips and MUST be awaited.
//  - The shared `media` table is NOT declared in db.tables (so it isn't
//    namespace-prefixed to radarr_media); access is granted via the
//    SYSTEM_TABLE_GRANTS `table:media` permission for this plugin.

const API = '/api/v3';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// How often to poll Radarr's active-download queue and mirror it into the app's
// download framework (matches the activity panel's 15s refresh cadence).
const STATUS_POLL_MS = 15000;

let _pollTimer = null;
let _reconnectTimer = null;
let _statusTimer = null;
let _syncState = { phase: 'idle', current: 0, total: 0, found: 0, imported: 0, skipped: 0, failed: 0, lastSyncAt: null, error: null, paused: false, deferred: 0, running: false };

function baseUrl(i) {
  // Radarr defaults: 7878 (http) / 443 (https) when the port isn't explicit.
  const port = i.port != null ? ':' + i.port : i.useSsl ? ':443' : ':7878';
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

async function radarrFetch(ctx, instance, path, opts) {
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
  // refused). Radarr is idempotent on tmdbId, so a re-sent POST is safe.
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
    throw new Error('Radarr connection to ' + (instance.name || instance.id) + ' failed: ' + describeFetchError(lastErr));
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

function normalizeMovie(m, base) {
  return {
    id: m.id,
    title: m.title,
    year: m.year,
    tmdbId: m.tmdbId,
    images: (m.images || []).map((img) => ({
      coverType: img.coverType,
      remoteUrl: img.remoteUrl || base + img.url,
    })),
  };
}

// ── request-movie internals ────────────────────────────────────────────

async function resolveQualityProfile(ctx, instance, explicit) {
  if (explicit) return explicit;
  try {
    const res = await radarrFetch(ctx, instance, API + '/qualityprofile');
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

async function resolveRootFolder(ctx, instance, explicit) {
  if (explicit) return explicit;
  if (instance.rootFolder) return instance.rootFolder;
  try {
    const res = await radarrFetch(ctx, instance, API + '/rootfolder');
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      return res.data[0].path;
    }
  } catch (e) {
    ctx.logger.warn('Root folder lookup failed: ' + e.message);
  }
  return null;
}

// Local request log (radarr_requests) — records every movie requested on a
// Radarr instance so the app can show "which media has been requested".
async function recordRequest(ctx, entry) {
  try {
    await ctx.db.run(
      'INSERT INTO radarr_requests (tmdb_id, title, instance_id, instance_name, status, source, already_exists, error, requested_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tmdb_id, instance_id) DO UPDATE SET title = excluded.title, status = excluded.status, source = excluded.source, already_exists = excluded.already_exists, error = excluded.error, requested_at = excluded.requested_at',
      [
        String(entry.tmdb_id),
        entry.title || null,
        entry.instance_id || null,
        entry.instance_name || null,
        entry.status,
        entry.source || 'manual',
        entry.already_exists ? 1 : 0,
        entry.error || null,
        entry.requested_at || Date.now(),
      ],
    );
  } catch (e) {
    ctx.logger.warn('Failed to record request: ' + e.message);
  }
}

// Authoritative status check against the Radarr library. GET /movie?tmdbId= is
// server-filtered; we also filter client-side so it stays correct even if the
// server version ignores the param and returns the full library. Returns:
//   { found:false }                    — not in the library
//   { found:true, hasFile, file|null } — in the library, with file details
//   null                               — library endpoint unreachable/unsupported
async function movieStatusOnInstance(ctx, instance, tmdbId) {
  try {
    const res = await radarrFetch(ctx, instance, API + '/movie?tmdbId=' + tmdbId);
    if (res.status !== 200 || !Array.isArray(res.data)) return null;
    const m = res.data.find((x) => String(x.tmdbId) === String(tmdbId));
    if (!m) return { found: false };
    const mf = m.movieFile || null;
    return {
      found: true,
      hasFile: !!m.hasFile,
      file: mf
        ? {
            name: mf.relativePath || null,
            size: mf.size != null ? mf.size : null,
            quality: (mf.quality && mf.quality.quality && mf.quality.quality.name) || null,
            video: (mf.mediaInfo && mf.mediaInfo.videoCodec) || null,
            audio: (mf.mediaInfo && mf.mediaInfo.audioCodec) || null,
          }
        : null,
    };
  } catch (e) {
    return null;
  }
}

function fileFromLookup(movie) {
  const mf = (movie && movie.movieFile) || null;
  return mf
    ? {
        name: mf.relativePath || null,
        size: mf.size != null ? mf.size : null,
        quality: (mf.quality && mf.quality.quality && mf.quality.quality.name) || null,
        video: (mf.mediaInfo && mf.mediaInfo.videoCodec) || null,
        audio: (mf.mediaInfo && mf.mediaInfo.audioCodec) || null,
      }
    : null;
}

async function requestMovieOnInstance(ctx, instance, tmdbId, overrides) {
  const source = (overrides && overrides.source) || 'manual';
  try {
    const lookup = await radarrFetch(ctx, instance, API + '/movie/lookup/tmdb?tmdbId=' + tmdbId);
    if (lookup.status !== 200) {
      const error = 'Radarr lookup failed: HTTP ' + lookup.status;
      await recordRequest(ctx, { tmdb_id: tmdbId, instance_id: instance.id, instance_name: instance.name, status: 'error', source, error });
      return { success: false, error };
    }
    const movie = lookup.data;
    if (!movie) {
      await recordRequest(ctx, { tmdb_id: tmdbId, instance_id: instance.id, instance_name: instance.name, status: 'error', source, error: 'No movie details found' });
      return { success: false, error: 'No movie details found' };
    }
    // lookup/tmdb can report id:0 for an already-added movie, so verify against
    // the library list when the lookup suggests the movie is not present.
    const libStatus = await movieStatusOnInstance(ctx, instance, tmdbId);
    const inLibrary = libStatus === null ? Boolean(movie.id) : libStatus.found;
    if (inLibrary) {
      await recordRequest(ctx, { tmdb_id: tmdbId, title: movie.title, instance_id: instance.id, instance_name: instance.name, status: 'exists', source, already_exists: true });
      return { success: true, alreadyExists: true, message: 'Already in library' };
    }

    const qualityProfileId = await resolveQualityProfile(ctx, instance, overrides && overrides.qualityProfile);
    const rootFolderPath = await resolveRootFolder(ctx, instance, overrides && overrides.rootFolder);
    if (!rootFolderPath) {
      const error = 'No root folder path configured';
      await recordRequest(ctx, { tmdb_id: tmdbId, title: movie.title, instance_id: instance.id, instance_name: instance.name, status: 'error', source, error });
      return { success: false, error };
    }

    const add = await radarrFetch(ctx, instance, API + '/movie', {
      method: 'POST',
      body: {
        title: movie.title,
        titleSlug: movie.titleSlug || slugify(movie.title),
        images: movie.images || [],
        tmdbId: parseInt(tmdbId, 10),
        year: movie.year,
        qualityProfileId,
        rootFolderPath,
        monitored: true,
        addOptions: { searchForMovie: true },
      },
    });

    if (add.status >= 200 && add.status < 300) {
      await recordRequest(ctx, { tmdb_id: tmdbId, title: movie.title, instance_id: instance.id, instance_name: instance.name, status: 'requested', source });
      ctx.notifications.send({
        title: 'Radarr Request Successful',
        body: 'Requested "' + movie.title + '" on ' + instance.name + '.',
      });
      return { success: true };
    }
    // Radarr's lookup/tmdb can report id:0 for an already-added movie (scan/race
    // state), so the POST rejects with MovieExistsValidator. Treat that as
    // already-in-library instead of surfacing the raw validation error.
    const rawBody = typeof add.data === 'string' ? add.data : JSON.stringify(add.data);
    if (add.status >= 400 && /already been added|MovieExistsValidator/i.test(rawBody)) {
      await recordRequest(ctx, { tmdb_id: tmdbId, title: movie.title, instance_id: instance.id, instance_name: instance.name, status: 'exists', source, already_exists: true });
      ctx.notifications.send({
        title: 'Already in Library',
        body: '"' + movie.title + '" is already on ' + instance.name + '.',
      });
      return { success: true, alreadyExists: true, message: 'Already in library' };
    }
    const error = 'Radarr API error: ' + rawBody;
    await recordRequest(ctx, { tmdb_id: tmdbId, title: movie.title, instance_id: instance.id, instance_name: instance.name, status: 'error', source, error });
    return { success: false, error };
  } catch (e) {
    await recordRequest(ctx, { tmdb_id: tmdbId, instance_id: instance.id, instance_name: instance.name, status: 'error', source, error: e.message });
    return { success: false, error: e.message };
  }
}

// ── import log (radarr_import_log table) ───────────────────────────────

async function recordImportLog(ctx, entry) {
  try {
    await ctx.db.run(
      'INSERT OR REPLACE INTO radarr_import_log (tmdb_id, instance_id, otix_media_id, status, title, error, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        String(entry.tmdb_id),
        entry.instance_id || null,
        entry.otix_media_id || null,
        entry.status,
        entry.title || null,
        entry.error || null,
        entry.imported_at || Date.now(),
      ],
    );
  } catch (e) {
    ctx.logger.warn('Failed to record import log: ' + e.message);
  }
}

// ── local media catalog (shared `media` table) ─────────────────────────

// Idempotent upsert keyed by (provider, media_type, provider_id). Requires the
// `table:media` permission (auto-granted to this plugin via SYSTEM_TABLE_GRANTS).
const MEDIA_UPSERT = `
INSERT INTO media (provider, provider_id, media_type, title, year, overview, poster_url, backdrop_url, genres, runtime, rating, status, file_path, source_instance, source_instance_id, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
ON CONFLICT(provider, media_type, provider_id) DO UPDATE SET
  title = excluded.title,
  year = excluded.year,
  overview = excluded.overview,
  poster_url = excluded.poster_url,
  backdrop_url = excluded.backdrop_url,
  genres = excluded.genres,
  runtime = excluded.runtime,
  rating = excluded.rating,
  status = excluded.status,
  file_path = excluded.file_path,
  source_instance = excluded.source_instance,
  source_instance_id = excluded.source_instance_id,
  updated_at = datetime('now')
`;

function movieToMediaRow(m, instance) {
  const images = m.images || [];
  const poster = images.find((i) => i.coverType === 'poster') || images[0];
  const fanart = images.find((i) => i.coverType === 'fanart') || poster;
  return {
    provider: 'tmdb',
    provider_id: String(m.tmdbId),
    media_type: 'movie',
    title: m.title || null,
    year: m.year || null,
    overview: m.overview || null,
    poster_url: (poster && (poster.remoteUrl || poster.url)) || null,
    backdrop_url: (fanart && (fanart.remoteUrl || fanart.url)) || null,
    genres: Array.isArray(m.genres) && m.genres.length ? JSON.stringify(m.genres) : null,
    runtime: m.runtime || null,
    rating: typeof m.rating === 'number' ? m.rating : null,
    status: m.hasFile ? 'downloaded' : 'missing',
    file_path: m.path || null,
    source_instance: instance.name || null,
    source_instance_id: instance.id || null,
  };
}

// Plugin-owned movie mirror keyed by tmdb_id. Keeps per-title size/monitored
// so per-instance storage totals and status breakdowns are computable offline.
const RADARR_MOVIES_UPSERT = `
  INSERT INTO radarr_movies (tmdb_id, instance_id, instance_name, title, year, overview, poster_url, genres, runtime, rating, status, file_path, size_on_disk, monitored, added_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(tmdb_id) DO UPDATE SET
    instance_id=excluded.instance_id, instance_name=excluded.instance_name,
    title=excluded.title, year=excluded.year, overview=excluded.overview, poster_url=excluded.poster_url,
    genres=excluded.genres, runtime=excluded.runtime, rating=excluded.rating, status=excluded.status,
    file_path=excluded.file_path, size_on_disk=excluded.size_on_disk, monitored=excluded.monitored,
    added_at=excluded.added_at
`;

async function upsertMedia(ctx, m, instance) {
  const r = movieToMediaRow(m, instance);
  const res = await ctx.db.run(MEDIA_UPSERT, [
    r.provider, r.provider_id, r.media_type, r.title, r.year, r.overview,
    r.poster_url, r.backdrop_url, r.genres, r.runtime, r.rating, r.status,
    r.file_path, r.source_instance, r.source_instance_id,
  ]);
  const rowId = res && (res.lastInsertRowid != null ? res.lastInsertRowid : res.lastID);
  try {
    await ctx.db.run(RADARR_MOVIES_UPSERT, [
      String(m.tmdbId),
      instance.id || null,
      instance.name || null,
      m.title || null,
      m.year || null,
      m.overview || null,
      r.poster_url,
      r.genres,
      m.runtime || null,
      r.rating,
      r.status,
      m.path || null,
      m.sizeOnDisk != null ? m.sizeOnDisk : null,
      m.monitored ? 1 : 0,
      m.added ? new Date(m.added).getTime() : Date.now(),
    ]);
  } catch (e) {
    ctx.logger.warn('Failed to upsert radarr_movies: ' + e.message);
  }
  return { mediaId: rowId != null ? String(rowId) : null };
}

// ── network-pause / auto-resume helpers ────────────────────────────────
// The only external dependency is Radarr itself — the catalog write is local.
// When every Radarr instance drops mid-scan, we pause with an honest,
// retryable state instead of churning the whole library into "failed" (or
// claiming a misleading success). The scan is idempotent (upsert), so a
// reconnect watcher simply re-runs it once a Radarr instance is reachable.

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

// Poll the enabled Radarr instances until one answers, then re-run the scan.
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
          const res = await radarrFetch(ctx, inst, API + '/system/status');
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
    ctx.logger.info('Radarr reachable again — resuming library scan');
    syncLibrary(ctx).catch((e) => ctx.logger.warn('Resume scan failed: ' + e.message));
  }, 15000);
}

function pauseForNetwork(ctx, summary, current, total) {
  const deferred = Math.max(0, total - current);
  const message = 'Network unreachable — sync paused' + (deferred > 0 ? ', ' + deferred + ' queued' : '');
  Object.assign(_syncState, { phase: 'paused', paused: true, error: message, deferred });
  const pausedSummary = Object.assign({}, summary, { paused: true, deferred, lastSyncAt: Date.now() });
  try {
    ctx.config.set('_radarr_last_sync', JSON.stringify(pausedSummary));
  } catch (e) {
    ctx.logger.warn('Failed to persist paused sync: ' + e.message);
  }
  try {
    ctx.activity.publish({
      id: 'radarr-sync',
      type: 'sync',
      title: 'Radarr → Otix sync',
      subtitle: 'Offline — paused',
      status: 'error',
      progress: Math.round((current / Math.max(1, total)) * 100),
      icon: 'film',
    });
  } catch (e) {
    /* activity is best-effort */
  }
  startReconnect(ctx);
  return { success: false, paused: true, deferred, error: message, ...pausedSummary };
}

// ── sync run log (radarr_sync_log table) ───────────────────────────────
// Every sync.now run gets a row so the settings page can show per-run
// history: counts, success/paused, and the full per-movie failure list.

async function beginSyncRun(ctx) {
  try {
    const enabled = await getEnabled(ctx);
    const res = await ctx.db.run(
      'INSERT INTO radarr_sync_log (instance_id, started_at) VALUES (?, ?)',
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
      'UPDATE radarr_sync_log SET finished_at = ?, success = ?, paused = ?, found = ?, imported = ?, skipped = ?, failed = ?, errors = ?, message = ? WHERE id = ?',
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

// Pass 1: fetch every enabled instance's movie list. Mutates `summary` with
// per-instance errors and the total `found` count; returns whether any fetch
// failed with a network-level error.
async function fetchAllInstances(ctx, enabled, summary) {
  const batches = [];
  let sawNetworkError = false;
  for (const instance of enabled) {
    let movies = [];
    let fetchError = null;
    try {
      const res = await radarrFetch(ctx, instance, API + '/movie');
      if (res.status !== 200) fetchError = 'HTTP ' + res.status;
      else movies = res.data || [];
    } catch (e) {
      fetchError = e.message;
      if (isNetworkError(e)) sawNetworkError = true;
    }
    if (fetchError) {
      summary.errors.push(instance.name + ': ' + fetchError);
      continue;
    }
    batches.push({ instance, movies });
    summary.found += movies.length;
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
  // ~2% steps so a large library doesn't spam RPC publishes per movie.
  let lastPublishPct = -1;
  const publishActivity = (pct, status, subtitle) => {
    if (status === 'active' && pct - lastPublishPct < 2 && pct < 100) return;
    lastPublishPct = pct;
    try {
      ctx.activity.publish({
        id: 'radarr-sync',
        type: 'sync',
        title: 'Radarr → Otix sync',
        subtitle: subtitle,
        status: status,
        progress: pct,
        icon: 'film',
      });
    } catch (e) {
      /* activity is best-effort */
    }
  };

  try {
    const enabled = await getEnabled(ctx);
    const targets = instanceId ? enabled.filter((i) => String(i.id) === instanceId) : enabled;
    if (targets.length === 0) {
      const err = instanceId ? 'Instance not found or not enabled' : 'No enabled Radarr instances';
      Object.assign(_syncState, { phase: 'error', error: err });
      publishActivity(0, 'error', err);
      await finalizeRun(ctx, runId, { success: false, message: err, errors: runErrors });
      return { success: false, error: err };
    }

    // Pass 1: fetch every instance's movies so the total is known up front.
    // Transient startup/network hiccups (e.g. DNS warm-up right after app
    // launch) shouldn't flip the whole sync to "offline" — retry with a short
    // backoff before falling through to the network-pause path.
    const summary = { instances: targets.length, found: 0, imported: 0, skipped: 0, failed: 0, errors: [] };
    let { batches, sawNetworkError } = await fetchAllInstances(ctx, targets, summary);
    const INITIAL_FETCH_RETRIES = 3;
    for (let attempt = 1; batches.length === 0 && sawNetworkError && attempt < INITIAL_FETCH_RETRIES; attempt++) {
      ctx.logger.warn('Radarr fetch failed — retry ' + attempt + '/' + (INITIAL_FETCH_RETRIES - 1) + ' after ' + attempt * 2 + 's');
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
        await ctx.config.set('_radarr_last_sync', JSON.stringify(emptySummary));
      } catch (e) {
        ctx.logger.warn('Failed to persist sync summary: ' + e.message);
      }
      Object.assign(_syncState, { phase: 'done', lastSyncAt: emptySummary.lastSyncAt });
      publishActivity(100, 'completed', 'Nothing to import');
      await finalizeRun(ctx, runId, {
        success: true,
        message: 'Nothing to import — no movies found',
        ...emptySummary,
        errors: runErrors,
        finishedAt: emptySummary.lastSyncAt,
      });
      return { success: true, message: 'Nothing to import — no movies found', ...emptySummary };
    }
    publishActivity(1, 'active', '0 / ' + total + ' movies');

    // Pass 2: upsert each movie into the local media catalog, tracking
    // current/total for live progress. Idempotent — re-scans refresh titles,
    // artwork, ratings and paths rather than duplicating rows.
    let current = 0;
    for (const { instance, movies } of batches) {
      for (const m of movies) {
        current++;
        _syncState.current = current;
        if (!m.tmdbId) {
          summary.skipped++;
          continue;
        }
        try {
          const { mediaId } = await upsertMedia(ctx, m, instance);
          await recordImportLog(ctx, {
            tmdb_id: m.tmdbId,
            instance_id: instance.id,
            otix_media_id: mediaId,
            status: 'imported',
            title: m.title,
            error: null,
          });
          summary.imported++;
        } catch (e) {
          summary.failed++;
          runErrors.push({ title: m.title, error: e.message, tmdb_id: String(m.tmdbId) });
          await recordImportLog(ctx, {
            tmdb_id: m.tmdbId,
            instance_id: instance.id,
            otix_media_id: null,
            status: 'error',
            title: m.title,
            error: e.message,
          });
          if (summary.errors.length < 20) summary.errors.push(m.title + ': ' + e.message);
        }
        publishActivity(Math.round((current / total) * 100), 'active', current + ' / ' + total + ' movies');
      }
    }

    summary.lastSyncAt = Date.now();
    try {
      await ctx.config.set('_radarr_last_sync', JSON.stringify(summary));
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
    const doneMsg = 'Imported ' + summary.imported + ' movie(s), ' + summary.skipped + ' skipped, ' + summary.failed + ' failed';
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
// Polls each Radarr instance's active download queue and mirrors actively
// downloading movies into the shared `downloads` framework table (tagged
// source='radarr') so the activity downloads panel shows live progress. Also
// flips the local catalog row to `downloading`/`downloaded` so the Movies tab
// reflects real state. Gated by the `trackDownloads` config (default on).

function queueProgress(item) {
  if (String(item.status || '').toLowerCase() === 'completed') return 100;
  if (!item.size) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - item.sizeleft / item.size) * 100)));
}

function queueStatus(item) {
  const s = String(item.status || '').toLowerCase();
  if (s === 'completed') return 'processing'; // Radarr still importing; flips to 'completed' once it leaves the queue
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
      const res = await radarrFetch(ctx, instance, API + '/queue?pageSize=100&includeMovie=true');
      if (res.status !== 200) continue;
      const records = res.data && Array.isArray(res.data.records) ? res.data.records : [];
      const seen = new Set();

      for (const item of records) {
        const tmdbId = item.movie && item.movie.tmdbId;
        if (!tmdbId) continue;
        const queueId = String(item.id);
        seen.add(queueId);
        const title = item.title || (item.movie && item.movie.title) || 'Unknown';
        const status = queueStatus(item);
        const progress = queueProgress(item);

        const existing = await ctx.db.get(
          'SELECT download_id FROM radarr_downloads WHERE instance_id = ? AND queue_id = ?',
          [instance.id, queueId]
        );
        let downloadId = existing && existing.download_id;

        if (!downloadId) {
          const dl = await ctx.downloads.queueItem({
            userId: '',
            mediaItemId: String(tmdbId),
            mediaItemTitle: title,
            nzbTitle: title,
            nzbSize: item.size || 0,
            nzbUrl: '',
            sabnzbdNzoId: null,
            source: 'radarr',
          });
          downloadId = dl && dl.id;
          if (downloadId) {
            await ctx.db.run(
              'INSERT INTO radarr_downloads (download_id, instance_id, queue_id, tmdb_id, movie_id, title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [downloadId, instance.id, queueId, String(tmdbId), item.movieId || null, title, Date.now()]
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
              "UPDATE media SET status = 'downloading', updated_at = datetime('now') WHERE provider = 'tmdb' AND media_type = 'movie' AND provider_id = ?",
              [String(tmdbId)]
            );
            await ctx.db.run(
              "UPDATE radarr_movies SET status = 'downloading' WHERE tmdb_id = ?",
              [String(tmdbId)]
            );
          } catch (e) { /* media row may not exist yet */ }
        }
      }

      // Tracked queue items that left the queue finished (or were removed) →
      // mark the framework row completed and clear the mapping.
      const tracked = await ctx.db.all(
        'SELECT download_id, queue_id, tmdb_id FROM radarr_downloads WHERE instance_id = ?',
        [instance.id]
      );
      for (const t of tracked || []) {
        if (seen.has(String(t.queue_id))) continue;
        try {
          await ctx.downloads.updateStatus(t.download_id, 'completed');
        } catch (e) { /* ignore */ }
        if (t.tmdb_id) {
          try {
            await ctx.db.run(
              "UPDATE media SET status = 'downloaded', updated_at = datetime('now') WHERE provider = 'tmdb' AND media_type = 'movie' AND provider_id = ?",
              [String(t.tmdb_id)]
            );
            await ctx.db.run(
              "UPDATE radarr_movies SET status = 'downloaded' WHERE tmdb_id = ?",
              [String(t.tmdb_id)]
            );
          } catch (e) { /* ignore */ }
        }
        await ctx.db.run('DELETE FROM radarr_downloads WHERE download_id = ?', [t.download_id]);
        summary.completed++;
      }
    } catch (e) {
      ctx.logger.warn('Download status sync failed for ' + instance.name + ': ' + e.message);
    }
  }
  return summary;
}

// ── media.detail (settings catalog drawer) ─────────────────────────────
// Live + local detail for a single synced movie: disk usage, file path,
// quality, monitored, file/codec info. Tries the live instance first and
// falls back to the stored media row when nothing is reachable.

async function qualityProfileName(ctx, instance, profileId) {
  if (profileId == null) return null;
  try {
    const res = await radarrFetch(ctx, instance, API + '/qualityprofile');
    if (res.status === 200 && Array.isArray(res.data)) {
      const p = res.data.find((x) => String(x.id) === String(profileId));
      return p ? p.name : null;
    }
  } catch (e) {
    /* best-effort */
  }
  return null;
}

function movieDetailFromResource(m, instance, qualityName) {
  const images = m.images || [];
  const poster = images.find((i) => i.coverType === 'poster');
  const fanart = images.find((i) => i.coverType === 'fanart');
  const mf = m.movieFile || null;
  return {
    found: true,
    live: true,
    source: 'radarr',
    media_type: 'movie',
    provider_id: String(m.tmdbId),
    source_instance: instance.name || null,
    source_instance_id: instance.id || null,
    title: m.title || null,
    year: m.year || null,
    overview: m.overview || null,
    poster_url: (poster && (poster.remoteUrl || poster.url)) || null,
    backdrop_url: (fanart && (fanart.remoteUrl || fanart.url)) || null,
    genres: Array.isArray(m.genres) ? m.genres : [],
    runtime: m.runtime || null,
    rating: typeof m.rating === 'number' ? m.rating : null,
    status: m.hasFile ? 'downloaded' : m.monitored ? 'requested' : 'missing',
    path: m.path || null,
    size_on_disk: m.sizeOnDisk != null ? m.sizeOnDisk : null,
    monitored: m.monitored != null ? m.monitored : null,
    quality_profile: qualityName || null,
    minimum_availability: m.minimumAvailability || null,
    added: m.added || null,
    file: mf
      ? {
          name: mf.relativePath || null,
          size: mf.size != null ? mf.size : null,
          quality: (mf.quality && mf.quality.quality && mf.quality.quality.name) || null,
          video: (mf.mediaInfo && mf.mediaInfo.videoCodec) || null,
          audio: (mf.mediaInfo && mf.mediaInfo.audioCodec) || null,
        }
      : null,
    error: null,
  };
}

function movieRowDetail(row) {
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
    media_type: 'movie',
    provider_id: String(row.provider_id),
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
    minimum_availability: null,
    added: null,
    file: null,
    error: null,
  };
}

async function movieDetail(ctx, args) {
  const mediaId = String(args.mediaId);
  const instanceId = args.instanceId ? String(args.instanceId) : null;
  const enabled = await getEnabled(ctx);
  const targets = instanceId ? enabled.filter((i) => String(i.id) === instanceId) : enabled;
  for (const instance of targets) {
    try {
      const res = await radarrFetch(ctx, instance, API + '/movie?tmdbId=' + mediaId);
      if (res.status !== 200 || !Array.isArray(res.data)) continue;
      const m = res.data.find((x) => String(x.tmdbId) === mediaId);
      if (!m) continue;
      const qualityName = await qualityProfileName(ctx, instance, m.qualityProfileId);
      return movieDetailFromResource(m, instance, qualityName);
    } catch (e) {
      // try next instance
    }
  }
  const row = await ctx.db.get(
    "SELECT * FROM media WHERE provider = 'tmdb' AND media_type = 'movie' AND provider_id = ?",
    [mediaId]
  );
  if (row) return movieRowDetail(row);
  return { found: false, live: false, source: 'radarr', media_type: 'movie', provider_id: mediaId, error: 'Not found on any enabled instance or in the local catalog' };
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
    if (!instance.id) instance.id = slugify(instance.name || 'radarr');
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
      const res = await radarrFetch(ctx, instance, API + '/system/status');
      if (res.status !== 200) return { ok: false, message: 'HTTP ' + res.status };
      return { ok: true, message: 'Radarr v' + (res.data && res.data.version ? res.data.version : 'connected') };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },

  // Probe an as-yet-unsaved connection: verify the API key and pull the
  // quality profiles + root folders so the generic instances editor can offer
  // them as dropdowns instead of asking for magic IDs/paths. `options` is keyed
  // by sub-field name, each a [{ value, label }] list (see instances-editor).
  'probe': async (ctx, args) => {
    const instance = Object.assign({}, args || {});
    if (!instance.apiKey) return { ok: false, error: 'API Key required' };
    try {
      const status = await radarrFetch(ctx, instance, API + '/system/status');
      if (status.status !== 200) {
        return {
          ok: false,
          error: status.status === 401
            ? 'Authentication failed — check API Key.'
            : 'Connection failed (HTTP ' + status.status + ').',
        };
      }
      const [profilesRes, foldersRes] = await Promise.all([
        radarrFetch(ctx, instance, API + '/qualityprofile'),
        radarrFetch(ctx, instance, API + '/rootfolder'),
      ]);
      return {
        ok: true,
        version: status.data && status.data.version,
        options: {
          qualityProfile: (profilesRes.data || []).map((p) => ({ value: p.name, label: p.name })),
          rootFolder: (foldersRes.data || []).map((f) => ({ value: f.path, label: f.path })),
        },
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
        const res = await radarrFetch(ctx, instance, API + '/movie');
        if (res.status !== 200) {
          results.push({ name: instance.name, url: base, count: 0, movies: [], error: 'HTTP ' + res.status });
          continue;
        }
        const movies = (res.data || []).map((m) => normalizeMovie(m, base));
        results.push({ name: instance.name, url: base, count: movies.length, movies });
      } catch (e) {
        results.push({ name: instance.name, url: base, count: 0, movies: [], error: e.message || String(e) });
      }
    }
    return results;
  },

  'request-movie': async (ctx, args) => {
    const instances = await getInstances(ctx);
    const instance = instances.find((i) => i.id === args.instanceId);
    if (!instance) return { success: false, error: 'Instance not found' };
    return requestMovieOnInstance(ctx, instance, String(args.tmdbId), args);
  },

  'sync-library': async (ctx) => syncLibrary(ctx),

  'sync.now': async (ctx, args) => syncLibrary(ctx, args || {}),

  // Pull Radarr's active queue into the app download framework (manual trigger
  // for testing; the plugin also runs this on a timer when trackDownloads is on).
  'downloads.sync': async (ctx) => syncDownloadStatus(ctx),

  'sync.status': async (ctx) => {
    let lastSync = null;
    try {
      const raw = await ctx.config.get('_radarr_last_sync');
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
  // Supports search + offset pagination for the Movies settings section.
  'movies.list': async (ctx, opts) => {
    const o = opts || {};
    const params = [];
    const clauses = ["provider = 'tmdb'", "media_type = 'movie'"];
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

  // Detail for a synced movie (storage, quality, file, path) — drives the
  // settings catalog drawer. mediaId is the provider_id (tmdbId) the list
  // exposes; falls back to the stored media row when the instance is offline.
  'media.detail': async (ctx, args) => movieDetail(ctx, args || {}),

  // Aggregate per-instance stats (title count, storage on disk, status
  // breakdown) for the Movies section header. Computed from the local
  // radarr_movies mirror so it works offline; merges the enabled instances so
  // a configured-but-not-yet-synced server still shows up.
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
           COALESCE(SUM(CASE WHEN status = 'missing' AND monitored = 0 THEN 1 ELSE 0 END), 0) AS missing
         FROM radarr_movies GROUP BY instance_id, instance_name`
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
    });
    const instances = [];
    const enabled = await getEnabled(ctx);
    for (const i of enabled) {
      const r = (rows || []).find((x) => String(x.instance_id) === String(i.id));
      instances.push(Object.assign({ name: i.name, disabled: false }, r ? toEntry(r) : { id: i.id, total: 0, size_on_disk: 0, downloaded: 0, downloading: 0, requested: 0, missing: 0 }));
    }
    // Include synced instances that are now disabled so their data isn't hidden.
    for (const r of rows || []) {
      if (!instances.some((x) => x.id === String(r.instance_id))) instances.push(Object.assign(toEntry(r), { disabled: true }));
    }
    return { instances };
  },

  // Local request log (radarr_requests), newest first. Joins the local catalog
  // for poster art so the settings UI can render a rich list.
  'requests.list': async (ctx, opts) => {
    const o = opts || {};
    const params = [];
    const clauses = [];
    if (o.search && String(o.search).trim()) {
      clauses.push('(r.title LIKE ? OR r.tmdb_id LIKE ?)');
      const q = '%' + String(o.search).trim() + '%';
      params.push(q, q);
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
    const totalRow = await ctx.db.get('SELECT COUNT(*) c FROM radarr_requests r ' + where, params);
    const limit = Math.max(1, Math.min(Number(o.limit) || 100, 500));
    const offset = Math.max(0, Number(o.offset) || 0);
    const requests = await ctx.db.all(
      'SELECT r.tmdb_id, r.title, r.instance_id, r.instance_name, r.status, r.source, r.already_exists, r.error, r.requested_at, m.poster_url, m.backdrop_url FROM radarr_requests r LEFT JOIN media m ON m.provider = \'tmdb\' AND m.media_type = \'movie\' AND m.provider_id = r.tmdb_id ' +
        where +
        ' ORDER BY r.requested_at DESC LIMIT ? OFFSET ?',
      params.concat([limit, offset])
    );
    return { total: totalRow ? totalRow.c : 0, requests: requests || [], limit, offset };
  },

  // Per-run sync history (radarr_sync_log), newest first.
  'sync.history': async (ctx, opts) => {
    const o = opts || {};
    const totalRow = await ctx.db.get('SELECT COUNT(*) c FROM radarr_sync_log');
    const limit = Math.max(1, Math.min(Number(o.limit) || 30, 200));
    const offset = Math.max(0, Number(o.offset) || 0);
    const runs = await ctx.db.all(
      'SELECT id, instance_id, started_at, finished_at, success, paused, found, imported, skipped, failed, errors, message FROM radarr_sync_log ORDER BY started_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    return { total: totalRow ? totalRow.c : 0, runs: runs || [], limit, offset };
  },
};

// ── plugin entry ───────────────────────────────────────────────────────

module.exports = {
  plugin: (ctx) => {
    ctx.logger.info('Radarr plugin loaded');

    // Auto-request watchlisted movies on every enabled instance that opts in
    ctx.events.on('otix:list:item_added', async (payload) => {
      if (!payload || payload.listId !== 'watchlist') return;
      const item = payload.item || {};
      if (item.mediaType && item.mediaType !== 'movie') return;
      const tmdbId = item.mediaItemId;
      if (!tmdbId) return;

      const enabled = await getEnabled(ctx);
      const targets = enabled.filter((i) => i.autoRequestWatchlist !== false);
      if (targets.length === 0) return;
      ctx.logger.info('Watchlist add → Radarr request', { tmdbId: tmdbId, instances: targets.length });

      for (const instance of targets) {
        try {
          const result = await requestMovieOnInstance(ctx, instance, String(tmdbId), { source: 'watchlist' });
          if (result && result.success) ctx.logger.info('Auto-requested movie on ' + instance.name);
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
          ctx.logger.warn('Radarr status poll failed: ' + e.message);
        }
      }, STATUS_POLL_MS);
      ctx.logger.info('Radarr download-status tracking active');
    };
    startStatusPoll();

    // Optional periodic import into Otix
    const startPoll = async () => {
      try {
        const mins = await ctx.config.get('pollIntervalMinutes');
        const interval = Number(mins) || 0;
        if (interval <= 0) return;
        _pollTimer = setInterval(() => {
          syncLibrary(ctx).catch((e) => ctx.logger.warn('Periodic Radarr sync failed: ' + e.message));
        }, interval * 60 * 1000);
        ctx.logger.info('Radarr auto-import every ' + interval + ' min');
      } catch (e) {
        ctx.logger.warn('Failed to start Radarr poll: ' + e.message);
      }
    };
    startPoll();

    return () => {
      if (_pollTimer) clearInterval(_pollTimer);
      _pollTimer = null;
      if (_statusTimer) clearInterval(_statusTimer);
      _statusTimer = null;
      stopReconnect();
      ctx.logger.info('Radarr plugin unloaded');
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
        const res = await radarrFetch(ctx, instance, API + '/system/status');
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
    if (!context || context.mediaType !== 'movie') return { widgets: [] };

    const enabled = await getEnabled(ctx);
    if (enabled.length === 0) return { widgets: [] };

    const tmdbId = context.mediaId;
    const statusMap = {};
    const fileMap = {};
    await Promise.all(enabled.map(async (instance) => {
      try {
        // Authoritative check against the library; fall back to lookup/tmdb only
        // if the library endpoint is unusable. lookup/tmdb also carries hasFile.
        let st = await movieStatusOnInstance(ctx, instance, tmdbId);
        if (st === null) {
          const res = await radarrFetch(ctx, instance, API + '/movie/lookup/tmdb?tmdbId=' + tmdbId);
          if (res.status !== 200) {
            statusMap[instance.id] = 'error';
            return;
          }
          const movie = res.data;
          if (!movie || !movie.id) {
            statusMap[instance.id] = 'not_exists';
            return;
          }
          st = { found: true, hasFile: !!movie.hasFile, file: fileFromLookup(movie) };
        }
        if (!st.found) {
          statusMap[instance.id] = 'not_exists';
          return;
        }
        statusMap[instance.id] = st.hasFile ? 'downloaded' : 'requested';
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
            mediaType: 'movie',
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
