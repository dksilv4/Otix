import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseReleaseName } from '../game/parser';

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

describe('TypeScript Parser Parity across all 110 shared fixtures', () => {
  const fixturePath = path.resolve(__dirname, '../../fixtures/parser_fixtures.json');
  const raw = fs.readFileSync(fixturePath, 'utf8');
  const data = JSON.parse(raw) as { cases: FixtureCase[] };
  const cases = data.cases;

  it.each(cases)('case %#: $input', (tc) => {
    const res = parseReleaseName(tc.input, tc.ext_hint, tc.parent_dir);
    const exp = tc.expected;

    expect(res.title).toBe(exp.title);
    expect(res.cleanTitle).toBe(exp.clean_title);
    expect(res.platform).toBe(exp.platform);
    expect(res.releaseGroup || res.group || '').toBe(exp.release_group);
    expect(res.year || '').toBe(exp.year);
    expect(res.edition || '').toBe(exp.edition || '');
    expect(res.version || '').toBe(exp.version);
    expect(res.region || '').toBe(exp.region);
    expect(res.titleId || '').toBe(exp.title_id);
    expect(Boolean(res.isScene)).toBe(Boolean(exp.is_scene));
  });
});
