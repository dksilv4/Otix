import { describe, it, expect, vi } from 'vitest'
import {
  fetchSeedRaw,
  isMirrorable,
  usableCapability,
  GAME_HYDRATION_FIELDS,
} from '../providers'
import type { HttpRequestOptions, HttpResponse } from '../types'

/** Records every request and answers from a URL-keyed route table. */
function fakeTransport(routes: Record<string, (req: HttpRequestOptions) => HttpResponse>) {
  const calls: HttpRequestOptions[] = []
  const transport = vi.fn(async (req: HttpRequestOptions): Promise<HttpResponse> => {
    calls.push(req)
    const match = Object.keys(routes).find((key) => req.url.includes(key))
    if (!match) throw new Error(`no route for ${req.url}`)
    return routes[match](req)
  })
  return { transport, calls }
}

const json = (body: unknown, status = 200): HttpResponse => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('usableCapability / isMirrorable', () => {
  it('keeps only providers with a usable key', () => {
    const cap = usableCapability({
      tmdb: { token: 't' },
      igdb: { client_id: 'c', client_secret: 's' },
      fanart: { key: 'x' }, // not mirrored
    })
    expect(cap.providers).toEqual(['tmdb', 'igdb'])
    expect(cap.provider_keys.igdb).toEqual({ client_id: 'c', client_secret: 's' })
  })

  it('accepts a tmdb api_key fallback but requires both igdb fields', () => {
    expect(isMirrorable('tmdb', { tmdb: { api_key: 'k' } })).toBe(true)
    expect(isMirrorable('tmdb', { tmdb: {} })).toBe(false)
    expect(isMirrorable('igdb', { igdb: { client_id: 'c' } })).toBe(false)
    expect(isMirrorable('igdb', { igdb: { client_id: 'c', client_secret: 's' } })).toBe(true)
    expect(isMirrorable('fanart', { fanart: { key: 'x' } })).toBe(false)
  })

  it('returns empty capability for no keys', () => {
    const cap = usableCapability({})
    expect(cap.providers).toEqual([])
    expect(cap.provider_keys).toEqual({})
  })
})

describe('tmdb mirror', () => {
  it('fetches an appended movie detail with a Bearer token', async () => {
    const detail = { id: 550, title: 'Fight Club', poster_path: '/p.jpg' }
    const { transport, calls } = fakeTransport({
      'api.themoviedb.org': () => json(detail),
    })
    const raw = await fetchSeedRaw(transport, {
      task_id: '1',
      provider: 'tmdb',
      entity_type: 'movie',
      external_id: '550',
    }, { tmdb: { token: 'tok' } })

    expect(raw).toEqual(detail)
    const req = calls.find((c) => c.method === 'GET')
    expect(req).toBeDefined()
    const query = new URL(req!.url).searchParams
    expect(req!.url).toContain('/3/movie/550')
    expect(query.get('language')).toBe('en-US')
    expect(query.get('append_to_response')).toBe(
      'credits,external_ids,images,videos,release_dates,keywords',
    )
    expect(req!.headers!.Authorization).toBe('Bearer tok')
    expect(query.has('api_key')).toBe(false)
  })

  it('uses the show path + append list and api_key fallback when no token', async () => {
    const detail = { id: 1396, name: 'Breaking Bad' }
    const { transport, calls } = fakeTransport({
      'api.themoviedb.org': () => json(detail),
    })
    const raw = await fetchSeedRaw(transport, {
      task_id: '2', provider: 'tmdb', entity_type: 'show', external_id: '1396',
    }, { tmdb: { api_key: 'v3key' } })
    expect(raw).toEqual(detail)
    const req = calls.find((c) => c.method === 'GET')
    const query = new URL(req!.url).searchParams
    expect(req!.url).toContain('/3/tv/1396')
    expect(query.get('append_to_response')).toBe(
      'credits,external_ids,images,videos,keywords,seasons,content_ratings',
    )
    expect(query.get('api_key')).toBe('v3key')
    expect(req!.headers!.Authorization).toBeUndefined()
  })

  it('throws on a non-200 TMDB response', async () => {
    const { transport } = fakeTransport({ 'api.themoviedb.org': () => json({}, 404) })
    await expect(
      fetchSeedRaw(transport, {
        task_id: '1', provider: 'tmdb', entity_type: 'movie', external_id: '1',
      }, { tmdb: { token: 'tok' } }),
    ).rejects.toThrow(/HTTP 404/)
  })
})

