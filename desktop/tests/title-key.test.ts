import { describe, it, expect } from 'vitest';
import { normalizeTitle, comparisonKey, stripEditionMarkers } from '../game/title-key';

// Ported from backend tests/unit/services/test_game_matcher_quality.py
// (TestNormalizeTitle + TestNormalizeEdgeCases) and the docstring cases in
// otix/services/game_matcher.py.

describe('normalizeTitle', () => {
  it('strips trademark ™', () => {
    expect(normalizeTitle('Rocket League™')).toBe('Rocket League');
  });

  it('strips registered ®', () => {
    expect(normalizeTitle('Doom®')).toBe('Doom');
  });

  it('strips copyright ©', () => {
    expect(normalizeTitle('Game© 2024')).toBe('Game 2024');
  });

  it('decomposes accents (é → e)', () => {
    expect(normalizeTitle('Pokémon')).toBe('Pokemon');
  });

  it('collapses whitespace', () => {
    expect(normalizeTitle('  Hello   World  ')).toBe('Hello World');
  });

  it('preserves colons', () => {
    expect(normalizeTitle('Game: Subtitle')).toBe('Game: Subtitle');
  });

  it('handles empty input', () => {
    expect(normalizeTitle('')).toBe('');
  });

  it('handles symbols only', () => {
    expect(normalizeTitle('™®©')).toBe('');
  });

  it('handles numeric title', () => {
    expect(normalizeTitle('  2048  ')).toBe('2048');
  });

  it('strips mixed symbols around text', () => {
    expect(normalizeTitle('Game™: The Reckoning® ©2024')).toBe('Game: The Reckoning 2024');
  });

  it('keeps CJK text intact', () => {
    expect(normalizeTitle('ゼルダの伝説').length).toBeGreaterThan(0);
  });
});

describe('comparisonKey', () => {
  it('collapses arabic and roman numerals', () => {
    expect(comparisonKey('Shenmue 3')).toBe(comparisonKey('Shenmue III'));
    expect(comparisonKey('Shenmue 3')).toBe('shenmue n3');
  });

  it('collapses numeral ranges and lists', () => {
    const a = comparisonKey('Tomb Raider I-III');
    const b = comparisonKey('Tomb Raider I•II•III');
    expect(a).toBe(b);
    expect(a).toBe('tomb raider n1 n2 n3');
  });

  it('collapses 40K vs 40,000', () => {
    expect(comparisonKey('Warhammer 40K Speed Freeks')).toBe(
      comparisonKey('Warhammer 40,000: Speed Freeks'),
    );
    expect(comparisonKey('Warhammer 40K Speed Freeks')).toBe('warhammer n40000 speed freeks');
  });

  it('strips edition markers', () => {
    expect(comparisonKey('Control Ultimate Edition')).toBe('control');
  });

  it('drops descriptive Starring clause', () => {
    expect(comparisonKey('Tomb Raider I-III Remastered Starring Lara Croft')).toBe(
      'tomb raider n1 n2 n3 remastered',
    );
  });

  it('strips Starter Access', () => {
    expect(comparisonKey('Trackmania Starter Access')).toBe('trackmania');
  });

  it('collapses hyphen vs colon subtitles', () => {
    expect(comparisonKey('Brothers - A Tale of Two Sons')).toBe(
      comparisonKey('Brothers: A Tale of Two Sons'),
    );
  });
});

describe('stripEditionMarkers', () => {
  it('strips Game of the Year Edition suffix', () => {
    expect(stripEditionMarkers('The Witcher 3: Wild Hunt - Game of the Year Edition')).toBe(
      'The Witcher 3: Wild Hunt',
    );
  });

  it('strips GOTY Edition', () => {
    expect(stripEditionMarkers('Batman: Arkham City GOTY Edition')).toBe('Batman: Arkham City');
  });

  it('strips The Final Cut', () => {
    expect(stripEditionMarkers('Disco Elysium - The Final Cut')).toBe('Disco Elysium');
  });
});
