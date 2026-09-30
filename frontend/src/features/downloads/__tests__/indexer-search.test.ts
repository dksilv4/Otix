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

  it('matches downloader active queue items and completed history to releases', async () => {
    const { findReleaseQueueItem, findReleaseHistoryItem } = await import(
      '../molecules/node-game-search-modal'
    )

    const release: ServerProwlarrRelease = {
      guid: 'release-transport-fever-2',
      title: 'Transport.Fever.2.MULTi10-ElAmigos',
      size: 15_000_000_000,
      download_url: 'https://nzbplanet.net/getnzb/123',
      indexer: 'NzbPlanet',
      protocol: 'usenet',
    }

    const queueItems = [
      {
        nzo_id: 'SABnzbd_nzo_abc123',
        filename: 'Transport Fever 2 MULTi10 ElAmigos',
        percentage: 42.5,
        size_mb: 15000,
        size_left_mb: 8625,
        speed: '18.4 MB/s',
        time_left: '7m 45s',
        status: 'Downloading',
      },
    ]

    // Match by cleaned title
    const matchedByTitle = findReleaseQueueItem(release, queueItems)
    expect(matchedByTitle).not.toBeNull()
    expect(matchedByTitle?.nzo_id).toBe('SABnzbd_nzo_abc123')
    expect(matchedByTitle?.percentage).toBe(42.5)
    expect(matchedByTitle?.speed).toBe('18.4 MB/s')

    // Match by direct tracked nzo_id
    const matchedByNzo = findReleaseQueueItem(release, queueItems, 'SABnzbd_nzo_abc123')
    expect(matchedByNzo?.nzo_id).toBe('SABnzbd_nzo_abc123')

    // History match
    const historyItems = [
      {
        id: 1,
        nzo_id: 'SABnzbd_nzo_completed',
        title: 'Transport.Fever.2.MULTi10-ElAmigos',
        protocol: 'usenet',
        status: 'completed',
        percentage: 100,
        size_bytes: 15_000_000_000,
      },
    ]
    const matchedHistory = findReleaseHistoryItem(release, historyItems)
    expect(matchedHistory).not.toBeNull()
    expect(matchedHistory?.status).toBe('completed')
  })

  it('generates alternate numeral queries between Arabic and Roman numerals', async () => {
    const { getAlternateNumeralQuery } = await import('../hooks/use-node-usenet')

    expect(getAlternateNumeralQuery('Little Nightmares 3')).toBe('Little Nightmares III')
    expect(getAlternateNumeralQuery('Little Nightmares III')).toBe('Little Nightmares 3')
    expect(getAlternateNumeralQuery('Hades 2')).toBe('Hades II')
    expect(getAlternateNumeralQuery('Grand Theft Auto IV')).toBe('Grand Theft Auto 4')
    expect(getAlternateNumeralQuery('No Numbers Here')).toBeNull()
  })
})