describe('igdb mirror', () => {
  const keys = { igdb: { client_id: 'cid', client_secret: 'sec' } }
  const gameBody = {
    id: 42,
    name: 'Hollow Knight',
    cover: { image_id: 'co1' },
    age_ratings: [1, 2],
  }
  const ageRows = [
    { id: 1, organization: 2, rating_category: 1 },
    { id: 2, organization: 2, rating_category: 11 },
  ]

  it('resolves the twitch token, hydration game, and age-rating details', async () => {
    const { transport, calls } = fakeTransport({
      'id.twitch.tv': () => json({ access_token: 'tw-tok' }),
      '/games': () => json([gameBody]),
      '/age_ratings': () => json(ageRows),
    })
    const raw = await fetchSeedRaw(transport, {
      task_id: '9', provider: 'igdb', entity_type: 'game', external_id: '42',
    }, keys)

    const tokenCall = calls.find((c) => c.url.includes('id.twitch.tv'))
    expect(tokenCall!.headers!['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(tokenCall!.body).toContain('client_id=cid')
    expect(tokenCall!.body).toContain('grant_type=client_credentials')

    const gamesCall = calls.find((c) => c.url.endsWith('/games'))
    expect(gamesCall!.headers!['Client-ID']).toBe('cid')
    expect(gamesCall!.headers!.Authorization).toBe('Bearer tw-tok')
    expect(gamesCall!.body).toContain(GAME_HYDRATION_FIELDS)
    expect(gamesCall!.body).toContain('where id = (42)')

    const agesCall = calls.find((c) => c.url.endsWith('/age_ratings'))
    expect(agesCall!.body).toBe('fields organization,rating_category; where id = (1,2); limit 500;')

    expect(raw.id).toBe(42)
    expect(raw.age_rating_details).toEqual(ageRows)
  })

  it('skips the age-rating sub-fetch when the game has none', async () => {
    const { transport, calls } = fakeTransport({
      'id.twitch.tv': () => json({ access_token: 'tw-tok' }),
      '/games': () => json([{ id: 7, name: 'No Ages', cover: null }]),
    })
    const raw = await fetchSeedRaw(transport, {
      task_id: '10', provider: 'igdb', entity_type: 'game', external_id: '7',
    }, keys)
    expect(raw.name).toBe('No Ages')
    expect(raw.age_rating_details).toBeUndefined()
    expect(calls.some((c) => c.url.endsWith('/age_ratings'))).toBe(false)
  })

  it('throws when IGDB returns no game', async () => {
    const { transport } = fakeTransport({
      'id.twitch.tv': () => json({ access_token: 'tw-tok' }),
      '/games': () => json([]),
    })
    await expect(
      fetchSeedRaw(transport, {
        task_id: '11', provider: 'igdb', entity_type: 'game', external_id: '99999',
      }, keys),
    ).rejects.toThrow(/no game/)
  })

  it('throws when igdb keys are absent', async () => {
    const { transport } = fakeTransport({})
    await expect(
      fetchSeedRaw(transport, {
        task_id: '12', provider: 'igdb', entity_type: 'game', external_id: '1',
      }, {}),
    ).rejects.toThrow(/no usable igdb key/)
  })
})

describe('dispatch', () => {
  it('rejects an unmirrored provider before any request', async () => {
    const { transport, calls } = fakeTransport({})
    await expect(
      fetchSeedRaw(transport, {
        task_id: '13', provider: 'musicbrainz', entity_type: 'album', external_id: '1',
      }, {}),
    ).rejects.toThrow(/no proxy-fetch mirror/)
    expect(calls).toHaveLength(0)
  })
})
