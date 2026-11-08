import { session as electronSession, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { pathToFileURL } from 'url';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.m4v': 'video/mp4',
  '.3gp': 'video/3gpp',
  '.ts': 'video/mp2t',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma',
};

/**
 * Configure SameSite cookies and YouTube embed headers on the session.
 */
export function setupSessionHeaders(targetSession: Electron.Session): void {
  targetSession.webRequest.onHeadersReceived((details: any, callback: any) => {
    const responseHeaders = details.responseHeaders || {};
    const setCookie = responseHeaders['set-cookie'] || responseHeaders['Set-Cookie'];
    if (setCookie) {
      responseHeaders['set-cookie'] = setCookie.map((cookie: string) => {
        let newCookie = cookie;
        if (/SameSite=Lax/i.test(newCookie)) {
          newCookie = newCookie.replace(/SameSite=Lax/gi, 'SameSite=None');
        }
        if (/SameSite=None/i.test(newCookie) && !/Secure/i.test(newCookie)) {
          newCookie += '; Secure';
        }
        return newCookie;
      });
    }
    callback({ cancel: false, responseHeaders });
  });

  const applyYouTubeHeaderInterceptor = (sess: Electron.Session) => {
    sess.webRequest.onBeforeSendHeaders(
      {
        urls: [
          '*://*.youtube.com/*',
          '*://*.youtube-nocookie.com/*',
          '*://*.googlevideo.com/*',
        ],
      },
      (details: any, callback: any) => {
        const requestHeaders = details.requestHeaders || {};
        requestHeaders['Referer'] = 'https://www.youtube.com/';
        requestHeaders['Origin'] = 'https://www.youtube.com';
        callback({ cancel: false, requestHeaders });
      }
    );
  };

  applyYouTubeHeaderInterceptor(targetSession);
  if (electronSession.defaultSession && electronSession.defaultSession !== targetSession) {
    applyYouTubeHeaderInterceptor(electronSession.defaultSession);
  }
}

let cachedFrontendDir: string | null = null;
const appFileResolutionCache = new Map<string, string | false>();
let cachedIndexHtmlBuffer: Buffer | null = null;

function getFrontendDir(resourcesPath: string, appDir: string): string {
  if (cachedFrontendDir) return cachedFrontendDir;
  const candidateDirs = [
    path.join(resourcesPath, 'frontend'),
    path.resolve(appDir, '../../frontend/dist'),
    path.resolve(appDir, '../frontend/dist'),
    path.resolve(appDir, '../../dist'),
    path.resolve(appDir, '../dist'),
  ];
  cachedFrontendDir = candidateDirs.find((p) => fs.existsSync(p)) || candidateDirs[0];
  return cachedFrontendDir;
}

/**
 * Register the custom app:// protocol to safely serve production SPA files.
 */
export function registerAppProtocol(targetSession: Electron.Session, resourcesPath: string, appDir: string): void {
  const frontendDir = getFrontendDir(resourcesPath, appDir);
  const normFrontendDir = path.normalize(frontendDir);

  const handleAppProtocol = async (request: Request) => {
    try {
      const parsed = new URL(request.url);
      let relativePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
      if (!relativePath) relativePath = 'index.html';

      // ── Memory Fast-Path for SPA Entry Point ──
      if (relativePath === 'index.html') {
        if (!cachedIndexHtmlBuffer) {
          const indexPath = path.normalize(path.join(frontendDir, 'index.html'));
          if (fs.existsSync(indexPath)) {
            cachedIndexHtmlBuffer = await fs.promises.readFile(indexPath);
          }
        }
        if (cachedIndexHtmlBuffer) {
          return new Response(cachedIndexHtmlBuffer as any, {
            status: 200,
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-cache',
            },
          });
        }
      }

      // Check resolution cache
      let targetPath = appFileResolutionCache.get(relativePath);
      if (targetPath === false) {
        return new Response('Not found', { status: 404 });
      }

      if (!targetPath) {
        targetPath = path.normalize(path.join(frontendDir, relativePath));
        if (!targetPath.startsWith(normFrontendDir)) {
          return new Response('Forbidden', { status: 403 });
        }

        if (!fs.existsSync(targetPath) && parsed.pathname.includes('/assets/')) {
          const assetsIdx = parsed.pathname.indexOf('/assets/');
          const fallbackAsset = path.normalize(path.join(frontendDir, parsed.pathname.slice(assetsIdx + 1)));
          if (fallbackAsset.startsWith(normFrontendDir) && fs.existsSync(fallbackAsset) && fs.statSync(fallbackAsset).isFile()) {
            targetPath = fallbackAsset;
          }
        }

        const ext = path.extname(targetPath).toLowerCase();
        if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
          if (!ext || ext === '.html') {
            targetPath = path.join(frontendDir, 'index.html');
          } else {
            appFileResolutionCache.set(relativePath, false);
            return new Response('Not found', { status: 404 });
          }
        }
        appFileResolutionCache.set(relativePath, targetPath);
      }

      const fileUrl = pathToFileURL(targetPath).toString();
      const response = await net.fetch(fileUrl);
      const targetExt = path.extname(targetPath).toLowerCase();
      const mime = MIME_TYPES[targetExt];
      const headers = new Headers(response.headers);
      if (mime) {
        headers.set('content-type', mime);
      }

      // Enable aggressive caching for hashed assets, allow V8 bytecode caching
      if (targetPath.includes('/assets/') || targetPath.includes('\\assets\\')) {
        headers.set('cache-control', 'public, max-age=31536000, immutable');
      } else {
        headers.set('cache-control', 'no-cache');
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      console.error('[main] app protocol error:', err);
      return new Response('Internal error', { status: 500 });
    }
  };

  if (!targetSession.protocol.isProtocolHandled('app')) {
    targetSession.protocol.handle('app', handleAppProtocol);
  }
  if (!protocol.isProtocolHandled('app')) {
    protocol.handle('app', handleAppProtocol);
  }
}

