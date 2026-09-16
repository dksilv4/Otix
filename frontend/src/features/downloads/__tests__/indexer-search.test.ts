import { describe, it, expect } from 'vitest'
import { usenetKeys } from '../use-server-usenet'
import { normalizeProwlarrRelease, sortReleasesByQuality } from '../usenet-utils'
import type { ServerProwlarrRelease } from '../usenet-types'

describe('indexer search wiring', () => {
  it('scopes Prowlarr search results by server and game query', () => {
    expect(usenetKeys.search(7, 'Hollow Knight')).toEqual([
      'server-usenet',
      7,
      'search',
      'Hollow Knight',
    ])
  })

  it('keeps magnet-only and URL-less indexer hits in the results list', () => {
    const releases: ServerProwlarrRelease[] = [
      {
        guid: 'magnet-1',
        title: 'Hades.II-RUNE',
        size: 12_000_000_000,
        download_url: 'magnet:?xt=urn:btih:abc',
        indexer: '1337x',
        protocol: 'torrent',
        age_days: 1,
        seeders: 40,
      },
      {
        guid: 'listed-2',
        title: 'Hades.II-GOG',
        size: 18_000_000_000,
        download_url: '',
        indexer: 'NZBGeek',
        protocol: 'usenet',
        age_days: 3,
      },
    ]

    const sorted = sortReleasesByQuality(releases)
    expect(sorted).toHaveLength(2)
    expect(sorted.map((r) => r.guid)).toEqual(['magnet-1', 'listed-2'])
  })

  it('maps camelCase axios interceptor payloads onto download_url', () => {
    const parsed = normalizeProwlarrRelease({
      guid: 'nzb-1',
      title: 'Kingdom Come Deliverance II',
      size: 80_000_000_000,
      downloadUrl: 'https://prowlarr.local/download/1',
      infoUrl: 'https://indexer.example/details/1',
      indexer: 'NZBGeek',
      protocol: 'usenet',
      ageDays: 2,
      seeders: 12,
    })
    expect(parsed).not.toBeNull()
    expect(parsed?.download_url).toBe('https://prowlarr.local/download/1')
    expect(parsed?.info_url).toBe('https://indexer.example/details/1')
    expect(parsed?.age_days).toBe(2)
  })
})
