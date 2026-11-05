import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  filterQualityResults,
  autoPickBest,
  hasHypervisorTags,
  gameSignature,
  extractGroup,
  findMatchingUpdates,
  testSabnzbdConnection,
  testNzbPlanetConnection,
  searchNzbPlanet,
} from '../downloads/downloader';

describe('desktop/downloads/downloader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Quality Filter & Auto-Pick', () => {
    it('filters out demos, alphas, and crack-only patterns', () => {
      const results = [
        { title: 'Cyberpunk.2077.Demo', size: 1000 },
        { title: 'Cyberpunk.2077.Crack.Only-CODEX', size: 50 },
        { title: 'Cyberpunk.2077.v1.6-CODEX', size: 55000000000 },
      ];

      const filtered = filterQualityResults(results);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Cyberpunk.2077.v1.6-CODEX');
    });

    it('detects hypervisor tags accurately', () => {
      expect(hasHypervisorTags({ title: 'Game.Name.HV.Repack' })).toBe(true);
      expect(hasHypervisorTags({ title: 'Game Name QEMU VM Image' })).toBe(true);
      expect(hasHypervisorTags({ title: 'Game.Name-CODEX' })).toBe(false);
    });

    it('auto-picks preferred repacker when configured', () => {
      const results = [
        { title: 'Game.Name.Repack-DODI', size: 20000000000 },
        { title: 'Game.Name.Repack-FitGirl', size: 18000000000 },
        { title: 'Game.Name-SKIDROW', size: 25000000000 },
      ];

      const best = autoPickBest(results, 'FitGirl, DODI');
      expect(best).not.toBeNull();
      expect(best.title).toBe('Game.Name.Repack-FitGirl');
    });

    it('excludes hypervisor releases when allowHypervisor is false', () => {
      const results = [
        { title: 'Game.Name.HV.Image', size: 20000000000 },
      ];

      const best = autoPickBest(results, undefined, false);
      expect(best).toBeNull();

      const bestWithHv = autoPickBest(results, undefined, true);
      expect(bestWithHv).not.toBeNull();
      expect(bestWithHv.title).toBe('Game.Name.HV.Image');
    });
  });

  describe('Game Signatures & Update Matching', () => {
    it('normalizes game signatures identically across editions and updates', () => {
      const baseSig = gameSignature('The.Witcher.3.Wild.Hunt-GOG');
      const updateSig = gameSignature('The.Witcher.3.Wild.Hunt.Update.v4.04-GOG');
      expect(baseSig).toBe(updateSig);
    });

    it('extracts release groups from dash-separated and space-separated titles', () => {
      expect(extractGroup('Elden.Ring-CODEX')).toBe('codex');
      expect(extractGroup('Elden Ring v1.10 ElAmigos')).toBe('elamigos');
    });

    it('finds and deduplicates matching updates for a base release', () => {
      const base = 'Hollow.Knight-GOG';
      const results = [
        { guid: '1', title: 'Hollow.Knight.Update.v1.4.3.2-GOG', size: 200000000, pubDate: '', category: 'games', nzbUrl: '', detailsUrl: '' },
        { guid: '2', title: 'Hollow.Knight.Update.v1.4.3.2-RELOADED', size: 150000000, pubDate: '', category: 'games', nzbUrl: '', detailsUrl: '' },
        { guid: '3', title: 'Celeste.Update.v1.0-CODEX', size: 100000000, pubDate: '', category: 'games', nzbUrl: '', detailsUrl: '' },
      ];

      const updates = findMatchingUpdates(base, results);
      expect(updates).toHaveLength(1);
      expect(updates[0].title).toBe('Hollow.Knight.Update.v1.4.3.2-GOG');
    });
  });

  describe('Connection & Search API Clients', () => {
    it('tests SABnzbd connection using version mode', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: async () => ({ version: '4.2.1' }),
      });
      global.fetch = fetchMock;

      const ok = await testSabnzbdConnection('localhost', 8080, 'testkey', false);
      expect(ok).toBe(true);
      expect(fetchMock).toHaveBeenCalled();
      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('mode=version');
      expect(calledUrl).toContain('apikey=testkey');
    });

    it('tests NZBPlanet connection', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '{"channel":{"item":[{"title":"Test"}]}}',
      });
      global.fetch = fetchMock;

      const ok = await testNzbPlanetConnection('planet-key');
      expect(ok).toBe(true);
    });

    it('parses JSON responses from NZBPlanet search', async () => {
      const mockItems = [
        { guid: 'guid-1', title: 'Hades.v1.38-CODEX', size: 12000000000, link: 'https://nzbplanet.net/get/1', category: 'Games > PC' },
      ];
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ channel: { item: mockItems } }),
      });

      const results = await searchNzbPlanet('Hades', 'api-key');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Hades.v1.38-CODEX');
      expect(results[0].size).toBe(12000000000);
      expect(results[0].nzbUrl).toBe('https://nzbplanet.net/get/1');
    });
  });
});
