import { describe, it, expect } from 'vitest';
import { comparisonKey as desktopKey } from '../title-key';

const PLUGINS_DIR = '../../../extensions/plugins';
const gameMatching = require(`${PLUGINS_DIR}/game-matching-pipeline/main.js`);

type MatchEntry = {
  queryId: string;
  candidate: { mediaId: string; title: string; confidence?: number; posterUrl?: string | null } | null;
};

async function match(req: Record<string, unknown>) {
  const res = await gameMatching.data.catalogMatch({}, [req]);
  return res[0].candidate;
}

// The matching pipeline has no bundled catalog — every identity comes from a
// live `catalog-source` service or the scanned game itself. With a bare ctx
// (no sources), it self-matches to `platform:sourceGameId` and collapses
// cross-store copies of the same game by the same comparison key the desktop's
// LocalMatcher uses.
describe('game-matching-pipeline (offline, no data sources)', () => {
  it('self-matches a scanned game to its own source identity, preserving artwork', async () => {
    const candidate = await match({
      queryId: 'steam:620', title: 'Portal 2',
      externalIds: [{ source: 'steam', id: '620' }],
      posterUrl: 'https://cdn.example.com/p.jpg',
    });
    expect(candidate).toMatchObject({
      mediaId: 'steam:620',
      title: 'Portal 2',
      posterUrl: 'https://cdn.example.com/p.jpg',
      confidence: 1,
    });
  });

  it('collapses cross-store copies of the same game to one identity', async () => {
    const results = await gameMatching.data.catalogMatch({}, [
      { queryId: 'steam:1145360', title: 'Hades' },
      { queryId: 'epic:x', title: 'Hades' },
    ]) as MatchEntry[];
    const steam = results.find((r) => r.queryId === 'steam:1145360');
    const epic = results.find((r) => r.queryId === 'epic:x');
    expect(steam?.candidate?.mediaId).toBe('steam:1145360');
    expect(epic?.candidate?.mediaId).toBe(steam?.candidate?.mediaId);
  });

  it('handles trademark/numeral/colon title variance via the shared comparison key', async () => {
    const results = await gameMatching.data.catalogMatch({}, [
      { queryId: 'gog:2', title: 'BioShock II' },
      { queryId: 'steam:2', title: 'BioShock 2' },
      { queryId: 'epic:r', title: 'Rocket League™' },
      { queryId: 'steam:r', title: 'Rocket League' },
    ]) as MatchEntry[];
    const byId = new Map(results.map((r) => [r.queryId, r.candidate?.mediaId]));
    expect(byId.get('gog:2')).toBe(byId.get('steam:2'));
    expect(byId.get('epic:r')).toBe(byId.get('steam:r'));
    expect(byId.get('gog:2')).not.toBe(byId.get('epic:r'));
  });

  it('returns a null candidate for empty titles', async () => {
    const candidate = await match({ queryId: 'x:1', title: '' });
    expect(candidate).toBeNull();
  });

  it('exports a passing test()', async () => {
    const result = await gameMatching.data.test();
    expect(result.passed).toBe(true);
  });

  it('the shared comparison-key port agrees with the desktop implementation', () => {
    const shared = require(`${PLUGINS_DIR}/shared/catalog.js`);
    for (const title of [
      'Rocket League™', 'BioShock II', 'The Witcher 3: Wild Hunt',
      'Sekiro: Shadows Die Twice', 'Star Wars Battlefront II', 'Hades',
    ]) {
      expect(shared.comparisonKey(title)).toBe(desktopKey(title));
    }
  });
});
