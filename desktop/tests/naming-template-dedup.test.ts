import { describe, it, expect } from 'vitest';
import { applyNamingTemplate, validateNamingTemplate, parseReleaseName } from '../game/parser';

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
});
