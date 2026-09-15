import { describe, it, expect } from 'vitest';
import {
  extractReleaseBadges,
  formatAgeDays,
  cleanReleaseTitle,
  sortReleasesByQuality,
  parseServiceAddress,
} from '../usenet-utils';
import type { ServerProwlarrRelease } from '../usenet-types';

describe('Usenet Utilities', () => {
  describe('extractReleaseBadges', () => {
    it('detects GOG, FitGirl, DODI, and ISO badges from release title', () => {
      const badgesGog = extractReleaseBadges('Cyberpunk.2077.v2.0-GOG.iso');
      expect(badgesGog.map((b) => b.label)).toContain('GOG');
      expect(badgesGog.map((b) => b.label)).toContain('ISO');

      const badgesFitgirl = extractReleaseBadges('Hades.II.Early.Access-FitGirl.Repack');
      expect(badgesFitgirl.map((b) => b.label)).toContain('FitGirl');
      expect(badgesFitgirl.map((b) => b.label)).toContain('Repack');

      const badgesDodi = extractReleaseBadges('Elden.Ring.Shadow.of.the.Erdtree-DODI');
      expect(badgesDodi.map((b) => b.label)).toContain('DODI');
    });

    it('returns empty array when no known scene tags exist', () => {
      expect(extractReleaseBadges('Generic.Game.Title.1999')).toEqual([]);
    });
  });

  describe('formatAgeDays', () => {
    it('formats days into compact human-readable units', () => {
      expect(formatAgeDays(0)).toBe('Today');
      expect(formatAgeDays(1)).toBe('1 day ago');
      expect(formatAgeDays(14)).toBe('14d ago');
      expect(formatAgeDays(65)).toBe('2mo ago');
      expect(formatAgeDays(400)).toBe('1.1y ago');
      expect(formatAgeDays(null)).toBe('');
      expect(formatAgeDays(undefined)).toBe('');
    });
  });

  describe('cleanReleaseTitle', () => {
    it('strips dot separators and file extensions', () => {
      expect(cleanReleaseTitle('Cyberpunk.2077.v2.0-GOG.iso')).toBe('Cyberpunk 2077 v2 0-GOG');
      expect(cleanReleaseTitle('The_Witcher_3_Wild_Hunt.nzb')).toBe('The Witcher 3 Wild Hunt');
    });

    it('handles empty string gracefully', () => {
      expect(cleanReleaseTitle('')).toBe('');
    });
  });

  describe('sortReleasesByQuality', () => {
    const mockReleases: ServerProwlarrRelease[] = [
      {
        guid: '1',
        title: 'Random.Game.Upload',
        size: 5000000,
        download_url: 'http://prowlarr/1',
        indexer: 'NZBGeek',
        protocol: 'usenet',
        age_days: 10,
      },
      {
        guid: '2',
        title: 'Cyberpunk.2077-GOG.iso',
        size: 60000000,
        download_url: 'http://prowlarr/2',
        indexer: 'NZBPlanet',
        protocol: 'usenet',
        age_days: 5,
      },
      {
        guid: '3',
        title: 'Cyberpunk.2077-FitGirl.Repack',
        size: 35000000,
        download_url: 'http://prowlarr/3',
        indexer: 'NinjaCentral',
        protocol: 'usenet',
        age_days: 2,
      },
    ];

    it('prioritizes preferred repackers when configured', () => {
      const sorted = sortReleasesByQuality(mockReleases, ['FitGirl']);
      expect(sorted[0].guid).toBe('3');
    });

    it('prioritizes releases with scene/trusted tags over random uploads', () => {
      const sorted = sortReleasesByQuality(mockReleases);
      expect(sorted[0].title).toContain('FitGirl');
      expect(sorted[1].title).toContain('GOG');
      expect(sorted[2].title).toBe('Random.Game.Upload');
    });
  });

  describe('parseServiceAddress', () => {
    it('parses full URL with scheme, port, and subpath', () => {
      const parsed = parseServiceAddress('http://nas.local:8080/sabnzbd', 8080);
      expect(parsed.host).toBe('nas.local');
      expect(parsed.port).toBe(8080);
      expect(parsed.use_ssl).toBe(false);
      expect(parsed.url_base).toBe('/sabnzbd');
    });

    it('parses HTTPS URL with subpath and default port', () => {
      const parsed = parseServiceAddress('https://prowlarr.myhome.net/prowlarr');
      expect(parsed.host).toBe('prowlarr.myhome.net');
      expect(parsed.port).toBe(443);
      expect(parsed.use_ssl).toBe(true);
      expect(parsed.url_base).toBe('/prowlarr');
    });

    it('parses raw host with subpath and fallback port', () => {
      const parsed = parseServiceAddress('192.168.1.100/sabnzbd/', 8080);
      expect(parsed.host).toBe('192.168.1.100');
      expect(parsed.port).toBe(8080);
      expect(parsed.url_base).toBe('/sabnzbd');
    });

    it('handles clean host without subpath', () => {
      const parsed = parseServiceAddress('127.0.0.1', 9696);
      expect(parsed.host).toBe('127.0.0.1');
      expect(parsed.port).toBe(9696);
      expect(parsed.url_base).toBe('');
    });

    it('parses user custom domain with subpath into HTTPS reverse proxy on port 443', () => {
      const parsed = parseServiceAddress('server.diogodasilva.com/sabnzbd');
      expect(parsed.host).toBe('server.diogodasilva.com');
      expect(parsed.port).toBe(443);
      expect(parsed.use_ssl).toBe(true);
      expect(parsed.url_base).toBe('/sabnzbd');
    });

    it('cleans typo commas in domain names (e.g. server,diogodasilva.com/sabnzbd)', () => {
      const parsed = parseServiceAddress('server,diogodasilva.com/sabnzbd');
      expect(parsed.host).toBe('server.diogodasilva.com');
      expect(parsed.port).toBe(443);
      expect(parsed.use_ssl).toBe(true);
      expect(parsed.url_base).toBe('/sabnzbd');
    });

    it('parses user custom domain with custom port', () => {
      const parsed = parseServiceAddress('server.diogodasilva.com:8443/sabnzbd');
      expect(parsed.host).toBe('server.diogodasilva.com');
      expect(parsed.port).toBe(8443);
      expect(parsed.url_base).toBe('/sabnzbd');
    });

    it('parses user custom domain root with HTTPS', () => {
      const parsed = parseServiceAddress('prowlarr.mydomain.org');
      expect(parsed.host).toBe('prowlarr.mydomain.org');
      expect(parsed.port).toBe(443);
      expect(parsed.use_ssl).toBe(true);
      expect(parsed.url_base).toBe('');
    });

    it('handles empty input gracefully', () => {
      const parsed = parseServiceAddress('');
      expect(parsed.host).toBe('');
    });
  });
});
