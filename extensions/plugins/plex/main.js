// Plex plugin — own PIN OAuth, account-wide server discovery, library sync,
// and "Play on Plex" deep links from the media detail page.
//
// OAuth uses Plex's PIN flow: the plugin creates a PIN on plex.tv, the OAuth
// window (oauth-window.ts, tokenExtraction type 'pin') polls the PIN endpoint
// until the user authorizes, then resolves with the account authToken. The
// token is stored only in the local plugin config — it never touches Otix
// servers.

const PLEX_TV_BASE = 'https://plex.tv';
const PLEX_AUTH_URL = 'https://app.plex.tv/auth';
const PLEX_WEB_APP = 'https://app.plex.tv/web/app';
const PRODUCT = 'Otix';
const VERSION = '0.1.0';

let _pendingPin = null; // { id, code, clientId }
let _syncing = false;
let _syncProgress = { phase: 'idle', current: 0, total: 0, lastTrack: '' };
let _pollTimer = null;

// ── Config/state helpers ──────────────────────────────────────────────────

async function getClientId(ctx) {
  let id = await ctx.config.get('_plex_client_id');
  if (!id) {
    const hasCrypto = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function';
    id = hasCrypto
      ? crypto.randomUUID()
      : 'otix-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    await ctx.config.set('_plex_client_id', id);
  }
  return id;
}

async function getToken(ctx) {
  const t = await ctx.config.get('_plex_token');
  return (typeof t === 'string' && t.length > 0) ? t : null;
}

function plexHeaders(clientId, token) {
  const h = {
    'Accept': 'application/json',
    'X-Plex-Client-Identifier': clientId,
    'X-Plex-Product': PRODUCT,
    'X-Plex-Version': VERSION,
  };
  if (token) h['X-Plex-Token'] = token;
  return h;
}

// ctx.fetch returns { status, body } where body is always text.
async function httpJson(ctx, url, opts) {
  const res = await ctx.fetch(url, opts);
  let data = null;
  if (res && res.body) {
    try { data = JSON.parse(res.body); } catch { data = res.body; }
  }
  return { status: res ? res.status : 0, data };
}

// ── OAuth (PIN flow) ──────────────────────────────────────────────────────

async function dataAuthGetLoginUrl(ctx, hint) {
  if (await getToken(ctx)) {
    return { url: null, error: 'Plex is already connected. Sign out first to reconnect.' };
  }
  const clientId = await getClientId(ctx);
  const res = await httpJson(ctx, PLEX_TV_BASE + '/api/v2/pins?strong=true', {
    method: 'POST',
    headers: plexHeaders(clientId),
  });
  if (res.status < 200 || res.status >= 300 || !res.data || !res.data.id || !res.data.code) {
    return { url: null, error: 'Failed to start Plex sign-in (HTTP ' + res.status + '). Please try again.' };
  }
  const pin = res.data;
  _pendingPin = { id: String(pin.id), code: pin.code, clientId };
  const params = new URLSearchParams({
    clientID: clientId,
    code: pin.code,
    forwardUrl: PLEX_WEB_APP,
    'context[device][product]': PRODUCT,
    'context[device][version]': VERSION,
  });
  // The authToken appears on the PIN endpoint once the user authorizes — the
  // OAuth window polls it (tokenExtraction type 'pin') and resolves with it.
  const pollUrl = PLEX_TV_BASE + '/api/v2/pins/' + pin.id + '?code=' + encodeURIComponent(pin.code);
  return {
    url: PLEX_AUTH_URL + '#!?' + params.toString(),
    redirectPattern: 'app.plex.tv/web/app',
    provider: 'plex',
    tokenExtraction: {
      type: 'pin',
      poll: {
        url: pollUrl,
        headers: plexHeaders(clientId),
        tokenPath: ['authToken'],
        intervalMs: 2500,
        timeoutMs: 300000,
      },
    },
  };
}

async function dataAuthHandleCallback(ctx, code) {
  if (!code) {
    _pendingPin = null;
    return { success: false, error: 'No authorization received. Please try again.' };
  }
  // code is the Plex account authToken resolved by the PIN poll.
  await ctx.config.set('_plex_token', code);
  _pendingPin = null;
  try {
    const me = await fetchAccount(ctx, code);
    if (me) {
      await ctx.config.set('_plex_username', me.username || me.title || '');
    }
  } catch (e) { /* account info is best-effort */ }
  try {
    ctx.notifications.send('Plex', 'Plex connected — sync your libraries to get started');
  } catch (e) { /* best-effort */ }
  return { success: true, provider: 'plex', displayName: 'Plex' };
}

