// Jellyfin desktop plugin — library sync, in-app streaming, and deep links.
// Communicates with user-hosted Jellyfin instances via HTTP REST API.
// GPL-2.0 compliant: external network consumer only; no GPL libraries linked.

const PRODUCT = 'Otix';
const VERSION = '1.0.0';

let _syncing = false;
let _syncProgress = { phase: 'idle', current: 0, total: 0, lastTrack: '' };
let _pollTimer = null;

// ── Helpers ───────────────────────────────────────────────────────────────

async function getClientId(ctx) {
  let id = await ctx.config.get('_jellyfin_client_id');
  if (!id) {
    const hasCrypto = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function';
    id = hasCrypto
      ? crypto.randomUUID()
      : 'otix-jf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    await ctx.config.set('_jellyfin_client_id', id);
  }
  return id;
}

function jellyfinHeaders(clientId, token) {
  const authHeader = `MediaBrowser Client="${PRODUCT}", Device="Desktop", DeviceId="${clientId}", Version="${VERSION}"${
    token ? `, Token="${token}"` : ''
  }`;
  const h = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: authHeader,
    'X-Emby-Authorization': authHeader,
  };
  if (token) {
    h['X-Emby-Token'] = token;
  }
  return h;
}

async function httpJson(ctx, url, opts) {
  const res = await ctx.fetch(url, opts);
  let data = null;
  if (res && res.body) {
    try {
      data = JSON.parse(res.body);
    } catch {
      data = res.body;
    }
  }
  return { status: res ? res.status : 0, data };
}

// ── Authentication ────────────────────────────────────────────────────────

async function dataAuthTest(ctx) {
  const serverUrl = String((await ctx.config.get('serverUrl')) || '').trim().replace(/\/+$/, '');
  if (!serverUrl) return { success: false, error: 'Please configure a Jellyfin server URL.' };

  const clientId = await getClientId(ctx);
  const res = await httpJson(ctx, `${serverUrl}/System/Info/Public`, {
    headers: jellyfinHeaders(clientId),
  });
  if (res.status >= 200 && res.status < 300 && res.data) {
    return {
      success: true,
      serverName: res.data.ServerName || 'Jellyfin Server',
      version: res.data.Version || '',
      id: res.data.Id || '',
    };
  }
  return { success: false, error: `Could not connect to Jellyfin (HTTP ${res.status}).` };
}

