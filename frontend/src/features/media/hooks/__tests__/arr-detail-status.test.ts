import { describe, it, expect } from 'vitest'
import {
  arrRequestErrorMessage,
  fileFromRadarrLookup,
  isArrMediaType,
  lookupTmdbTerm,
  makeServerArrInstanceId,
  matchArrQueueItem,
  matchLookupByTmdb,
  matchLookupByTvdbOrTmdb,
  parseServerArrInstanceId,
  queueProgress,
  radarrStatusFromLookup,
  sonarrStatusFromLookup,
  yearFromReleaseDate,
} from '../arr-detail-status'
import { readyArrInstances } from '@/features/downloads/arr-instances'

describe('arr detail helpers', () => {
  it('only treats movie and show as arr media', () => {
    expect(isArrMediaType('movie')).toBe(true)
    expect(isArrMediaType('show')).toBe(true)
    expect(isArrMediaType('tv')).toBe(false)
    expect(isArrMediaType('game')).toBe(false)
  })

  it('parses a year from a release date', () => {
    expect(yearFromReleaseDate('2010-07-16')).toBe(2010)
    expect(yearFromReleaseDate(null)).toBeUndefined()
  })

  it('matches Radarr/Sonarr lookup rows by TMDB id', () => {
    const match = matchLookupByTmdb(
      [
        { title: 'Other', tmdbId: 1 },
        { title: 'Inception', tmdbId: 27205, id: 10, hasFile: true },
      ],
      '27205',
    )
    expect(match?.title).toBe('Inception')
    expect(lookupTmdbTerm(27205)).toBe('tmdb:27205')
  })

  it('matches Sonarr lookup rows by TVDB id before falling back to TMDB', () => {
    const rows = [
      { title: 'Wrong Show', tvdbId: 99999, tmdbId: 255064 },
      { title: 'The Darwin Incident', tvdbId: 450282, tmdbId: null },
    ]
    const byTvdb = matchLookupByTvdbOrTmdb(rows, '450282', '255064')
    expect(byTvdb?.title).toBe('The Darwin Incident')

    const byTmdb = matchLookupByTvdbOrTmdb(rows, null, '255064')
    expect(byTmdb?.title).toBe('Wrong Show')
  })

  it('maps Radarr lookup status from library id and hasFile', () => {
    expect(radarrStatusFromLookup(null)).toBe('not_exists')
    expect(radarrStatusFromLookup({ id: 0, hasFile: false })).toBe('not_exists')
    expect(radarrStatusFromLookup({ id: 12, hasFile: false })).toBe('requested')
    expect(radarrStatusFromLookup({ id: 12, hasFile: true })).toBe('downloaded')
  })

  it('maps Sonarr lookup status from episode files', () => {
    expect(sonarrStatusFromLookup({ id: 4, statistics: { episodeFileCount: 0 } })).toBe('requested')
    expect(sonarrStatusFromLookup({ id: 4, statistics: { episodeFileCount: 8 } })).toBe('downloaded')
  })

  it('reads Radarr file details from movieFile', () => {
    const file = fileFromRadarrLookup({
      movieFile: {
        relativePath: 'Inception.mkv',
        size: 20_000_000_000,
        quality: { quality: { name: 'Bluray-1080p' } },
        mediaInfo: { videoCodec: 'x264', audioCodec: 'DTS' },
      },
    })
    expect(file?.quality).toBe('Bluray-1080p')
    expect(file?.video).toBe('x264')
    expect(file?.name).toBe('Inception.mkv')
  })

  it('matches queue items by TMDB id and computes progress', () => {
    const item = matchArrQueueItem(
      [
        { id: 1, title: 'Other', status: 'downloading', size: 100, tmdbId: 1 },
        { id: 2, title: 'Inception', status: 'downloading', size: 100, sizeLeft: 25, tmdbId: 27205 },
      ],
      { tmdbId: 27205 },
    )
    expect(item?.id).toBe(2)
    expect(queueProgress(item)).toBe(75)
  })

  it('parses server instance ids and axios error details', () => {
    expect(makeServerArrInstanceId(3, '4k')).toBe('3:4k')
    expect(parseServerArrInstanceId('3:4k')).toEqual({ serverId: 3, arrInstanceId: '4k' })
    expect(
      arrRequestErrorMessage({ response: { data: { detail: 'No root folder path configured' } } }),
    ).toBe('No root folder path configured')
  })
})

describe('readyArrInstances', () => {
  it('returns enabled instances when Radarr is configured', () => {
    const ready = readyArrInstances(
      {
        enabled: true,
        configured: true,
        hasApiKey: true,
        host: '127.0.0.1',
        port: 7878,
        instances: [
          { id: 'main', name: 'Main', enabled: true, host: '127.0.0.1', port: 7878, hasApiKey: true },
          { id: 'off', name: 'Off', enabled: false, host: '127.0.0.1', port: 7878, hasApiKey: true },
        ],
      },
      7878,
    )
    expect(ready).toHaveLength(1)
    expect(ready[0].id).toBe('main')
  })

  it('hides the request action when Arr is not configured', () => {
    expect(
      readyArrInstances({ enabled: false, configured: false, host: '127.0.0.1', port: 7878 }, 7878),
    ).toHaveLength(0)
  })
})