async function dataAuthLogout(ctx) {
  _pendingPin = null;
  await ctx.config.set('_plex_token', '');
  await ctx.config.set('_plex_username', '');
  // Leave discovered servers + library rows; a re-sync after reconnect refreshes them.
  return { success: true, message: 'Plex disconnected' };
}

async function fetchAccount(ctx, token) {
  const clientId = await getClientId(ctx);
  const res = await httpJson(ctx, PLEX_TV_BASE + '/api/v2/user', { headers: plexHeaders(clientId, token) });
  if (res.status !== 200 || !res.data) return null;
  return res.data;
}

// ── Server discovery ──────────────────────────────────────────────────────

function pickConnection(connections) {
  if (!connections) return null;
  const list = Array.isArray(connections) ? connections : [connections];
  const local = list.find((c) => c.local && !c.relay);
  if (local) return local;
  const nonRelay = list.find((c) => !c.relay);
  return nonRelay || list[0] || null;
}

// Fetches the account's servers from plex.tv and upserts them into plex_servers.
async function discoverServers(ctx) {
  const token = await getToken(ctx);
  if (!token) return [];
  const clientId = await getClientId(ctx);
  const res = await httpJson(ctx, PLEX_TV_BASE + '/api/v2/resources?includeHttps=1&includeRelay=1', {
    headers: plexHeaders(clientId, token),
  });
  if (res.status !== 200 || !Array.isArray(res.data)) return [];

  const rows = [];
  for (const r of res.data) {
    const provides = String(r.provides || '').split(',').map((s) => s.trim());
    if (!provides.includes('server')) continue;
    const conn = pickConnection(r.connections);
    if (!conn) continue;
    rows.push({
      machine_id: r.clientIdentifier || r.machineIdentifier,
      name: r.name || 'Plex Server',
      address: conn.address,
      port: Number(conn.port) || 32400,
      use_https: conn.protocol === 'https' ? 1 : 0,
      token: r.accessToken || null,
      local: r.presence === 1 ? 1 : 0,
      last_seen: Date.now(),
      is_reachable: 1,
      connections: JSON.stringify(r.connections || []),
    });
  }

  for (const s of rows) {
    try {
      await ctx.db.run(
        'INSERT INTO plex_servers (machine_id, name, address, port, use_https, token, local, last_seen, is_reachable, connections) VALUES (?,?,?,?,?,?,?,?,?,?) ' +
        'ON CONFLICT (machine_id) DO UPDATE SET name=excluded.name, address=excluded.address, port=excluded.port, ' +
        'use_https=excluded.use_https, token=excluded.token, local=excluded.local, last_seen=excluded.last_seen, is_reachable=excluded.is_reachable, connections=excluded.connections',
        [s.machine_id, s.name, s.address, s.port, s.use_https, s.token, s.local, s.last_seen, s.is_reachable, s.connections],
      );
    } catch (e) { /* skip unstoreable server */ }
  }
  return rows;
}

async function listServers(ctx) {
  return (await ctx.db.all('SELECT * FROM plex_servers ORDER BY name')) || [];
}

// Ordered candidate base URLs for a server: non-relay connections first (local
// preferred), relay connections last. Falls back to the single address columns
// for servers discovered before the connections column existed.
function serverBases(server) {
  let list = [];
  if (server.connections) {
    try {
      const parsed = JSON.parse(server.connections);
      if (Array.isArray(parsed)) list = parsed;
    } catch { /* fall through to single-column fallback */ }
  }
  if (list.length === 0 && server.address) {
    list = [{ protocol: server.use_https ? 'https' : 'http', address: server.address, port: server.port }];
  }
  const rank = (c) => (c.relay ? 2 : c.local ? 0 : 1);
  return list
    .slice()
    .sort((a, b) => rank(a) - rank(b))
    .map((c) => {
      // Prefer the API-provided uri (plex.direct hostname): Plex TLS certs are
      // issued for plex.direct domains, so rebuilding https://<public-ip> from
      // address/port fails certificate validation.
      if (c.uri) return String(c.uri).replace(/\/+$/, '');
      return (c.protocol || 'http') + '://' + c.address + ':' + (Number(c.port) || 32400);
    });
}

