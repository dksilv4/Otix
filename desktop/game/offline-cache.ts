// desktop/game/offline-cache.ts
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { app } from 'electron';
import { hydrateGame, getCandidateGameIds } from './storage';

export interface OfflineHydrationOptions {
  authToken?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
}

export function getArtworkCacheDir(): string {
  try {
    const basePath = app && typeof app.getPath === 'function'
      ? app.getPath('userData')
      : path.join(process.env.APPDATA || process.env.HOME || '', '.otix');
    const dir = path.join(basePath, 'image-cache');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  } catch {
    return '';
  }
}

/**
 * Downloads a remote image buffer with a timeout and content-type detection.
 */
export async function downloadRemoteImage(
  url: string,
  timeoutMs = 8000,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return null;
  }

  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.get(url, { timeout: timeoutMs }, (res) => {
        // Follow redirects
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          downloadRemoteImage(res.headers.location, timeoutMs).then(resolve);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }

        const contentType = res.headers['content-type'] || 'image/jpeg';
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (buf.length > 0) {
            resolve({ buffer: buf, contentType });
          } else {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Converts remote artwork to local offline data URL and caches to disk.
 */
export async function cacheArtworkOffline(
  mediaId: string,
  kind: 'poster' | 'backdrop' | 'logo' | 'icon',
  url: string | null | undefined,
): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;

  // Already a clean media-cache protocol URL
  if (url.startsWith('media-cache://')) return url;

  let buffer: Buffer;
  let contentType: string;

  if (url.startsWith('data:image/')) {
    const matches = url.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      contentType = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      return null;
    }
  } else {
    const downloaded = await downloadRemoteImage(url);
    if (!downloaded) return url;
    buffer = downloaded.buffer;
    contentType = downloaded.contentType;
  }

  const ext = contentType.includes('png')
    ? 'png'
    : contentType.includes('webp')
      ? 'webp'
      : 'jpg';

  const cacheDir = getArtworkCacheDir();
  if (cacheDir) {
    try {
      const sanitizedId = String(mediaId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${sanitizedId}_${kind}.${ext}`;
      fs.writeFileSync(path.join(cacheDir, filename), buffer);
      return `media-cache://local/${filename}`;
    } catch (err) {
      console.warn(`[offline-cache] Failed to write artwork file for ${mediaId}:`, err);
    }
  }

  return url;
}

/**
 * Downloads full metadata and all artwork from the backend, making it available 100% offline.
 */
export async function downloadAndHydrateGameOffline(
  gameId: string,
  mediaId: string,
  fallbackTitle?: string,
  options: OfflineHydrationOptions = {},
): Promise<any | null> {
  const cleanId = String(mediaId).trim().replace(/\.0+$/, '');
  if (!cleanId || /^(pc_file_|iso[:_]file_|steam_|rom_|ps\d+_|xbox|switch_|file_)/i.test(cleanId)) {
    return null;
  }

  let baseUrl = options.apiBaseUrl;
  let token = options.authToken;

  if (!baseUrl) {
    try {
      const { getApiBaseUrl } = require('../config');
      baseUrl = getApiBaseUrl();
    } catch {
      baseUrl = 'http://127.0.0.1:8000';
    }
  }

  if (!token) {
    try {
      const store = require('electron-store');
      const appStore = new store({ name: 'otix-desktop' });
      token = appStore.get('auth.access_token') as string | undefined;
    } catch {
      // ignore
    }
  }

  let fullDetail: any = null;

  try {
    const isIgdb = cleanId.startsWith('igdb:');
    const endpoint = isIgdb
      ? `${baseUrl}/api/v1/media/import/igdb?igdb_id=${encodeURIComponent(cleanId.slice(5))}`
      : `${baseUrl}/api/v1/media/game/${encodeURIComponent(cleanId)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10000);

    try {
      const res = await fetch(endpoint, {
        method: isIgdb ? 'POST' : 'GET',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });

      if (res.ok) {
        fullDetail = await res.json();
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    console.warn(`[offline-cache] Failed to fetch full game details for ${cleanId}:`, err.message);
  }

  const title = fullDetail?.title || fallbackTitle || '';
  const rawPoster = fullDetail?.poster_url || fullDetail?.posterUrl || null;
  const rawBackdrop = fullDetail?.backdrop_url || fullDetail?.backdropUrl || null;
  const rawLogo = fullDetail?.logo_url || fullDetail?.logoUrl || null;
  const rawIcon = fullDetail?.icon_url || fullDetail?.iconUrl || null;

  // Download artwork in parallel for offline access
  const [offlinePoster, offlineBackdrop, offlineLogo, offlineIcon] = await Promise.all([
    cacheArtworkOffline(cleanId, 'poster', rawPoster),
    cacheArtworkOffline(cleanId, 'backdrop', rawBackdrop),
    cacheArtworkOffline(cleanId, 'logo', rawLogo),
    cacheArtworkOffline(cleanId, 'icon', rawIcon),
  ]);

  const resolvedPoster = offlinePoster || rawPoster;
  const resolvedBackdrop = offlineBackdrop || rawBackdrop;
  const resolvedLogo = offlineLogo || rawLogo;
  const resolvedIcon = offlineIcon || rawIcon;

  const richPayload = {
    ...(fullDetail || {}),
    id: cleanId,
    title,
    overview: fullDetail?.overview || '',
    releaseDate: fullDetail?.release_date || fullDetail?.releaseDate || null,
    genres: fullDetail?.genres || [],
    involvedCompanies: fullDetail?.involved_companies || fullDetail?.companies || [],
    rating: fullDetail?.overall_rating ?? fullDetail?.avg_rating ?? fullDetail?.rating ?? null,
    posterUrl: resolvedPoster,
    backdropUrl: resolvedBackdrop,
    logoUrl: resolvedLogo,
    iconUrl: resolvedIcon,
  };

  hydrateGame(
    gameId,
    title,
    resolvedIcon,
    resolvedPoster,
    richPayload,
    1.0,
    cleanId,
    resolvedBackdrop,
    null,
    resolvedLogo,
  );

  return richPayload;
}
