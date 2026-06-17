module.exports = function(ctx) {
  ctx.logger.info('Radarr Sync plugin starting', { version: '1.0.0' });

  // ── Multi-instance Config ──
  var instances = ctx.config.get('instances') || [];

  // If instances is the OLD flat config format (migration), wrap it
  if (!Array.isArray(instances) && ctx.config.get('radarr_url')) {
    instances = [{
      radarr_url: ctx.config.get('radarr_url'),
      radarr_api_key: ctx.config.get('radarr_api_key'),
      quality_profile_id: ctx.config.get('quality_profile_id'),
      root_folder_path: ctx.config.get('root_folder_path')
    }];
  }

  var pollMinutes = ctx.config.get('poll_interval_minutes') || 15;

  ctx.logger.info('Radarr config loaded', {
    instanceCount: instances.length,
    pollMinutes: pollMinutes
  });

  // ── Auto-managed list ──
  var managedListId = null;

  async function ensureList() {
    try {
      // Try to create a dedicated list
      var createRes = await ctx.api.post('/list', {
        name: 'Radarr Watchlist',
        description: 'Auto-managed list for Radarr sync. Movies added here are sent to Radarr.',
        isPublic: false
      });
      managedListId = createRes.id || createRes.list_id;
      ctx.logger.info('Created Radarr sync list', { listId: managedListId });
    } catch (err) {
      ctx.logger.warn('Could not create list, trying to find existing', { error: err.message });
      // Fallback: try to find an existing list
      try {
        var lists = await ctx.api.get('/list/mine');
        var radarrList = (Array.isArray(lists) ? lists : (lists.items || [])).find(function(l) {
          return l.name === 'Radarr Watchlist';
        });
        if (radarrList) {
          managedListId = radarrList.id;
          ctx.logger.info('Found existing Radarr sync list', { listId: managedListId });
        }
      } catch (err2) {
        ctx.logger.error('Failed to find or create list', { error: err2.message });
      }
    }
  }

  // ── Local DB: track synced items ──
  try {
    ctx.db.run(`
      CREATE TABLE IF NOT EXISTS radarr_sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_item_id TEXT NOT NULL,
        tmdb_id INTEGER,
        title TEXT,
        direction TEXT NOT NULL,
        radarr_id INTEGER,
        instance_url TEXT,
        synced_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Migration: add instance_url for existing tables
    try { ctx.db.run('ALTER TABLE radarr_sync_log ADD COLUMN instance_url TEXT'); } catch (_) {}
  } catch (err) {
    ctx.logger.error('Failed to create sync log table', { error: err.message });
  }

  // ── Helper: Radarr API call ──
  function radarrApi(instanceUrl, apiKey, method, path, body) {
    var url = instanceUrl.replace(/\/+$/, '') + '/api/v3' + path;
    var headers = {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json'
    };
    var options = { method: method, headers: headers };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }
    return ctx.fetch(url, options);
  }

  // ── Helper: Check if already synced ──
  function isAlreadySynced(mediaItemId) {
    try {
      var row = ctx.db.get(
        'SELECT id FROM radarr_sync_log WHERE media_item_id = ?',
        [mediaItemId]
      );
      return !!row;
    } catch (err) {
      return false;
    }
  }

  // ── Helper: Record sync ──
  function recordSync(mediaItemId, tmdbId, title, direction, radarrId, instanceUrl) {
    try {
      ctx.db.run(
        'INSERT INTO radarr_sync_log (media_item_id, tmdb_id, title, direction, radarr_id, instance_url) VALUES (?, ?, ?, ?, ?, ?)',
        [mediaItemId, tmdbId || null, title || '', direction, radarrId || null, instanceUrl || null]
      );
    } catch (err) {
      ctx.logger.error('Failed to record sync', { error: err.message });
    }
  }

  // ── Core: Add movie to a single Radarr instance ──
  async function addToRadarrInstance(tmdbId, title, mediaItemId, instance) {
    var url = instance.radarr_url || 'http://localhost:7878';
    var apiKey = instance.radarr_api_key || '';
    var qualityProfileId = instance.quality_profile_id || 1;
    var rootFolderPath = instance.root_folder_path || '/movies';

    if (!apiKey) {
      ctx.logger.warn('No API key for Radarr instance', { url: url });
      return false;
    }

    try {
      // Check if already in Radarr
      var lookupRes = await radarrApi(url, apiKey, 'GET', '/movie/lookup/tmdb?tmdbId=' + tmdbId);
      if (!lookupRes.ok) {
        ctx.logger.warn('TMDb lookup failed', { tmdbId: tmdbId, status: lookupRes.status, instance: url });
        return false;
      }
      var lookupData = await lookupRes.json();
      if (lookupData && lookupData.id) {
        ctx.logger.info('Movie already in Radarr', { title: title, radarrId: lookupData.id, instance: url });
        recordSync(mediaItemId, tmdbId, title, 'otix_to_radarr', lookupData.id, url);
        return true;
      }
    } catch (err) {
      ctx.logger.warn('Lookup check failed, proceeding with add', { error: err.message, instance: url });
    }

    try {
      var addRes = await radarrApi(url, apiKey, 'POST', '/movie', {
        tmdbId: tmdbId,
        qualityProfileId: qualityProfileId,
        rootFolderPath: rootFolderPath,
        monitored: true,
        addOptions: { searchForMovie: true }
      });

      if (addRes.ok) {
        var movie = await addRes.json();
        ctx.logger.info('Added to Radarr', { title: title, radarrId: movie.id, tmdbId: tmdbId, instance: url });
        ctx.notifications.send('Radarr Sync', 'Added: ' + title + ' to ' + url);
        recordSync(mediaItemId, tmdbId, title, 'otix_to_radarr', movie.id, url);
        return true;
      } else {
        var errText = await addRes.text();
        ctx.logger.error('Radarr add failed', { status: addRes.status, error: errText, instance: url });
        return false;
      }
    } catch (err) {
      ctx.logger.error('Failed to add to Radarr', { title: title, error: err.message, instance: url });
      return false;
    }
  }

  // ── Core: Add movie to ALL Radarr instances ──
  async function addToAllRadarr(tmdbId, title, mediaItemId) {
    var results = [];
    for (var i = 0; i < instances.length; i++) {
      var result = await addToRadarrInstance(tmdbId, title, mediaItemId, instances[i]);
      results.push(result);
    }
    return results.some(function(r) { return r; });
  }

  // ── Core: Look up Otix media to get TMDb ID ──
  async function lookupMedia(mediaItemId) {
    try {
      var media = await ctx.api.get('/media/' + mediaItemId);
      ctx.logger.info('Media lookup result keys', { keys: Object.keys(media || {}) });

      // Try various TMDb ID field names
      var tmdbId = media.tmdb_id || media.tmdbId || media.tmdbId || null;
      var title = media.title || media.name || 'Unknown';

      // If media has external_ids, check there too
      if (!tmdbId && media.external_ids) {
        tmdbId = media.external_ids.tmdb_id || media.external_ids.tmdbId || null;
      }
      if (!tmdbId && media.externalIds) {
        tmdbId = media.externalIds.tmdb_id || media.externalIds.tmdbId || null;
      }

      return { tmdbId: tmdbId, title: title, mediaType: media.mediaType || media.media_type };
    } catch (err) {
      ctx.logger.error('Failed to look up media', { mediaItemId: mediaItemId, error: err.message });
      return null;
    }
  }

  // ── Subscribe to events once list is ready ──
  var unsubListAdd = null;
  var pollInterval = null;

  ensureList().then(function() {
    ctx.logger.info('Radarr sync list ready', { managedListId: managedListId });
    if (!managedListId) {
      ctx.logger.error('No managed list available — sync will not work');
      return;
    }

    // ── 1. Listen for list item additions ──
    unsubListAdd = ctx.events.on('otix:list:item_added', function(payload) {
      if (payload.listId !== managedListId) return;

      var mediaItemId = payload.item && payload.item.mediaItemId;
      if (!mediaItemId) return;

      if (isAlreadySynced(mediaItemId)) {
        ctx.logger.info('Item already synced, skipping', { mediaItemId: mediaItemId });
        return;
      }

      ctx.logger.info('List item added — syncing to Radarr', { mediaItemId: mediaItemId });

      lookupMedia(mediaItemId).then(function(info) {
        if (!info) return;
        if (!info.tmdbId) {
          ctx.logger.warn('Media has no TMDb ID', { title: info.title, type: info.mediaType });
          return;
        }
        addToAllRadarr(info.tmdbId, info.title, mediaItemId);
      });
    });

    // ── 2. Periodic Radarr → Otix sync (if bidirectional) ──
    if (ctx.config.get('sync_direction') === 'bidirectional') {
      async function pollRadarr() {
        for (var i = 0; i < instances.length; i++) {
          var inst = instances[i];
          var url = inst.radarr_url || 'http://localhost:7878';
          var apiKey = inst.radarr_api_key || '';

          try {
            var res = await radarrApi(url, apiKey, 'GET', '/movie');
            if (!res.ok) continue;
            var movies = await res.json();

            for (var j = 0; j < movies.length; j++) {
              var movie = movies[j];
              if (!movie.tmdbId) continue;

              if (isAlreadySynced('tmdb-' + movie.tmdbId + '-' + url)) continue;

              // Add to Otix list — we record by tmdbId and instance to avoid duplicates
              try {
                await ctx.api.post('/list/' + managedListId + '/item', {
                  mediaItemId: 'tmdb-' + movie.tmdbId  // placeholder — need real Otix ID
                });
                recordSync('tmdb-' + movie.tmdbId + '-' + url, movie.tmdbId, movie.title, 'radarr_to_otix', movie.id, url);
              } catch (err) {
                ctx.logger.warn('Reverse sync — could not add to list', {
                  title: movie.title,
                  error: err.message,
                  instance: url
                });
              }
            }
          } catch (err) {
            ctx.logger.warn('Radarr poll failed', { error: err.message, instance: url });
          }
        }
      }

      pollInterval = setInterval(pollRadarr, pollMinutes * 60 * 1000);
      // Also run once on startup
      setTimeout(pollRadarr, 10000);
    }
  }).catch(function(err) {
    ctx.logger.error('Failed to initialize sync list', { error: err.message });
  });

  // ── Cleanup ──
  ctx.onDestroy(function() {
    ctx.logger.info('Radarr Sync plugin shutting down');
    if (unsubListAdd) unsubListAdd();
    if (pollInterval) clearInterval(pollInterval);

    try {
      var count = ctx.db.get('SELECT COUNT(*) as cnt FROM radarr_sync_log');
      ctx.logger.info('Total syncs', { total: count ? count.cnt : 0 });
    } catch (err) {}
  });

  ctx.logger.info('Radarr Sync plugin ready');
};

module.exports.status = async function(ctx) {
  try {
    var syncCount = ctx.db.get('SELECT COUNT(*) as cnt FROM radarr_sync_log');
    var lastSync = ctx.db.get('SELECT synced_at, title, direction, instance_url FROM radarr_sync_log ORDER BY synced_at DESC LIMIT 1');
    var recentSyncs = ctx.db.all('SELECT title, direction, synced_at, instance_url FROM radarr_sync_log ORDER BY synced_at DESC LIMIT 5');
    var instances = ctx.config.get('instances') || [];
    if (!Array.isArray(instances) && ctx.config.get('radarr_url')) {
      instances = [{
        radarr_url: ctx.config.get('radarr_url'),
        radarr_api_key: ctx.config.get('radarr_api_key'),
        quality_profile_id: ctx.config.get('quality_profile_id'),
        root_folder_path: ctx.config.get('root_folder_path')
      }];
    }

    return {
      total_syncs: syncCount ? syncCount.cnt : 0,
      last_sync: lastSync || null,
      recent_syncs: recentSyncs || [],
      instance_count: Array.isArray(instances) ? instances.length : 0,
      instances: Array.isArray(instances) ? instances.map(function(i) { return { name: i.name || 'Unnamed', url: i.radarr_url }; }) : [],
      radarr_urls: Array.isArray(instances) ? instances.map(function(i) { return i.radarr_url || 'http://localhost:7878'; }) : []
    };
  } catch (err) {
    return { error: err.message };
  }
};

module.exports.test = async function(ctx, config) {
  var instances = config.instances || [];

  // Migration: if config has old flat format, wrap it
  if (!Array.isArray(instances) && config.radarr_url) {
    instances = [{
      radarr_url: config.radarr_url,
      radarr_api_key: config.radarr_api_key,
      quality_profile_id: config.quality_profile_id,
      root_folder_path: config.root_folder_path
    }];
  }

  if (!Array.isArray(instances) || instances.length === 0) {
    // If no instances configured, try single-instance test with top-level fields
    var singleUrl = (config.radarr_url || 'http://localhost:7878').replace(/\/+$/, '');
    var singleKey = config.radarr_api_key || '';

    if (!singleKey) {
      return { success: false, message: 'No instances configured and no API key provided.' };
    }

    try {
      var res = await ctx.fetch(singleUrl + '/api/v3/system/status', {
        headers: { 'X-Api-Key': singleKey }
      });
      if (res.ok) {
        var data = await res.json();
        return {
          success: true,
          message: 'Connected to Radarr v' + (data.version || '?') + ' (single instance).'
        };
      }
      if (res.status === 401) {
        return { success: false, message: 'Authentication failed — check your API Key.' };
      }
      return { success: false, message: 'Connection failed (HTTP ' + res.status + ').' };
    } catch (err) {
      return { success: false, message: 'Could not reach Radarr at ' + singleUrl + '. Is it running?' };
    }
  }

  // Test all instances
  var results = [];
  for (var i = 0; i < instances.length; i++) {
    var inst = instances[i];
    var url = (inst.radarr_url || 'http://localhost:7878').replace(/\/+$/, '');
    var apiKey = inst.radarr_api_key || '';

    if (!apiKey) {
      results.push({ instance: url, success: false, message: 'API Key is required.' });
      continue;
    }

    try {
      var res2 = await ctx.fetch(url + '/api/v3/system/status', {
        headers: { 'X-Api-Key': apiKey }
      });

      if (res2.ok) {
        var data2 = await res2.json();
        results.push({ instance: url, success: true, message: 'v' + (data2.version || '?') });
      } else if (res2.status === 401) {
        results.push({ instance: url, success: false, message: 'Authentication failed' });
      } else {
        results.push({ instance: url, success: false, message: 'HTTP ' + res2.status });
      }
    } catch (err) {
      results.push({ instance: url, success: false, message: 'Unreachable' });
    }
  }

  var successCount = results.filter(function(r) { return r.success; }).length;
  var failCount = results.filter(function(r) { return !r.success; }).length;

  if (successCount === results.length) {
    return { success: true, message: 'All ' + results.length + ' Radarr instance(s) connected successfully.' };
  } else if (successCount > 0) {
    return { success: true, message: successCount + '/' + results.length + ' Radarr instance(s) connected. Failures: ' + failCount + '.' };
  } else {
    return { success: false, message: 'All ' + results.length + ' Radarr instance(s) failed to connect.' };
  }
};

// ── Data API: exposed to frontend via ctx.callData ──

module.exports.data = {
  // Get movies from a Radarr instance
  getLibrary: async function(ctx, instanceUrl, apiKey) {
    var url = instanceUrl.replace(/\/+$/, '') + '/api/v3/movie';
    var res = await ctx.fetch(url, {
      headers: { 'X-Api-Key': apiKey }
    });
    if (!res.ok) throw new Error('Radarr returned HTTP ' + res.status);
    return await res.json();
  },

  // Get all instances' libraries
  getAllLibraries: async function(ctx) {
    var instances = ctx.config.get('instances') || [];
    // Migration for old flat config
    if (!Array.isArray(instances) && ctx.config.get('radarr_url')) {
      instances = [{
        radarr_url: ctx.config.get('radarr_url'),
        radarr_api_key: ctx.config.get('radarr_api_key')
      }];
    }

    var results = [];
    for (var i = 0; i < instances.length; i++) {
      var inst = instances[i];
      try {
        var movies = await module.exports.data.getLibrary(ctx, inst.radarr_url, inst.radarr_api_key);
        results.push({
          name: inst.name || ('Instance ' + (i + 1)),
          url: inst.radarr_url,
          count: movies.length,
          movies: movies
        });
      } catch (err) {
        results.push({
          name: inst.name || ('Instance ' + (i + 1)),
          url: inst.radarr_url,
          count: 0,
          error: err.message
        });
      }
    }
    return results;
  }
};