// A server's local connection is often unreachable (different LAN / stale IP),
// so resolve the first connection that actually answers /library/sections and
// cache it per server. Returns { base, secRes } or null when none reachable.
const _reachableBase = {};

async function resolveServer(ctx, server, clientId) {
  const headers = plexHeaders(clientId, server.token);
  const cached = _reachableBase[server.machine_id];
  if (cached) {
    try {
      const probe = await httpJson(ctx, cached + '/library/sections', { headers });
      if (probe.status === 200 && probe.data) return { base: cached, secRes: probe };
    } catch { /* cached base stale — re-resolve */ }
  }
  for (const candidate of serverBases(server)) {
    try {
      const r = await httpJson(ctx, candidate + '/library/sections', { headers });
      if (r.status === 200 && r.data) {
        _reachableBase[server.machine_id] = candidate;
        return { base: candidate, secRes: r };
      }
    } catch { /* try next connection */ }
  }
  delete _reachableBase[server.machine_id];
  return null;
}

// ── Sync ──────────────────────────────────────────────────────────────────

// Extract a TMDB id from a Plex metadata item (Guid[] in newer servers,
// legacy agent guid in older ones). Returns null when the item has no TMDB id.
function tmdbFromItem(item) {
  if (item && Array.isArray(item.Guid)) {
    for (const g of item.Guid) {
      const id = g && g.id;
      if (typeof id === 'string' && id.startsWith('tmdb://')) return id.slice('tmdb://'.length);
    }
  }
  const legacy = item && item.guid;
  if (typeof legacy === 'string' && legacy.includes('themoviedb')) {
    const m = legacy.match(/(\d+)/);
    if (m) return m[1];
  }
  return null;
}

async function syncLibrary(ctx, serverId) {
  let servers = [];
  try {
    servers = await discoverServers(ctx);
  } catch (e) {
    return { success: false, error: 'Failed to reach plex.tv: ' + (e.message || e) };
  }
  if (servers.length === 0) {
    return { success: false, error: 'No Plex servers found on your account.' };
  }
  let targets = servers;
  if (serverId) targets = servers.filter((s) => s.machine_id === serverId);
  if (targets.length === 0) return { success: false, error: 'Server not found. Re-sync your Plex account.' };

  const clientId = await getClientId(ctx);
  const wantsMovies = (await ctx.config.get('syncMovieLibraries')) !== false;
  const wantsShows = (await ctx.config.get('syncShowLibraries')) !== false;
  const startedAt = Date.now();
  _syncProgress = { phase: 'running', current: 0, total: 0, lastTrack: '' };

  let sections = 0, found = 0, matched = 0, failed = 0;
  const errors = [];

  for (const server of targets) {
    const resolved = await resolveServer(ctx, server, clientId);
    if (!resolved) {
      errors.push({ title: server.name, error: 'unreachable: no reachable connection (' + serverBases(server).join(', ') + ')' });
      failed++;
      continue;
    }
    const { base, secRes } = resolved;
    const secList = secRes.data.MediaContainer && secRes.data.MediaContainer.Directory;
    if (!Array.isArray(secList)) continue;

    const wanted = secList.filter((s) => {
      if (s.type === 'movie') return wantsMovies;
      if (s.type === 'show') return wantsShows;
      return false;
    });
    sections += wanted.length;

    for (const lib of wanted) {
      let allRes;
      try {
        allRes = await httpJson(ctx, base + '/library/sections/' + lib.key + '/all?includeGuids=1', {
          headers: plexHeaders(clientId, server.token),
        });
      } catch (e) {
        errors.push({ title: server.name + '/' + lib.title, error: 'unreachable: ' + (e.message || e) });
        failed++;
        continue;
      }
      if (allRes.status !== 200 || !allRes.data) {
        errors.push({ title: server.name + '/' + lib.title, error: 'HTTP ' + allRes.status });
        failed++;
        continue;
      }
      const items = allRes.data.MediaContainer && allRes.data.MediaContainer.Metadata;
      if (!Array.isArray(items)) continue;

      _syncProgress.total += items.length;
      for (const item of items) {
        _syncProgress.current++;
        _syncProgress.lastTrack = item.title || '';
        const tmdbId = tmdbFromItem(item);
        if (!tmdbId) continue; // not TMDB-matched — skipped, not failed
        found++;
        const mediaType = item.type === 'show' ? 'show' : 'movie';
        try {
          await ctx.db.run(
            'INSERT INTO plex_library (tmdb_id, media_type, rating_key, server_id, server_name, title, year, guid, added_at) ' +
            'VALUES (?,?,?,?,?,?,?,?,?) ' +
            'ON CONFLICT (rating_key, server_id) DO UPDATE SET tmdb_id=excluded.tmdb_id, media_type=excluded.media_type, ' +
            'server_name=excluded.server_name, title=excluded.title, year=excluded.year, guid=excluded.guid, added_at=excluded.added_at',
            [tmdbId, mediaType, String(item.ratingKey), server.machine_id, server.name, item.title, item.year || null, item.guid || null, Date.now()],
          );
          matched++;
        } catch (e) {
          failed++;
        }
      }
    }
  }

  _syncProgress = { phase: 'idle', current: 0, total: 0, lastTrack: '' };
  const finishedAt = Date.now();
  const logResult = {
    started_at: startedAt,
    finished_at: finishedAt,
    success: failed === 0 ? 1 : 0,
    sections,
    found,
    matched,
    failed,
    errors: JSON.stringify(errors.slice(0, 100)),
    message: 'Synced ' + sections + ' librar' + (sections === 1 ? 'y' : 'ies') + (targets.length > 1 ? ' across ' + targets.length + ' servers' : ''),
  };
  try {
    await ctx.db.run(
      'INSERT INTO plex_sync_log (started_at, finished_at, success, sections, found, matched, failed, errors, message) VALUES (?,?,?,?,?,?,?,?,?)',
      [logResult.started_at, logResult.finished_at, logResult.success, logResult.sections, logResult.found, logResult.matched, logResult.failed, logResult.errors, logResult.message],
    );
  } catch (e) { /* history is best-effort */ }

  try {
    ctx.notifications.send('Plex', 'Sync complete — ' + matched + ' titles matched' + (failed ? ', ' + failed + ' errors' : ''));
  } catch (e) { /* best-effort */ }

  return {
    success: true,
    matched,
    failed,
    sections,
    found,
    results: targets.map((s) => ({ ok: true, title: s.name })),
    message: logResult.message,
  };
}

