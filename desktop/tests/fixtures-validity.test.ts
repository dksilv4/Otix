import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

interface FixtureCase {
  input: string;
  ext_hint: string;
  parent_dir: string;
  expected: {
    title: string;
    clean_title: string;
    year: string;
    edition: string;
    platform: string;
    release_group: string;
    region: string;
    version: string;
    title_id: string;
    is_scene: boolean;
  };
}

interface FixturesData {
  cases: FixtureCase[];
}

describe('Shared Parser Fixtures Validity & Parity Suite', () => {
  const fixturePath = path.resolve(__dirname, '../../fixtures/parser_fixtures.json');

  it('verifies parser_fixtures.json exists and is valid JSON', () => {
    expect(fs.existsSync(fixturePath)).toBe(true);
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as FixturesData;
    expect(parsed).toBeDefined();
    expect(Array.isArray(parsed.cases)).toBe(true);
  });

  const raw = fs.readFileSync(fixturePath, 'utf8');
  const data = JSON.parse(raw) as FixturesData;
  const cases = data.cases;

  it('contains at least 105 comprehensive test cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(105);
  });

  const REQUIRED_PLATFORMS = [
    'PC',
    'NES',
    'SNES',
    'N64',
    'GameCube',
    'Wii',
    'Switch',
    'PS1',
    'PS2',
    'PS3',
    'PSP',
    'Dreamcast',
  ];

  it('covers all 11 required retro console platforms and PC', () => {
    const platformsPresent = new Set(cases.map((c) => c.expected.platform));
    for (const plat of REQUIRED_PLATFORMS) {
      expect(platformsPresent.has(plat), `Platform "${plat}" should be present in fixtures`).toBe(true);
    }
  });

  it('contains at least 25 scene release cases', () => {
    const sceneCases = cases.filter((c) => c.expected.is_scene);
    expect(sceneCases.length).toBeGreaterThanOrEqual(25);
  });

  it('contains at least 25 repacks, multi-part, or archive cases', () => {
    const repackCases = cases.filter((c) => /part\d+|\.bin|\.iso|\.rar|\.zip|repack/i.test(c.input));
    expect(repackCases.length).toBeGreaterThanOrEqual(25);
  });

  it('contains at least 15 update, DLC, patch, or hotfix cases', () => {
    const updateCases = cases.filter((c) => /update|dlc|patch|hotfix|crackfix/i.test(c.input));
    expect(updateCases.length).toBeGreaterThanOrEqual(15);
  });

  describe('Strict Field Compliance', () => {
    cases.forEach((tc, idx) => {
      it(`validates case #${idx + 1}: ${tc.input}`, () => {
        expect(typeof tc.input).toBe('string');
        expect(tc.input.trim().length).toBeGreaterThan(0);
        expect(typeof tc.ext_hint).toBe('string');
        expect(typeof tc.parent_dir).toBe('string');

        const exp = tc.expected;
        expect(exp).toBeDefined();
        expect(typeof exp.title).toBe('string');
        expect(exp.title.trim().length).toBeGreaterThan(0);
        expect(typeof exp.clean_title).toBe('string');
        expect(exp.clean_title.trim().length).toBeGreaterThan(0);
        expect(typeof exp.year).toBe('string');
        expect(typeof exp.edition).toBe('string');
        expect(typeof exp.platform).toBe('string');
        expect(REQUIRED_PLATFORMS).toContain(exp.platform);
        expect(typeof exp.release_group).toBe('string');
        expect(typeof exp.region).toBe('string');
        expect(typeof exp.version).toBe('string');
        expect(typeof exp.title_id).toBe('string');
        expect(typeof exp.is_scene).toBe('boolean');
      });
    });
  });
});
