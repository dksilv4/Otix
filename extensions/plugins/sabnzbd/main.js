function resolveServiceUrl(host, port, useSsl, urlBase) {
  let raw = (host || 'localhost').trim();
  raw = raw.replace(/([a-zA-Z0-9_-]),([a-zA-Z0-9_-])/g, '$1.$2');

  let hasScheme = false;
  let scheme = useSsl ? 'https' : 'http';
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const split = raw.split('://');
    scheme = split[0].toLowerCase();
    raw = split.slice(1).join('://');
    hasScheme = true;
  }

  const slashIdx = raw.indexOf('/');
  let hostPort = raw;
  let pathFromHost = '';
  if (slashIdx !== -1) {
    hostPort = raw.substring(0, slashIdx);
    pathFromHost = raw.substring(slashIdx).replace(/^\/+|\/+$/g, '');
  }

  let effectivePort = port;
  let hostname = hostPort;
  if (hostPort.includes(':')) {
    const colonIdx = hostPort.lastIndexOf(':');
    hostname = hostPort.substring(0, colonIdx);
    const portParsed = parseInt(hostPort.substring(colonIdx + 1), 10);
    if (!isNaN(portParsed)) effectivePort = portParsed;
  } else {
    if (hasScheme && scheme === 'https' && (effectivePort === 8080 || effectivePort === 9696 || !effectivePort)) {
      effectivePort = 443;
    } else if (hasScheme && scheme === 'http' && (effectivePort === 8080 || effectivePort === 9696 || !effectivePort)) {
      effectivePort = 80;
    }
  }

  const isDomain = hostname.includes('.') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  if (isDomain && (useSsl || effectivePort === 443 || scheme === 'https')) {
    scheme = 'https';
    if (effectivePort === 8080 || effectivePort === 9696 || !effectivePort) {
      effectivePort = 443;
    }
  }

  const portSuffix = (effectivePort && effectivePort !== 80 && effectivePort !== 443) ? `:${effectivePort}` : '';
  const root = `${scheme}://${hostname}${portSuffix}`;

  const cleanUrlBase = (urlBase || '').trim().replace(/^\/+|\/+$/g, '');
  const segments = [];
  if (pathFromHost) {
    pathFromHost.split('/').forEach(s => { if (s && !segments.includes(s)) segments.push(s); });
  }
  if (cleanUrlBase) {
    cleanUrlBase.split('/').forEach(s => { if (s && !segments.includes(s)) segments.push(s); });
  }

  const subpath = segments.length ? `/${segments.join('/')}` : '';
  return `${root}${subpath}`;
}

function sabnzbdUrl(host, port, useSsl, mode, extraParams, urlBase) {
  const base = resolveServiceUrl(host, port, useSsl, urlBase);
  const url = new URL(`${base}/api`);
  url.searchParams.set('output', 'json');
  url.searchParams.set('mode', mode);
  for (const [k, v] of Object.entries(extraParams || {})) url.searchParams.set(k, v);
  return url.toString();
}

module.exports = function(ctx) {
  // ── add-download ──
  ctx.handle('add-download', async function(args) {
    const config = ctx.config.getAll();
    const url = sabnzbdUrl(
      config.host, config.port, config.useSsl,
      'addurl', {
        apikey: config.apiKey,
        name: args.downloadUrl,
        nzbname: args.title,
        cat: args.category || config.category || 'games',
      },
      config.urlBase || config.url_base,
    );
    const response = await ctx.fetch(url);
    const data = await response.json();
    if (data && data.nzo_ids && data.nzo_ids[0]) return { id: data.nzo_ids[0] };
    throw new Error('Failed to add NZB to SABnzbd: ' + JSON.stringify(data));
  });

  // ── get-queue ──
  ctx.handle('get-queue', async function() {
    const config = ctx.config.getAll();
    try {
      const url = sabnzbdUrl(config.host, config.port, config.useSsl, 'queue', { apikey: config.apiKey }, config.urlBase || config.url_base);
      const response = await ctx.fetch(url);
      const data = await response.json();
      const slots = (data && data.queue && data.queue.slots) || [];
      return slots.map(function(s) { return {
        id: s.nzo_id || '',
        title: s.filename || '',
        status: s.status || '',
        percentage: parseFloat(s.percentage || '0'),
        size: parseInt(s.size || '0', 10),
        downloaded: parseInt(s.sizeleft || '0', 10),
      };});
    } catch(e) { return []; }
  });

  // ── get-history ──
  ctx.handle('get-history', async function(args) {
    const config = ctx.config.getAll();
    try {
      const url = sabnzbdUrl(config.host, config.port, config.useSsl, 'history', {
        apikey: config.apiKey, limit: String((args && args.limit) || 50),
      }, config.urlBase || config.url_base);
      const response = await ctx.fetch(url);
      const data = await response.json();
      const slots = (data && data.history && data.history.slots) || [];
      return slots.map(function(s) { return {
        id: s.nzo_id || '',
        title: s.name || '',
        size: parseInt(s.size || '0', 10),
        status: s.status || '',
        storagePath: s.storage || '',
        completedAt: s.completed ? new Date(s.completed * 1000).toISOString() : '',
      };});
    } catch(e) { return []; }
  });

  // ── remove-download ──
  ctx.handle('remove-download', async function(args) {
    const config = ctx.config.getAll();
    const url = sabnzbdUrl(config.host, config.port, config.useSsl, 'queue', {
      apikey: config.apiKey, name: 'delete', value: args.id,
    }, config.urlBase || config.url_base);
    const response = await ctx.fetch(url);
    const data = await response.json();
    return data && data.status === true;
  });

  // ── test-connection ──
  ctx.handle('test-connection', async function() {
    try {
      const config = ctx.config.getAll();
      const url = sabnzbdUrl(config.host, config.port, config.useSsl, 'version', { apikey: config.apiKey }, config.urlBase || config.url_base);
      const response = await ctx.fetch(url);
      const data = await response.json();
      return { ok: !!(data && data.version), message: data && data.version ? 'SABnzbd v' + data.version : 'No version response' };
    } catch(e) {
      return { ok: false, message: e.message };
    }
  });
};

module.exports.test = async function(ctx) {
  var config = ctx.config.getAll();
  if (!config.apiKey) return { passed: false, failures: ['API key not configured'] };
  try {
    var url = sabnzbdUrl(config.host, config.port, config.useSsl, 'version', { apikey: config.apiKey }, config.urlBase || config.url_base);
    var response = await ctx.fetch(url);
    var data = await response.json();
    return { passed: !!(data && data.version), failures: data && data.version ? undefined : ['No version response'] };
  } catch(e) {
    return { passed: false, failures: [e.message] };
  }
};