async function dataSyncStatus(ctx) {
  const servers = await listServers(ctx);
  const lastRun = await ctx.db.get('SELECT * FROM plex_sync_log ORDER BY id DESC LIMIT 1');
  return {
    phase: _syncProgress.phase,
    current: _syncProgress.current,
    total: _syncProgress.total,
    lastTrack: _syncProgress.lastTrack,
    instance_count: servers.length,
    instances: servers.map((s) => ({ id: s.machine_id, name: s.name })),
    last: lastRun
      ? {
          at: new Date(lastRun.started_at).toISOString(),
          imported: lastRun.matched,
          skipped: 0,
          failed: lastRun.failed,
          found: lastRun.found,
          errors: lastRun.errors ? JSON.parse(lastRun.errors).length : 0,
        }
      : null,
  };
}

async function dataSyncNow(ctx, opts) {
  if (_syncing) {
    return { alreadyRunning: true, success: false, error: 'A sync is already running' };
  }
  _syncing = true;
  try {
    return await syncLibrary(ctx, opts && opts.instanceId);
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  } finally {
    _syncing = false;
  }
}

async function dataSyncHistory(ctx, opts) {
  const limit = Number((opts && opts.limit) || 50);
  const offset = Number((opts && opts.offset) || 0);
  const totalRow = await ctx.db.get('SELECT COUNT(*) c FROM plex_sync_log');
  const runs = await ctx.db.all('SELECT * FROM plex_sync_log ORDER BY id DESC LIMIT ? OFFSET ?', [limit, offset]);
  return {
    total: (totalRow && totalRow.c) || 0,
    runs: (runs || []).map((r) => ({
      id: r.id,
      instance_id: null,
      started_at: r.started_at,
      finished_at: r.finished_at,
      success: r.success,
      paused: 0,
      found: r.found,
      imported: r.matched,
      skipped: 0,
      failed: r.failed,
      errors: r.errors,
      message: r.message,
    })),
  };
}

// ── Library list (settings "Library" section) ────────────────────────────

