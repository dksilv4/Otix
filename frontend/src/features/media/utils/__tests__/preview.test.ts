import { describe, it, expect, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { findMediaPreview } from '../preview'
import { mediaQueries } from '../../queries/media-queries'

describe('findMediaPreview', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '')
    }
  })

  it('returns null when mediaId is empty', () => {
    expect(findMediaPreview(queryClient, 'movie', '')).toBeNull()
  })

  it('finds preview data directly from cached detail query', () => {
    queryClient.setQueryData(mediaQueries.detail('movie', '101').queryKey, {
      id: '101',
      title: 'Interstellar',
      logoUrl: 'https://example.com/interstellar-logo.png',
      logoColorGuess: 'guess_white',
      backdropUrl: 'https://example.com/interstellar-backdrop.jpg',
      posterUrl: 'https://example.com/interstellar-poster.jpg',
      releaseDate: '2014-11-07',
    })

    const preview = findMediaPreview(queryClient, 'movie', '101')
    expect(preview).toEqual({
      title: 'Interstellar',
      logoUrl: 'https://example.com/interstellar-logo.png',
      logoColorGuess: 'guess_white',
      backdropUrl: 'https://example.com/interstellar-backdrop.jpg',
      posterUrl: 'https://example.com/interstellar-poster.jpg',
      releaseDate: '2014-11-07',
    })
  })

  it('finds preview data from navigation history state', () => {
    window.history.replaceState(
      {
        usr: {
          preview: {
            title: 'Cyberpunk 2077',
            logoUrl: 'https://example.com/cp2077-logo.png',
            logoColorGuess: 'guess_yellow',
            backdropUrl: 'https://example.com/cp2077-backdrop.jpg',
            posterUrl: 'https://example.com/cp2077-poster.jpg',
          },
        },
      },
      '',
    )

    const preview = findMediaPreview(queryClient, 'game', 'cyberpunk-2077')
    expect(preview).toEqual({
      title: 'Cyberpunk 2077',
      logoUrl: 'https://example.com/cp2077-logo.png',
      logoColorGuess: 'guess_yellow',
      backdropUrl: 'https://example.com/cp2077-backdrop.jpg',
      posterUrl: 'https://example.com/cp2077-poster.jpg',
    })
  })

  it('finds preview data from a generic feed query in query cache', () => {
    queryClient.setQueryData(['discover', 'trending'], {
      items: [
        {
          id: '202',
          slug: 'arcane',
          title: 'Arcane',
          logoUrl: 'https://example.com/arcane-logo.png',
          logoColorGuess: 'guess_blue',
          backdropUrl: 'https://example.com/arcane-backdrop.jpg',
          posterUrl: 'https://example.com/arcane-poster.jpg',
          releaseDate: '2021-11-06',
        },
      ],
    })

    const previewById = findMediaPreview(queryClient, 'show', '202')
    expect(previewById).toEqual({
      title: 'Arcane',
      logoUrl: 'https://example.com/arcane-logo.png',
      logoColorGuess: 'guess_blue',
      backdropUrl: 'https://example.com/arcane-backdrop.jpg',
      posterUrl: 'https://example.com/arcane-poster.jpg',
      releaseDate: '2021-11-06',
    })

    const previewBySlug = findMediaPreview(queryClient, 'show', 'arcane')
    expect(previewBySlug).toEqual({
      title: 'Arcane',
      logoUrl: 'https://example.com/arcane-logo.png',
      logoColorGuess: 'guess_blue',
      backdropUrl: 'https://example.com/arcane-backdrop.jpg',
      posterUrl: 'https://example.com/arcane-poster.jpg',
      releaseDate: '2021-11-06',
    })
  })

  it('returns null when item is not in cache or state', () => {
    expect(findMediaPreview(queryClient, 'movie', '999999')).toBeNull()
  })
})
