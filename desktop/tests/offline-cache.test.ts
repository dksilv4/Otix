// desktop/tests/offline-cache.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getArtworkCacheDir,
  cacheArtworkOffline,
  downloadAndHydrateGameOffline,
} from '../game/offline-cache';
import * as storage from '../game/storage';

describe('offline-cache', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otix-offline-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('keeps existing base64 data URLs without re-downloading', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const result = await cacheArtworkOffline('game_123', 'poster', dataUrl);
    expect(result).toBe(dataUrl);
  });

  it('handles null and empty URLs gracefully', async () => {
    expect(await cacheArtworkOffline('game_123', 'poster', null)).toBeNull();
    expect(await cacheArtworkOffline('game_123', 'poster', '')).toBeNull();
  });

  it('resolves artwork cache directory correctly', () => {
    const dir = getArtworkCacheDir();
    expect(typeof dir).toBe('string');
  });
});