async function dataAuthLogin(ctx) {
  const serverUrl = String((await ctx.config.get('serverUrl')) || '').trim().replace(/\/+$/, '');
  if (!serverUrl) return { success: false, error: 'Please configure a Jellyfin server URL.' };

  const authMode = (await ctx.config.get('authMode')) || 'credentials';
  const clientId = await getClientId(ctx);

  if (authMode === 'apiKey') {
    const apiKey = String((await ctx.config.get('apiKey')) || '').trim();
    if (!apiKey) return { success: false, error: 'Please enter a Jellyfin API Key.' };

    const res = await httpJson(ctx, `${serverUrl}/System/Info`, {
      headers: jellyfinHeaders(clientId, apiKey),
    });
    if (res.status === 200 && res.data) {
      const serverId = res.data.Id || 'jellyfin-server';
      const serverName = res.data.ServerName || 'Jellyfin Server';
      // Fetch users to get default admin ID
      const usersRes = await httpJson(ctx, `${serverUrl}/Users`, {
        headers: jellyfinHeaders(clientId, apiKey),
      });
      const userId = usersRes.data?.[0]?.Id || '';

      await ctx.db.run(
        'INSERT OR REPLACE INTO jellyfin_servers (server_id, name, url, auth_mode, token, user_id, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [serverId, serverName, serverUrl, 'apiKey', apiKey, userId, Date.now()]
      );

      await ctx.config.set('_jellyfin_token', apiKey);
      await ctx.config.set('_jellyfin_user_id', userId);
      await ctx.config.set('_jellyfin_server_id', serverId);
      return { success: true, serverName, userId };
    }
    return { success: false, error: `Invalid Jellyfin API Key (HTTP ${res.status}).` };
  }

  // Credentials mode
  const username = String((await ctx.config.get('username')) || '').trim();
  const password = String((await ctx.config.get('password')) || '');
  if (!username) return { success: false, error: 'Please enter your Jellyfin username.' };

  const authRes = await httpJson(ctx, `${serverUrl}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: jellyfinHeaders(clientId),
    body: JSON.stringify({ Username: username, Pw: password }),
  });

  if (authRes.status === 200 && authRes.data && authRes.data.AccessToken) {
    const token = authRes.data.AccessToken;
    const userId = authRes.data.User?.Id || '';
    const serverId = authRes.data.ServerId || 'jellyfin-server';
    const serverName = authRes.data.User?.ServerName || 'Jellyfin Server';

    await ctx.db.run(
      'INSERT OR REPLACE INTO jellyfin_servers (server_id, name, url, auth_mode, token, user_id, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [serverId, serverName, serverUrl, 'credentials', token, userId, Date.now()]
    );

    await ctx.config.set('_jellyfin_token', token);
    await ctx.config.set('_jellyfin_user_id', userId);
    await ctx.config.set('_jellyfin_server_id', serverId);
    return { success: true, serverName, userId };
  }

  return { success: false, error: `Authentication failed (HTTP ${authRes.status}). Check your credentials.` };
}

// ── Library Sync ──────────────────────────────────────────────────────────

async function dataSyncStatus(ctx) {
  const token = await ctx.config.get('_jellyfin_token');
  const server = await ctx.db.get('SELECT * FROM jellyfin_servers ORDER BY last_seen DESC LIMIT 1');
  const countRow = await ctx.db.get('SELECT COUNT(*) c FROM jellyfin_library');
  const lastLog = await ctx.db.get('SELECT * FROM jellyfin_sync_log ORDER BY started_at DESC LIMIT 1');

  return {
    connected: !!token && !!server,
    serverName: server?.name || null,
    serverUrl: server?.url || null,
    itemCount: countRow?.c || 0,
    syncing: _syncing,
    progress: _syncProgress,
    lastSync: lastLog
      ? {
          finishedAt: lastLog.finished_at,
          matched: lastLog.matched,
          found: lastLog.found,
          success: Boolean(lastLog.success),
        }
      : null,
  };
}

async function dataSyncNow(ctx) {
  if (_syncing) return { success: false, error: 'Sync already in progress.' };
  _syncing = true;
  _syncProgress = { phase: 'starting', current: 0, total: 0, lastTrack: '' };

  const startedAt = Date.now();
  let found = 0;
  let matched = 0;
  let failed = 0;

  try {
    const server = await ctx.db.get('SELECT * FROM jellyfin_servers ORDER BY last_seen DESC LIMIT 1');
    if (!server) throw new Error('No Jellyfin server configured. Test connection and sign in first.');

    const clientId = await getClientId(ctx);
    const headers = jellyfinHeaders(clientId, server.token);
    const userId = server.user_id;

    // Fetch user library views (Movies, Series)
    const viewsRes = await httpJson(ctx, `${server.url}/Users/${userId}/Views`, { headers });
    if (viewsRes.status !== 200 || !viewsRes.data?.Items) {
      throw new Error(`Failed to query Jellyfin libraries (HTTP ${viewsRes.status}).`);
    }

    const syncMovies = (await ctx.config.get('syncMovieLibraries')) !== false;
    const syncShows = (await ctx.config.get('syncShowLibraries')) !== false;

    const views = viewsRes.data.Items.filter((v) => {
      if (v.CollectionType === 'movies' && syncMovies) return true;
      if (v.CollectionType === 'tvshows' && syncShows) return true;
      return false;
    });

    for (const view of views) {
      const mediaType = view.CollectionType === 'movies' ? 'movie' : 'show';
      const itemsRes = await httpJson(
        ctx,
        `${server.url}/Users/${userId}/Items?parentId=${view.Id}&recursive=true&fields=ProviderIds,PremiereDate,ProductionYear&includeItemTypes=${
          mediaType === 'movie' ? 'Movie' : 'Series'
        }`,
        { headers }
      );

      const items = itemsRes.data?.Items || [];
      found += items.length;

      for (const item of items) {
        const tmdbId = item.ProviderIds?.Tmdb || item.ProviderIds?.TMDB;
        if (tmdbId) {
          matched++;
          await ctx.db.run(
            'INSERT OR REPLACE INTO jellyfin_library (tmdb_id, media_type, item_id, server_id, server_name, title, year, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              String(tmdbId),
              mediaType,
              String(item.Id),
              server.server_id,
              server.name,
              item.Name || '',
              item.ProductionYear || (item.PremiereDate ? new Date(item.PremiereDate).getFullYear() : null),
              Date.now(),
            ]
          );
        } else {
          failed++;
        }
      }
    }

    await ctx.db.run(
      'INSERT INTO jellyfin_sync_log (started_at, finished_at, success, found, matched, failed) VALUES (?, ?, 1, ?, ?, ?)',
      [startedAt, Date.now(), found, matched, failed]
    );

    return { success: true, found, matched, failed };
  } catch (err) {
    await ctx.db.run(
      'INSERT INTO jellyfin_sync_log (started_at, finished_at, success, found, matched, failed, errors) VALUES (?, ?, 0, ?, ?, ?, ?)',
      [startedAt, Date.now(), found, matched, failed, String(err.message || err)]
    );
    return { success: false, error: err.message };
  } finally {
    _syncing = false;
    _syncProgress = { phase: 'idle', current: 0, total: 0, lastTrack: '' };
  }
}

// ── Streaming & Playback ──────────────────────────────────────────────────

async function dataPlayStream(ctx, opts) {
  const itemId = opts && (opts.itemId || opts.ratingKey);
  if (!itemId) return { success: false, error: 'Missing Jellyfin item ID.' };

  const server = await ctx.db.get('SELECT * FROM jellyfin_servers ORDER BY last_seen DESC LIMIT 1');
  if (!server) return { success: false, error: 'Jellyfin server not connected.' };

  const clientId = await getClientId(ctx);
  const token = server.token;
  const baseUrl = server.url;
  const headers = jellyfinHeaders(clientId, token);

  const itemRes = await httpJson(ctx, `${baseUrl}/Users/${server.user_id}/Items/${itemId}`, { headers });
  if (itemRes.status !== 200 || !itemRes.data) {
    return { success: false, error: 'Failed to fetch item details from Jellyfin.' };
  }

  const item = itemRes.data;
  const mediaSource = item.MediaSources?.[0];
  const streams = mediaSource?.MediaStreams || [];

  const playSessionId = (opts && opts.playSessionId) || 'otix-jf-' + Date.now();

  // Direct play stream URL
  const directUrl = `${baseUrl}/Videos/${itemId}/stream?static=true&api_key=${encodeURIComponent(token)}`;

  // Audio tracks
  const audioTracks = streams
    .filter((s) => s.Type === 'Audio')
    .map((s) => ({
      id: String(s.Index),
      index: Number(s.Index),
      label: s.DisplayTitle || s.Title || `${s.Language || 'Audio'} (${s.Codec || 'stereo'})`,
      language: s.Language || 'und',
      codec: s.Codec || 'aac',
      channels: Number(s.Channels) || 2,
    }));

  // Subtitle tracks
  const subtitles = streams
    .filter((s) => s.Type === 'Subtitle')
    .map((s) => {
      const isText = s.Codec === 'subrip' || s.Codec === 'vtt' || s.Codec === 'srt';
      const url = isText && mediaSource
        ? `${baseUrl}/Videos/${itemId}/${mediaSource.Id}/Subtitles/${s.Index}/Stream.vtt?api_key=${encodeURIComponent(token)}`
        : undefined;
      return {
        id: String(s.Index),
        index: Number(s.Index),
        label: s.DisplayTitle || s.Language || 'Subtitles',
        language: s.Language || 'und',
        url,
        format: s.Codec === 'pgs' ? 'pgs' : s.Codec === 'ass' ? 'ass' : s.Codec === 'subrip' || s.Codec === 'srt' ? 'srt' : 'vtt',
        isExternal: Boolean(s.IsExternal),
        requiresBurnIn: s.Codec === 'pgs' || s.Codec === 'ass',
      };
    });

  // Adaptive HLS transcode URL
  const audioParam = opts && opts.audioIndex != null ? `&AudioStreamIndex=${opts.audioIndex}` : '';
  const subParam = opts && opts.subtitleIndex != null ? `&SubtitleStreamIndex=${opts.subtitleIndex}&SubtitleMethod=Encode` : '';
  const hlsUrl = `${baseUrl}/Videos/${itemId}/master.m3u8?PlaySessionId=${encodeURIComponent(playSessionId)}&DeviceId=${encodeURIComponent(
    clientId
  )}&api_key=${encodeURIComponent(token)}&VideoCodec=h264&AudioCodec=aac&TranscodingMaxAudioChannels=2${audioParam}${subParam}`;

  const startTicks = item.UserData?.PlaybackPositionTicks || 0;
  const totalTicks = item.RunTimeTicks || 0;

  return {
    success: true,
    session: {
      source: 'jellyfin',
      serverUrl: baseUrl,
      token,
      itemId: String(itemId),
      title: item.Name || '',
      subtitle: item.SeriesName ? `${item.SeriesName} - S${item.ParentIndexNumber || 1}E${item.IndexNumber || 1}` : undefined,
      playSessionId,
      directUrl,
      hlsUrl,
      audioTracks,
      subtitles,
      startPositionMs: Math.round(startTicks / 10000),
      durationMs: Math.round(totalTicks / 10000),
      container: mediaSource?.Container || 'mp4',
      videoCodec: mediaSource?.VideoStream?.Codec || 'h264',
      audioCodec: mediaSource?.AudioStream?.Codec || 'aac',
    },
  };
}

async function dataPlayOpen(ctx, opts) {
  const itemId = opts && (opts.itemId || opts.ratingKey);
  const server = await ctx.db.get('SELECT * FROM jellyfin_servers ORDER BY last_seen DESC LIMIT 1');
  if (!server) return { success: false, error: 'Jellyfin server not connected.' };
  const url = `${server.url}/web/index.html#!/details?id=${encodeURIComponent(String(itemId))}&serverId=${encodeURIComponent(
    server.server_id
  )}`;
  return { success: true, url };
}

// ── Session Reporting ─────────────────────────────────────────────────────

async function dataSessionStart(ctx, opts) {
  const server = await ctx.db.get('SELECT * FROM jellyfin_servers ORDER BY last_seen DESC LIMIT 1');
  if (!server || !opts?.itemId) return { success: false };

  const clientId = await getClientId(ctx);
  const headers = jellyfinHeaders(clientId, server.token);
  await httpJson(ctx, `${server.url}/Sessions/Playing`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ItemId: opts.itemId,
      PlaySessionId: opts.playSessionId,
      PositionTicks: Math.round((opts.positionMs || 0) * 10000),
    }),
  });
  return { success: true };
}

async function dataSessionProgress(ctx, opts) {
  const server = await ctx.db.get('SELECT * FROM jellyfin_servers ORDER BY last_seen DESC LIMIT 1');
  if (!server || !opts?.itemId) return { success: false };

  const clientId = await getClientId(ctx);
  const headers = jellyfinHeaders(clientId, server.token);
  await httpJson(ctx, `${server.url}/Sessions/Playing/Progress`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ItemId: opts.itemId,
      PlaySessionId: opts.playSessionId,
      PositionTicks: Math.round((opts.positionMs || 0) * 10000),
      IsPaused: Boolean(opts.isPaused),
    }),
  });
  return { success: true };
}

async function dataSessionStop(ctx, opts) {
  const server = await ctx.db.get('SELECT * FROM jellyfin_servers ORDER BY last_seen DESC LIMIT 1');
  if (!server || !opts?.itemId) return { success: false };

  const clientId = await getClientId(ctx);
  const headers = jellyfinHeaders(clientId, server.token);
  await httpJson(ctx, `${server.url}/Sessions/Playing/Stopped`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ItemId: opts.itemId,
      PlaySessionId: opts.playSessionId,
      PositionTicks: Math.round((opts.positionMs || 0) * 10000),
    }),
  });
  return { success: true };
}

// ── Slots ─────────────────────────────────────────────────────────────────

async function slotRender(ctx, location, context) {
  if (location === 'media/card/badges') {
    if (!context?.tmdbId || !context?.mediaType) return { widgets: [] };
    const row = await ctx.db.get(
      'SELECT 1 FROM jellyfin_library WHERE tmdb_id = ? AND media_type = ? LIMIT 1',
      [String(context.tmdbId), context.mediaType]
    );
    if (!row) return { widgets: [] };
    return {
      widgets: [{ type: 'badge', props: { text: 'On Jellyfin', tone: 'success' } }],
    };
  }

  if (location !== 'media/detail/actions') return { widgets: [] };
  if (!context?.mediaId || !context?.mediaType) return { widgets: [] };

  const type = context.mediaType === 'show' ? 'show' : context.mediaType === 'movie' ? 'movie' : null;
  if (!type) return { widgets: [] };

  const rows = await ctx.db.all('SELECT * FROM jellyfin_library WHERE tmdb_id = ? AND media_type = ?', [
    String(context.mediaId),
    type,
  ]);
  if (!rows || rows.length === 0) return { widgets: [] };

  const instances = rows.map((r) => ({
    id: r.server_id + '|' + r.item_id,
    serverId: r.server_id,
    name: r.server_name || 'Jellyfin',
    ratingKey: r.item_id,
    itemId: r.item_id,
    title: r.title || '',
  }));

  return {
    widgets: [
      {
        type: 'play-button',
        props: { mediaType: type, mediaId: String(context.mediaId), instances },
      },
    ],
  };
}

// ── Exports ───────────────────────────────────────────────────────────────

const data = {
  'auth.test': dataAuthTest,
  'auth.login': dataAuthLogin,
  'sync.status': dataSyncStatus,
  'sync.now': dataSyncNow,
  'play.open': dataPlayOpen,
  'play.stream': dataPlayStream,
  'session.start': dataSessionStart,
  'session.progress': dataSessionProgress,
  'session.stop': dataSessionStop,
};

module.exports = {
  plugin: (ctx) => {
    ctx.logger.info('Jellyfin plugin loaded');
    return () => {
      ctx.logger.info('Jellyfin plugin unloaded');
    };
  },
  onGetSlotData: slotRender,
  data,
};