async function dataMoviesList(ctx, opts) {
  const search = (opts && opts.search) || '';
  const limit = Number((opts && opts.limit) || 48);
  const offset = Number((opts && opts.offset) || 0);
  let rows, totalRow;
  if (search) {
    const like = '%' + search + '%';
    rows = await ctx.db.all(
      "SELECT * FROM plex_library WHERE media_type = 'movie' AND (title LIKE ? OR tmdb_id LIKE ?) ORDER BY added_at DESC LIMIT ? OFFSET ?",
      [like, search + '%', limit, offset],
    );
    totalRow = await ctx.db.get(
      "SELECT COUNT(*) c FROM plex_library WHERE media_type = 'movie' AND (title LIKE ? OR tmdb_id LIKE ?)",
      [like, search + '%'],
    );
  } else {
    rows = await ctx.db.all("SELECT * FROM plex_library WHERE media_type = 'movie' ORDER BY added_at DESC LIMIT ? OFFSET ?", [limit, offset]);
    totalRow = await ctx.db.get("SELECT COUNT(*) c FROM plex_library WHERE media_type = 'movie'");
  }
  return {
    total: (totalRow && totalRow.c) || 0,
    movies: (rows || []).map((r) => ({
      provider_id: r.tmdb_id,
      title: r.title || r.tmdb_id,
      poster_url: null,
      backdrop_url: null,
      year: r.year,
      rating: null,
      source_instance: r.server_name,
      status: 'downloaded',
    })),
  };
}

// ── Play on Plex ──────────────────────────────────────────────────────────

async function dataPlayOpen(ctx, opts) {
  const serverId = opts && opts.serverId;
  const ratingKey = opts && opts.ratingKey;
  if (!serverId || !ratingKey) return { success: false, error: 'Missing play target.' };
  const server = await ctx.db.get('SELECT * FROM plex_servers WHERE machine_id = ?', [String(serverId)]);
  if (!server) return { success: false, error: 'Plex server not found. Re-sync your libraries.' };
  const url = PLEX_WEB_APP + '#!/server/' + server.machine_id + '/details?key=%2Flibrary%2Fmetadata%2F' + encodeURIComponent(String(ratingKey));
  return { success: true, url };
}

async function dataPlayStream(ctx, opts) {
  const serverId = opts && opts.serverId;
  const ratingKey = opts && (opts.ratingKey || opts.itemId);
  if (!serverId || !ratingKey) return { success: false, error: 'Missing play target.' };

  const server = await ctx.db.get('SELECT * FROM plex_servers WHERE machine_id = ?', [String(serverId)]);
  if (!server) return { success: false, error: 'Plex server not found. Re-sync your libraries.' };

  const clientId = await getClientId(ctx);
  const resolved = await resolveServer(ctx, server, clientId);
  if (!resolved || !resolved.base) {
    return { success: false, error: 'Could not connect to Plex server.' };
  }

  const token = server.token;
  const baseUrl = resolved.base;
  const headers = plexHeaders(clientId, token);

  const metaRes = await httpJson(ctx, `${baseUrl}/library/metadata/${ratingKey}`, { headers });
  if (metaRes.status !== 200 || !metaRes.data) {
    return { success: false, error: 'Failed to fetch item metadata from Plex.' };
  }

  const item = metaRes.data.MediaContainer?.Metadata?.[0];
  if (!item) return { success: false, error: 'Item not found on Plex server.' };

  const media = item.Media?.[0];
  const part = media?.Part?.[0];
  if (!part) return { success: false, error: 'No playable media parts found on Plex.' };

  const playSessionId = (opts && opts.playSessionId) || 'otix-plex-' + Date.now();
  const directUrl = `${baseUrl}${part.key}?X-Plex-Token=${encodeURIComponent(token)}`;

  const streams = part.Stream || [];
  const audioTracks = streams
    .filter((s) => s.streamType === 2)
    .map((s) => ({
      id: String(s.id),
      index: Number(s.index),
      label: s.displayTitle || s.title || `${s.language || 'Audio'} (${s.codec || 'stereo'})`,
      language: s.languageCode || s.language || 'und',
      codec: s.codec || 'aac',
      channels: Number(s.channels) || 2,
    }));

  const subtitles = streams
    .filter((s) => s.streamType === 3)
    .map((s) => ({
      id: String(s.id),
      index: Number(s.index),
      label: s.displayTitle || s.title || s.language || 'Subtitles',
      language: s.languageCode || s.language || 'und',
      url: s.key ? `${baseUrl}${s.key}?X-Plex-Token=${encodeURIComponent(token)}` : undefined,
      format: s.codec === 'pgs' ? 'pgs' : s.codec === 'ass' ? 'ass' : s.codec === 'srt' ? 'srt' : 'vtt',
      isExternal: Boolean(s.key),
      requiresBurnIn: s.codec === 'pgs' || s.codec === 'ass',
    }));

  const audioStreamParam = opts && opts.audioIndex != null ? `&audioStreamID=${opts.audioIndex}` : '';
  const subStreamParam = opts && opts.subtitleIndex != null ? `&subtitleStreamID=${opts.subtitleIndex}` : '';

  const hlsUrl = `${baseUrl}/video/:/transcode/universal/start.m3u8?path=${encodeURIComponent(
    '/library/metadata/' + ratingKey
  )}&mediaIndex=0&partIndex=0&protocol=hls&fastSeek=1&directPlay=0&directStream=1&hasMDE=1&session=${encodeURIComponent(
    playSessionId
  )}&X-Plex-Client-Identifier=${encodeURIComponent(clientId)}&X-Plex-Product=Otix&X-Plex-Platform=Desktop&X-Plex-Token=${encodeURIComponent(
    token
  )}${audioStreamParam}${subStreamParam}`;

  return {
    success: true,
    session: {
      source: 'plex',
      serverUrl: baseUrl,
      token,
      itemId: String(ratingKey),
      title: item.title || item.originalTitle || '',
      subtitle: item.year ? String(item.year) : item.parentTitle ? `${item.parentTitle} - ${item.title}` : undefined,
      playSessionId,
      directUrl,
      hlsUrl,
      audioTracks,
      subtitles,
      startPositionMs: Number(item.viewOffset) || 0,
      durationMs: Number(item.duration) || 0,
      container: media?.container || 'mp4',
      videoCodec: media?.videoCodec || 'h264',
      audioCodec: media?.audioCodec || 'aac',
    },
  };
}

