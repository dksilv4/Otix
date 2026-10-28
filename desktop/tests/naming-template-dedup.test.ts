import { describe, it, expect } from 'vitest';
import { applyNamingTemplate, validateNamingTemplate, parseReleaseName } from '../game/parser';
import { resolveSidecarPlatform } from '../downloads/organizer';

describe('naming-template-dedup', () => {
  it('deduplicates duplicate [{platform}] tags in template', () => {
    const release = parseReleaseName('Elden Ring');
    release.platform = 'PC';
    const fileInfo = { name: 'Elden Ring.iso', ext: 'iso', type: 'iso' as const };

    // Template with duplicate platform tags
    const target = applyNamingTemplate(release, '{Title} [{platform}] [{Platform}]', fileInfo);
    expect(target).toBe('Elden Ring [PC]');
  });

  it('replaces lowercase {platform} and {title} case-insensitively', () => {
    const release = parseReleaseName('Hades II');
    release.platform = 'PC';
    const fileInfo = { name: 'Hades II.iso', ext: 'iso', type: 'iso' as const };

    const target = applyNamingTemplate(release, '{title} [{platform}]', fileInfo);
    expect(target).toBe('Hades II [PC]');
  });

  it('prevents duplicate platform tags when title already contains platform', () => {
    const release = parseReleaseName('AI Limit [PC]');
    release.platform = 'PC';
    const fileInfo = { name: 'AI Limit.iso', ext: 'iso', type: 'iso' as const };

    const target = applyNamingTemplate(release, '{Title} [{Platform}]', fileInfo);
    expect(target).toBe('AI Limit [PC]');
  });

  it('deduplicates mixed bracket/parenthesis platform tags like [PC] (PC)', () => {
    const release = parseReleaseName('Balatro');
    release.platform = 'PC';
    const fileInfo = { name: 'Balatro.iso', ext: 'iso', type: 'iso' as const };

    const target = applyNamingTemplate(release, '{Title} [{Platform}] (PC)', fileInfo);
    expect(target).toBe('Balatro [PC]');
  });

  it('validateNamingTemplate accepts case-insensitive tokens like {platform}', () => {
    const res = validateNamingTemplate('{title} ({year}) [{platform}]/{originalName}.{ext}');
    expect(res.valid).toBe(true);
  });

  it('deduplicates all tags including non-adjacent year, edition, and release group', () => {
    const release = parseReleaseName('Cyberpunk 2077 [2020] [PC]');
    release.year = '2020';
    release.platform = 'PC';
    release.edition = 'Deluxe Edition';
    release.group = 'RUNE';
    const fileInfo = { name: 'Cyberpunk.iso', ext: 'iso', type: 'iso' as const };

    const target = applyNamingTemplate(release, '{Title} [{Year}] [{Platform}] [{Edition}] [{ReleaseGroup}]', fileInfo);
    expect(target).toBe('Cyberpunk 2077 [2020] [PC] [Deluxe Edition] [RUNE]');
  });

  it('deduplicates multiple duplicate year and version tags', () => {
    const release = parseReleaseName('Grand Theft Auto V (2013) [v1.0]');
    release.year = '2013';
    release.version = '1.0';
    release.platform = 'PC';
    const fileInfo = { name: 'GTAV.iso', ext: 'iso', type: 'iso' as const };

    const target = applyNamingTemplate(release, '{Title} ({Year}) [{Platform}] [{Version}]', fileInfo);
    expect(target).toBe('Grand Theft Auto V (2013) [PC] [1.0]');
  });

  it('resolveSidecarPlatform prioritizes PC even when Xbox is first in platforms array', () => {
    const sc = {
      title: 'Baldur\'s Gate 3',
      platforms: [
        { id: 19, name: 'Xbox Series X|S', slug: 'xbox-series-x-s' },
        { id: 10, name: 'PC (Microsoft Windows)', slug: 'windows' },
        { id: 22, name: 'PlayStation 5', slug: 'playstation-5' },
      ],
    };
    expect(resolveSidecarPlatform(sc)).toBe('PC');
  });

  it('resolveSidecarPlatform prioritizes PC when PlayStation 3 is first in platforms array', () => {
    const sc = {
      title: 'Grand Theft Auto V',
      platforms: [
        { id: 9, name: 'PlayStation 3', slug: 'playstation-3' },
        { id: 12, name: 'Xbox 360', slug: 'xbox-360' },
        { id: 6, name: 'PC (Microsoft Windows)', slug: 'windows' },
      ],
    };
    expect(resolveSidecarPlatform(sc)).toBe('PC');
  });

  it('resolveSidecarPlatform handles string array format and prioritizes PC', () => {
    const sc = {
      title: 'The Elder Scrolls V: Skyrim',
      platforms: ['playstation-3', 'xbox-360', 'windows'],
    };
    expect(resolveSidecarPlatform(sc)).toBe('PC');
  });

  it('resolveSidecarPlatform correctly identifies console platforms like PS3 when no PC is present', async () => {
    const { resolveSidecarPlatform } = await import('../downloads/organizer');
    const scPs3 = {
      title: 'Metal Gear Solid 4: Guns of the Patriots',
      platforms: [{ id: 9, name: 'PlayStation 3', slug: 'playstation-3' }],
    };
    expect(resolveSidecarPlatform(scPs3)).toBe('PS3');
  });

  it('resolveSidecarPlatform returns console platform when no PC platform is present', async () => {
    const { resolveSidecarPlatform } = await import('../downloads/organizer');
    const scSwitch = {
      title: 'The Legend of Zelda: Tears of the Kingdom',
      platforms: [{ id: 130, name: 'Nintendo Switch', slug: 'nintendo-switch' }],
    };
    expect(resolveSidecarPlatform(scSwitch)).toBe('Switch');

    const scXboxOnly = {
      title: 'Halo 3',
      platforms: [{ id: 14, name: 'Xbox 360', slug: 'xbox360' }],
    };
    expect(resolveSidecarPlatform(scXboxOnly)).toBe('Xbox360');
  });
});
