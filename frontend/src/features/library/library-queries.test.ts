import { describe, expect, it } from 'vitest'

import { getSpotifyLikedTracksNextPageParam, type SpotifyLikedTracks } from './library-queries'

function likedTracksPage(overrides: Partial<SpotifyLikedTracks>): SpotifyLikedTracks {
  return {
    tracks: [],
    total: 0,
    nextOffset: null,
    hasMore: false,
    ...overrides,
  }
}

describe('Spotify liked tracks pagination', () => {
  it('uses the API next offset instead of the renderable track count', () => {
    const nextPage = getSpotifyLikedTracksNextPageParam(likedTracksPage({
      tracks: Array.from({ length: 49 }, (_, index) => ({
        id: `track-${index}`,
        name: `Track ${index}`,
        artist: 'Artist',
        albumName: 'Album',
        albumArt: null,
        durationMs: null,
        uri: `spotify:track:${index}`,
        previewUrl: null,
      })),
      total: 120,
      nextOffset: 50,
      hasMore: true,
    }))

    expect(nextPage).toBe(50)
  })

  it('continues when the API derives more pages from total count', () => {
    expect(getSpotifyLikedTracksNextPageParam(likedTracksPage({
      total: 120,
      nextOffset: 100,
      hasMore: true,
    }))).toBe(100)
  })

  it('stops when the API has no next offset', () => {
    expect(getSpotifyLikedTracksNextPageParam(likedTracksPage({ nextOffset: null }))).toBeUndefined()
  })
})