async function dataSessionProgress(ctx, opts) {
  const server = await ctx.db.get('SELECT * FROM plex_servers ORDER BY last_seen DESC LIMIT 1');
  if (!server || !opts?.itemId) return { success: false };

  const clientId = await getClientId(ctx);
  const resolved = await resolveServer(ctx, server, clientId);
  if (!resolved || !resolved.base) return { success: false };

  const state = opts.isPaused ? 'paused' : 'playing';
  const url = `${resolved.base}/:/timeline?ratingKey=${encodeURIComponent(opts.itemId)}&key=${encodeURIComponent(
    '/library/metadata/' + opts.itemId
  )}&state=${state}&time=${opts.positionMs || 0}&duration=${opts.durationMs || 0}&X-Plex-Client-Identifier=${encodeURIComponent(
    clientId
  )}&X-Plex-Session-Identifier=${encodeURIComponent(opts.playSessionId || '')}&X-Plex-Token=${encodeURIComponent(server.token)}`;

  await ctx.fetch(url, { method: 'GET', headers: plexHeaders(clientId, server.token) });
  return { success: true };
}

async function dataSessionStop(ctx, opts) {
  const server = await ctx.db.get('SELECT * FROM plex_servers ORDER BY last_seen DESC LIMIT 1');
  if (!server || !opts?.itemId) return { success: false };

  const clientId = await getClientId(ctx);
  const resolved = await resolveServer(ctx, server, clientId);
  if (!resolved || !resolved.base) return { success: false };

  const url = `${resolved.base}/:/timeline?ratingKey=${encodeURIComponent(opts.itemId)}&key=${encodeURIComponent(
    '/library/metadata/' + opts.itemId
  )}&state=stopped&time=${opts.positionMs || 0}&X-Plex-Client-Identifier=${encodeURIComponent(
    clientId
  )}&X-Plex-Session-Identifier=${encodeURIComponent(opts.playSessionId || '')}&X-Plex-Token=${encodeURIComponent(server.token)}`;

  await ctx.fetch(url, { method: 'GET', headers: plexHeaders(clientId, server.token) });
  return { success: true };
}

// ── Slots ─────────────────────────────────────────────────────────────────
//
// media/detail/actions — "Play on Plex" button on the detail page.
// media/card/badges    — "On Plex" pill on media cards (grids, search, lists).

