import { describe, it, expect } from 'vitest';
import {
  buildCatalogRequests,
  normalizeCatalogResponse,
} from '../catalog-match';
import type { CatalogMatchRequest } from '../catalog-match';

const req = (overrides: Partial<CatalogMatchRequest> = {}): CatalogMatchRequest => ({
  queryId: 'epic:Jaguar',
  title: 'Rocket League™',
  platform: 'epic',
  externalIds: [{ source: 'epic', id: 'Jaguar' }],
  ...overrides,
});

describe('buildCatalogRequests', () => {
  it('builds aligned requests from scanned games', () => {
    const requests = buildCatalogRequests([
      { id: 'Jaguar', title: 'Rocket League™', platform: 'epic', externalIds: [{ source: 'epic', id: 'Jaguar' }], developer: 'Psyonix' },
      { id: '252950', title: 'Portal 2', platform: 'steam' },
    ]);

    expect(requests).toHaveLength(2);
    expect(requests[0].queryId).toBe('epic:Jaguar');
    expect(requests[0].title).toBe('Rocket League™');
    expect(requests[0].developer).toBe('Psyonix');
    // Falls back to a platform:id external id when the game carries none
    expect(requests[1].externalIds).toEqual([{ source: 'steam', id: '252950' }]);
  });
});

describe('normalizeCatalogResponse', () => {
  it('maps aligned bare candidates by request queryId', () => {
    const requests = [req(), req({ queryId: 'steam:252950', title: 'Rocket League' })];
    const response = [
      { mediaId: 'catalog:rocket-league', title: 'Rocket League', confidence: 0.95 },
      { mediaId: 'catalog:portal-2', title: 'Portal 2' },
    ];

    const map = normalizeCatalogResponse(response, requests, 'game-matching-pipeline');
    expect(map.size).toBe(2);
    expect(map.get('epic:Jaguar')).toMatchObject({
      mediaId: 'catalog:rocket-league',
      title: 'Rocket League',
      confidence: 0.95,
      sourcePlugin: 'game-matching-pipeline',
    });
    expect(map.get('steam:252950')?.mediaId).toBe('catalog:portal-2');
  });

  it('honours an explicit queryId on a wrapped entry', () => {
    const requests = [req()];
    const response = [{ queryId: 'steam:999', candidate: { mediaId: 'catalog:x', title: 'X' } }];

    const map = normalizeCatalogResponse(response, requests, 'p');
    expect(map.has('epic:Jaguar')).toBe(false);
    expect(map.get('steam:999')?.mediaId).toBe('catalog:x');
  });

  it('skips nulls and entries without a usable mediaId/title', () => {
    const requests = [req(), req({ queryId: 'steam:1' }), req({ queryId: 'gog:2' })];
    const response = [
      null,
      { mediaId: '', title: 'Bad' },
      { mediaId: 'catalog:ok', title: 'Ok' },
    ];

    const map = normalizeCatalogResponse(response, requests, 'p');
    expect(map.size).toBe(1);
    expect(map.get('gog:2')?.mediaId).toBe('catalog:ok');
  });

  it('keeps the first candidate for a duplicate queryId (earlier plugin wins)', () => {
    const requests = [req()];
    const response = [
      { queryId: 'epic:Jaguar', candidate: { mediaId: 'catalog:a', title: 'A' } },
      { queryId: 'epic:Jaguar', candidate: { mediaId: 'catalog:b', title: 'B' } },
    ];

    const map = normalizeCatalogResponse(response, requests, 'p');
    expect(map.get('epic:Jaguar')?.mediaId).toBe('catalog:a');
  });

  it('returns an empty map for non-array responses', () => {
    const map = normalizeCatalogResponse(undefined, [req()], 'p');
    expect(map.size).toBe(0);
  });
});
