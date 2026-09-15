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

function prowlarrUrl(host, port, useSsl, endpoint, urlBase) {
  const base = resolveServiceUrl(host, port, useSsl, urlBase);
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
}

module.exports = function(ctx) {
  // ── search ──
  ctx.handle('search', async function(args) {
    const config = ctx.config.getAll();
    if (!config.apiKey) throw new Error('Prowlarr API key is required');

    const query = (args && args.query) || '';
    const rawCategories = (args && args.categories) || config.categories || '1000,4000';
    const categoryParams = String(rawCategories)
      .split(',')
      .map(c => c.trim())
      .filter(Boolean)
      .map(c => `categories=${encodeURIComponent(c)}`)
      .join('&');

    const searchUrl = prowlarrUrl(
      config.host || 'localhost',
      config.port || 9696,
      config.useSsl,
      `/api/v1/search?query=${encodeURIComponent(query)}&type=search${categoryParams ? '&' + categoryParams : ''}`,
      config.urlBase || config.url_base
    );

    const response = await ctx.fetch(searchUrl, {
      headers: {
        'X-Api-Key': config.apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Prowlarr search failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    const items = Array.isArray(data) ? data : [];

    return items.map(function(item) {
      return {
        guid: item.guid || item.infoHash || String(item.id || ''),
        title: item.title || '',
        size: parseInt(item.size || '0', 10),
        pubDate: item.publishDate || '',
        indexer: item.indexer || 'Unknown',
        protocol: (item.protocol || 'usenet').toLowerCase(),
        downloadUrl: item.downloadUrl || '',
        infoUrl: item.infoUrl || '',
        seeders: item.seeders != null ? item.seeders : null,
      };
    });
  });

  // ── test-connection ──
  ctx.handle('test-connection', async function() {
    const config = ctx.config.getAll();
    if (!config.apiKey) return { ok: false, message: 'Prowlarr API key is missing' };

    try {
      const statusUrl = prowlarrUrl(
        config.host || 'localhost',
        config.port || 9696,
        config.useSsl,
        '/api/v1/system/status',
        config.urlBase || config.url_base
      );

      const response = await ctx.fetch(statusUrl, {
        headers: {
          'X-Api-Key': config.apiKey,
          'Accept': 'application/json',
        },
      });

      if (response.status === 200) {
        const data = await response.json();
        const version = (data && data.version) || 'Connected';
        return { ok: true, version: version, message: `Connected to Prowlarr v${version}` };
      } else if (response.status === 401 || response.status === 403) {
        return { ok: false, message: 'Invalid Prowlarr API Key' };
      }
      return { ok: false, message: `HTTP ${response.status} from Prowlarr` };
    } catch (e) {
      return { ok: false, message: e.message || 'Cannot connect to Prowlarr' };
    }
  });
};

module.exports.test = async function(ctx) {
  const config = ctx.config.getAll();
  if (!config.apiKey) return { passed: false, failures: ['API key not configured'] };

  try {
    const statusUrl = prowlarrUrl(
      config.host || 'localhost',
      config.port || 9696,
      config.useSsl,
      '/api/v1/system/status',
      config.urlBase || config.url_base
    );

    const response = await ctx.fetch(statusUrl, {
      headers: {
        'X-Api-Key': config.apiKey,
        'Accept': 'application/json',
      },
    });

    return { passed: response.status === 200, failures: response.status === 200 ? undefined : [`HTTP ${response.status}`] };
  } catch (e) {
    return { passed: false, failures: [e.message] };
  }
};