async function slotRender(ctx, location, context) {
  if (location === 'media/card/badges') return renderCardBadges(ctx, context);
  if (location !== 'media/detail/actions') return { widgets: [] };
  if (!context || !context.mediaType || !context.mediaId) return { widgets: [] };
  const type = context.mediaType === 'show' ? 'show' : context.mediaType === 'movie' ? 'movie' : null;
  if (!type) return { widgets: [] };
  if (!(await getToken(ctx))) return { widgets: [] };

  const rows = await ctx.db.all('SELECT * FROM plex_library WHERE tmdb_id = ? AND media_type = ?', [String(context.mediaId), type]);
  if (!rows || rows.length === 0) return { widgets: [] };

  const servers = {};
  for (const s of await listServers(ctx)) servers[s.machine_id] = s;

  const instances = rows
    .filter((r) => servers[r.server_id])
    .map((r) => ({
      id: r.server_id + '|' + r.rating_key,
      serverId: r.server_id,
      name: servers[r.server_id].name,
      ratingKey: r.rating_key,
      title: r.title || '',
    }));
  if (instances.length === 0) return { widgets: [] };

  return {
    widgets: [
      {
        type: 'play-button',
        props: { mediaType: type, mediaId: String(context.mediaId), instances },
      },
    ],
  };
}

// A title is "available on Plex" when it exists in any synced library. Cards
// pass the TMDB id (movie/show) in the slot context.
async function renderCardBadges(ctx, context) {
  if (!context || !context.tmdbId || !context.mediaType) return { widgets: [] };
  const type = context.mediaType === 'show' ? 'show' : context.mediaType === 'movie' ? 'movie' : null;
  if (!type) return { widgets: [] };
  if (!(await getToken(ctx))) return { widgets: [] };

  const row = await ctx.db.get(
    'SELECT 1 FROM plex_library WHERE tmdb_id = ? AND media_type = ? LIMIT 1',
    [String(context.tmdbId), type],
  );
  if (!row) return { widgets: [] };

  return {
    widgets: [
      {
        type: 'badge',
        props: { text: 'On Plex', tone: 'success' },
      },
    ],
  };
}

// ── Exports ───────────────────────────────────────────────────────────────

const data = {
  'auth.getLoginUrl': dataAuthGetLoginUrl,
  'auth.handleCallback': dataAuthHandleCallback,
  'auth.logout': dataAuthLogout,
  'sync.status': dataSyncStatus,
  'sync.now': dataSyncNow,
  'sync.history': dataSyncHistory,
  'movies.list': dataMoviesList,
  'play.open': dataPlayOpen,
  'play.stream': dataPlayStream,
  'session.progress': dataSessionProgress,
  'session.stop': dataSessionStop,
};

module.exports = {
  plugin: (ctx) => {
    ctx.logger.info('Plex plugin loaded');

    const startPoll = async () => {
      try {
        const mins = Number((await ctx.config.get('pollIntervalMinutes')) || 0);
        if (mins <= 0) return;
        if (_pollTimer) clearInterval(_pollTimer);
        _pollTimer = setInterval(() => {
          dataSyncNow(ctx, {}).catch((e) => ctx.logger.warn('Plex auto-sync failed: ' + e.message));
        }, mins * 60 * 1000);
        ctx.logger.info('Plex auto-sync every ' + mins + ' min');
      } catch (e) {
        ctx.logger.warn('Failed to start Plex auto-sync: ' + e.message);
      }
    };
    startPoll();

    return () => {
      if (_pollTimer) clearInterval(_pollTimer);
      _pollTimer = null;
      ctx.logger.info('Plex plugin unloaded');
    };
  },

  data,

  status: async (ctx) => {
    const token = await getToken(ctx);
    const username = await ctx.config.get('_plex_username');
    const servers = await listServers(ctx);
    const libraryCount = await ctx.db.get('SELECT COUNT(*) c FROM plex_library');
    return {
      plex: token ? 'connected' : 'not connected',
      plex_username: token ? (username || '') : '',
      server_count: servers.length,
      library_count: (libraryCount && libraryCount.c) || 0,
    };
  },

  test: async (ctx) => {
    const token = await getToken(ctx);
    if (!token) return { passed: false, failures: ['Plex is not connected. Sign in first.'] };
    const account = await fetchAccount(ctx, token);
    if (!account) return { passed: false, failures: ['Could not reach plex.tv with the saved token. Sign in again.'] };
    return { passed: true, message: 'Connected to Plex as ' + (account.username || account.title || 'your account') };
  },

  slotRender,

  handleAction: async (ctx, actionKey) => {
    if (actionKey === 'sync-library') return dataSyncNow(ctx, {});
    return { success: false, error: 'Unknown action: ' + actionKey };
  },
};
