import { describe, expect, it } from 'vitest'
import { mediaKeys } from './media-keys'
import { mediaQueries } from './media-queries'

describe('mediaQueries.detail', () => {
  it('uses one cache key so hero, page, and card prefetch share the same request', () => {
    expect(mediaQueries.detail('movie', '42').queryKey).toEqual(mediaKeys.detail('movie', '42'))
    expect(mediaQueries.detail('movie', '42').queryKey).toEqual(['media', 'detail', 'movie', '42'])
  })
})