/**
 * Register media-cache:// protocol handler for caching images locally with memory LRU.
 */
export function registerMediaCacheProtocol(targetSession: Electron.Session, userDataPath: string): void {
  const cacheDir = path.join(userDataPath, 'image-cache');
  if (!fs.existsSync(cacheDir)) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
    } catch {}
  }

  const mediaMemoryCache = new Map<string, { buffer: Buffer; contentType: string }>();

  const getMimeType = (url: string) => {
    const ext = url.split('.').pop()?.toLowerCase();
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'svg') return 'image/svg+xml';
    return 'image/jpeg';
  };

  targetSession.protocol.handle('media-cache', async (request: Request) => {
    const originalUrl = 'https://' + request.url.replace(/^media-cache:(?:\/\/)?/, '');

    const inMemory = mediaMemoryCache.get(originalUrl);
    if (inMemory) {
      return new Response(inMemory.buffer as any, {
        headers: { 'content-type': inMemory.contentType },
      });
    }

    const hash = crypto.createHash('sha256').update(originalUrl).digest('hex');
    const cachePath = path.join(cacheDir, hash);

    try {
      if (fs.existsSync(cachePath)) {
        const fileUrl = pathToFileURL(cachePath).toString();
        const diskResp = await net.fetch(fileUrl);
        const contentType = getMimeType(originalUrl);
        const buffer = Buffer.from(await diskResp.arrayBuffer());

        if (mediaMemoryCache.size >= 100) {
          const firstKey = mediaMemoryCache.keys().next().value;
          if (firstKey) mediaMemoryCache.delete(firstKey);
        }
        mediaMemoryCache.set(originalUrl, { buffer, contentType });

        return new Response(buffer as any, {
          headers: { 'content-type': contentType },
        });
      }
    } catch {}

    try {
      const response = await net.fetch(originalUrl);
      if (response.ok) {
        const arrayBuf = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const contentType = response.headers.get('content-type') || getMimeType(originalUrl);

        try {
          await fs.promises.writeFile(cachePath, buffer);
        } catch {}

        if (mediaMemoryCache.size >= 100) {
          const firstKey = mediaMemoryCache.keys().next().value;
          if (firstKey) mediaMemoryCache.delete(firstKey);
        }
        mediaMemoryCache.set(originalUrl, { buffer, contentType });

        return new Response(buffer as any, {
          headers: { 'content-type': contentType },
          status: response.status,
          statusText: response.statusText,
        });
      }
      return response;
    } catch (err) {
      console.error('[ImageCache] Fetch failed for', originalUrl, err);
      return new Response('Fetch failed', { status: 500 });
    }
  });
}

/**
 * Register local-media:// protocol handler for fast native streaming of local video and audio files.
 * Supports HTTP Range requests (206 Partial Content) for zero-lag timeline scrubbing and seeking.
 */
export function registerLocalMediaProtocol(targetSession: Electron.Session): void {
  targetSession.protocol.handle('local-media', async (request: Request) => {
    try {
      const url = new URL(request.url);
      const filePathParam = url.searchParams.get('path');
      let targetPath = filePathParam
        ? decodeURIComponent(filePathParam)
        : decodeURIComponent(url.pathname.replace(/^\/+/, ''));

      // Normalise Windows drive letters
      if (process.platform === 'win32' && !/^[a-zA-Z]:/.test(targetPath) && /^[a-zA-Z]\//.test(targetPath)) {
        targetPath = targetPath[0] + ':' + targetPath.slice(1);
      }

      targetPath = path.normalize(targetPath);
      if (!targetPath || !fs.existsSync(targetPath)) {
        console.warn('[protocols] local-media file not found:', targetPath);
        return new Response('Not found', { status: 404 });
      }

      try {
        const stat = fs.statSync(targetPath);
        if (!stat.isFile()) {
          console.warn('[protocols] local-media target is not a file:', targetPath);
          return new Response('Not a file', { status: 400 });
        }
      } catch {
        return new Response('Not found', { status: 404 });
      }

      const fileUrl = pathToFileURL(targetPath).toString();
      const reqHeaders = new Headers();
      const range = request.headers.get('range');
      if (range) {
        reqHeaders.set('range', range);
      }

      const response = await net.fetch(fileUrl, {
        headers: reqHeaders,
        bypassCustomProtocolHandlers: true,
      });

      const ext = path.extname(targetPath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const headers = new Headers(response.headers);
      headers.set('content-type', mime);
      headers.set('accept-ranges', 'bytes');
      headers.set('access-control-allow-origin', '*');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      console.error('[protocols] local-media error:', err);
      return new Response('Media stream error', { status: 500 });
    }
  });
}
